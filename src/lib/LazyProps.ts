/**
 * @author [author]
 * @email [example@mail.com]
 * @create date 2021-08-20 14:50:12
 * @modify date 2021-08-20 14:50:12
 * @desc [生成响应式的prop]
 */
import { result } from 'lodash';
import { Raw, Lazyable } from './Lazyable';
import { IFunctionalValue, IJSXProperty } from './types';
import LazyTask from './LazyTask';
import { renderChildren } from './helper';
export default class LazyProp {
    private tasks = new Map<string, LazyTask>();

    private mainTask?: LazyTask<Map<number, Record<string, any>>>;
    private MyProp: Record<string, any> = Lazyable({});

    private propertyPositions = new Map<string, number[]>();

    private init() {
        this.mainTask = new LazyTask(
            (o) => {
                if (this.children) {
                    this.propertyPositions.set('children', [-1]);
                }
                for (let i = 0; i < this.props.length; i++) {
                    const prop = this.props[i];
                    if (prop.type === 'normal') {
                        if (!this.propertyPositions.has(prop.name)) {
                            this.propertyPositions.set(prop.name, []);
                        }
                        this.propertyPositions.get(prop.name)?.push(i);
                    } else {
                        // 对于解构对象 要特殊处理
                        o?.addSubTask(
                            new LazyTask(
                                (so) => {
                                    // 第一次执行 记录下rest的值，同时记录所有的属性
                                    // 记录属性的位置
                                    if (so?.time === 1) {
                                        const restData = prop.value();
                                        // 存下数据 在需要的时候用到
                                        o?.getData?.()?.set(i, restData);
                                        for (let property in restData) {
                                            // 记录所有的属性 当这个rest发生变动后 需要进行增删操作
                                            so?.getData?.()?.add(property);
                                            if (
                                                !this.propertyPositions.has(
                                                    property
                                                )
                                            ) {
                                                this.propertyPositions.set(
                                                    property,
                                                    []
                                                );
                                            }
                                            this.propertyPositions
                                                .get(property)
                                                ?.push(i);
                                        }
                                    } else {
                                        // rest的值发生了变化
                                        /**
                                         * 1. 重新计算rest的值
                                         * 2. 获取上个rest的所有的key
                                         * 3. 对比key 进行不同的操作
                                         * * 若key都存在 那要重新设置下任务(值变了，依赖可能变了嘛)
                                         * * 若新增的key 要找位置插入
                                         * * 若删除key  要移除
                                         */
                                        const restData = prop.value();
                                        const lastKeys = so?.getData?.();
                                        const newKeys = new Set(
                                            Object.keys(Raw(restData))
                                        );
                                        so?.setData?.(newKeys);
                                        newKeys.forEach((key) => {
                                            if (lastKeys?.has(key)) {
                                                // 以前有这个值，不仅有 还是激活状态 那要改下
                                                const indexes =
                                                    this.propertyPositions.get(
                                                        key
                                                    );
                                                if (
                                                    indexes &&
                                                    indexes[
                                                        indexes.length - 1
                                                    ] === i
                                                ) {
                                                    this.setTask(key);
                                                }
                                                // 删掉，看看最后还剩哪些 这些都要移除
                                                lastKeys.delete(key);
                                            } else {
                                                // 不存在 是个新增的属性
                                                // 新增的属性在最后
                                                if (this.addTaskIndex(key, i)) {
                                                    this.setTask(key);
                                                }
                                            }
                                        });
                                        // 删除的key要处理
                                        lastKeys?.forEach((key) =>
                                            this.removeTaskIndex(key, i)
                                        );
                                        lastKeys?.clear();
                                    }
                                },
                                { data: new Set<string>() }
                            )
                        );
                    }
                }
                // 遍历一遍后 任务还没开始
                this.propertyPositions.forEach((indexes, prop) => {
                    this.setTask(prop);
                });
                return () => o?.getData?.()?.clear(); // 清空数据
            },
            { data: new Map<number, Record<string, any>>() }
        );
    }
    private removeTaskIndex(property: string, index: number) {
        const indexes = this.propertyPositions.get(property);
        if (indexes && indexes.length > 0) {
            // 是最后一个
            if (indexes[indexes.length - 1] === index) {
                this.tasks.get(property)?.stop();
                this.tasks.delete(property);
                indexes.pop();
                if (indexes.length > 0) {
                    this.setTask(property);
                } else {
                    delete this.MyProp[property];
                }
            } else {
                // 不是最后一个 直接找到后删除
                const position = indexes.indexOf(index);
                indexes.splice(position, 1);
            }
        }
    }
    // 加入新的索引(在已有的逻辑中，走到这里，说明原列表中肯定没有这个索引)
    private addTaskIndex(property: string, index: number) {
        const indexes = this.propertyPositions.get(property);
        if (indexes && indexes.length > 0) {
            if (indexes[indexes.length - 1] < index) {
                indexes.push(index);
                return true;
            }
            for (let i = 0; i < indexes.length - 1; i++) {
                if (indexes[i] >= index) {
                    indexes.splice(i, 0, index);
                    break;
                }
            }
            return false;
        } else {
            this.propertyPositions.set(property, [index]);
            return true;
        }
    }
    // 设置任务  需要特殊处理的是children属性
    private setTask(property: string) {
        const indexes = this.propertyPositions.get(property);
        if (indexes && indexes.length > 0) {
            // 先停止这个任务 当然这个任务也可能是不存在的
            this.tasks.get(property)?.stop();
            // 接着开启新任务
            const lastIndex = indexes[indexes.length - 1];
            // 是children
            if (property === 'children' && lastIndex < 0) {
                this.tasks.set(
                    property,
                    new LazyTask((o) => {
                        const { result, tasks } = renderChildren(
                            this.children!
                        );
                        this.MyProp[property] = result;
                        tasks.forEach((t) => o?.addSubTask(t));
                    })
                );
            } else if (this.props[lastIndex].type === 'normal') {
                this.tasks.set(
                    property,
                    new LazyTask(() => {
                        this.MyProp[property] = this.props[lastIndex].value();
                    })
                );
            } else {
                const restData = this.mainTask?.getData()?.get(lastIndex);
                if (restData) {
                    this.tasks.set(
                        property,
                        new LazyTask(() => {
                            if (!restData.hasOwnProperty(property)) {
                                // 这表示这个属性被删了
                                this.removeTaskIndex(property, lastIndex);
                            } else {
                                this.MyProp[property] = restData[property];
                            }
                        })
                    );
                }
            }
        }
    }
    constructor(
        public props: IJSXProperty[],
        // 组件的子节点
        public children?: IFunctionalValue[]
    ) {
        this.init();
    }
    stop() {
        this.tasks.forEach((t) => t.stop());
        this.tasks.clear();
        this.mainTask?.stop();
    }
    getProp(): Record<string, any> {
        return new Proxy(this.MyProp, {
            get(t, k, r) {
                return Reflect.get(t, k, r);
            },
            set() {
                throw new Error('prop not allowed to set value');
            },
        });
    }
}
