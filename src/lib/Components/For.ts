import {
    ILazyResult,
    VoidOrVoidFunction,
    FormattedILazyResult,
} from '../types';
import { useCtx } from '../VirtualElement';
import LazyTask from '../LazyTask';
import { Lazyable, Raw, transformLazyable } from '../Lazyable';
import {
    FOR_RESULT_FLAG,
    formatResult,
    getPosition,
    renderResult,
    insertIntoResults,
    unmountResult,
} from '../helper';
import LazyDocument from '../Document';

/**
 * 列表展示的方案
 * !! 有一种特殊情况就是当数组为空的情况
 * 不直接使用map等，避免复杂的逻辑和计算
 * @param props
 */
export type IForRenderOption<M extends Record<string, any> = {}, K = any> = {
    value: K;
    index: number;
} & M;

export function For<M extends Record<string, any> = {}, T = any>(
    props: {
        data: T[];
        render: (option: IForRenderOption<M, T>) => ILazyResult;
    },
    ctx = useCtx({
        result: new Proxy([] as FormattedILazyResult[], {
            get(t, k, r) {
                if (k === FOR_RESULT_FLAG) return true;
                return Reflect.get(t, k, r);
            },
        }),
        lifeCycle: {
            beforeCreate() {
                let array: ArrayItemTaskData<T>[] = [];
                const task = new LazyTask((o) => {
                    // 不需要监听lenght属性词 否则数组长度一旦变更就出问题了~
                    for (let i = 0; i < Raw(props).data.length; i++) {
                        const item = new ArrayItemTaskData(
                            props.data,
                            i,
                            props.render
                        );
                        array.push(item);
                        this.result.push(item.getResult()!);
                    }
                    const unsub = syncArrayChange(
                        props.data,
                        array,
                        props.render,
                        this.result
                    );
                    // data变化时 要对原数据处理
                    return () => {
                        // 清除自动渲染的任务
                        array.forEach((i) => i.stop());
                        // 清除数组同步的任务
                        unsub?.();
                        // 清空结果
                        array = [];
                        this.result = new Proxy([], {
                            get(t, k, r) {
                                if (k === FOR_RESULT_FLAG) return true;
                                return Reflect.get(t, k, r);
                            },
                        });
                    };
                });
                // 组件销毁的时候要停止这些任务
                return () => {
                    task.stop();
                    // 销毁组件的逻辑不需要这里操心
                    array.forEach((t) => t.stop());
                };
            },
        },
    })
) {
    return ctx.result;
}

export class ArrayItemTaskData<T> {
    private valueTask?: LazyTask;
    private renderTask?: LazyTask;
    private result?: FormattedILazyResult;
    private positionData = Lazyable({ value: undefined as T | undefined });
    indexData = Lazyable({ value: undefined as number | undefined });
    private init() {
        // 这是一个占位
        if (this.index === -1) {
            this.result = LazyDocument.createTextElement('');
            return;
        }
        const me = this;
        Raw(this.indexData).value = this.index;
        this.valueTask = new LazyTask(() => {
            // 这个位置的值一旦发生了变化，对应的就去变更positionData，保证一致
            this.positionData.value = this.data[this.indexData.value!];
        });
        /**
         * 你很可能不会用到index
         * 在这种情况下 当数组内有插入新的数据 对应的index变化了 但是值其实并没有变化
         * 为了优化这种情况下的效率 可以让渲染对象只依赖于值而不是下标
         * 而依赖的值依赖下标 相当于做了一层缓冲区
         */
        this.renderTask = new LazyTask(() => {
            this.result = formatResult(
                this.render(
                    Lazyable({
                        get value() {
                            return me.positionData.value!;
                        },
                        get index() {
                            return me.indexData.value!;
                        },
                        set value(v) {
                            throw new Error('you can not redefine value!');
                        },
                        set index(v) {
                            throw new Error('you can not redefine index!');
                        },
                    })
                )
            );
        });
    }
    constructor(
        private data: T[],
        private index: number,
        private render: (option: IForRenderOption<any, T>) => ILazyResult
    ) {
        this.init();
    }
    getResult() {
        return this.result;
    }
    updateIndex(h: (o: number) => number) {
        this.indexData.value = h(Raw(this.indexData).value!);
    }
    stop() {
        this.valueTask?.stop();
        this.renderTask?.stop();
    }
}

/**
 * 同步两个数据 主要去同步可能会影响数组大小的方法 需要跟踪这些方法
 * push 数组的最后添加一个元素
 * pop 推出数组的最后一个元素
 * shift 删除第一个元素
 * unshift 从开头添加一个元素
 * sort排序
 * splice 从 index 处开始的零个或多个元素
 * reverse 颠倒数组中元素的顺序
 * @param data
 * @param syncs
 */

function syncArrayChange<T>(
    data: T[],
    syncs: ArrayItemTaskData<T>[],
    render: (option: IForRenderOption<any, T>) => ILazyResult,
    returnResult: FormattedILazyResult[]
): VoidOrVoidFunction {
    const raw = Raw(data);
    return transformLazyable((v, t, k) => {
        if (t === data) {
            switch (k) {
                case 'push':
                    return function (...args: T[]) {
                        const position = getPosition(returnResult);
                        const result = raw.push(...args);
                        args.forEach((arg) => {
                            const item = new ArrayItemTaskData(
                                data,
                                raw.length - 1,
                                render
                            );
                            syncs.push(item);
                            renderResult(item.getResult()!);
                            returnResult.push(item.getResult()!);
                            insertIntoResults(item.getResult()!, position);
                        });
                        return result;
                    };
                case 'pop':
                    return function () {
                        // 是个空数组了还做啥子
                        if (raw.length === 0) {
                            return raw.pop();
                        }
                        // 元数据执行pop
                        const result = raw.pop();
                        // 代理数据执行pop
                        const sync = syncs.pop();
                        // 停止代理数据的监听任务
                        sync?.stop();
                        // 渲染结果执行pop
                        const popResult = returnResult.pop();
                        // 卸载结果
                        const position = unmountResult(popResult!);
                        if (returnResult.length === 0) {
                            // 结果数组空了 别忘了补空 formatResult会自动补空
                            insertIntoResults(
                                renderResult(formatResult(returnResult)),
                                position
                            );
                        }
                        return result;
                    };
                case 'shift':
                    return function () {
                        if (raw.length === 0) {
                            return raw.shift();
                        }
                        const result = raw.shift();
                        const sync = syncs.shift();
                        sync?.stop();
                        // 渲染结果执行pop
                        const popResult = returnResult.shift();
                        syncs.forEach((sync) =>
                            sync.updateIndex((o) => {
                                return o - 1;
                            })
                        );
                        // 卸载结果
                        const position = unmountResult(popResult!);
                        if (returnResult.length === 0) {
                            // 结果数组空了 别忘了补空 formatResult会自动补空
                            insertIntoResults(
                                renderResult(formatResult(returnResult)),
                                position
                            );
                        }
                        return result;
                    };
                case 'unshift':
                    return function (...args: T[]) {
                        const position = getPosition(returnResult, false);
                        const result = raw.unshift(...args);

                        // 下个周期在更新下标
                        args.forEach((arg, index) => {
                            const item = new ArrayItemTaskData(
                                data,
                                index,
                                render
                            );
                            syncs.unshift(item);
                            renderResult(item.getResult()!);
                            returnResult.unshift(item.getResult()!);
                            insertIntoResults(item.getResult()!, position);
                        });
                        for (let i = args.length; i < syncs.length; i++) {
                            const sync = syncs[i];
                            sync.updateIndex((o) => o + args.length);
                        }
                        return result;
                    };
                    break;
                case 'sort':
                    return function () {};
                case 'splice':
                    return function (
                        index: number,
                        deleteSize: number,
                        ...inserts: T[]
                    ) {
                        const result = raw.splice(
                            index,
                            deleteSize,
                            ...inserts
                        );
                        // 删掉的元素
                        const deletedSize = result.length;
                        // 要在这个position这里插入新元素
                        const positionIndex = index + deletedSize;
                        const position =
                            positionIndex >= returnResult.length
                                ? getPosition(
                                      returnResult[returnResult.length - 1]
                                  )
                                : getPosition(
                                      returnResult[index + deletedSize],
                                      false
                                  );
                        const gap = inserts.length - deletedSize;
                        if (gap != 0) {
                            for (
                                let i = index + deletedSize;
                                i < syncs.length;
                                i++
                            ) {
                                syncs[i].updateIndex((o) => o + gap);
                            }
                        }
                        const newResults: FormattedILazyResult[] = [];
                        const newSyncs = inserts.map((insert, o) => {
                            const item = new ArrayItemTaskData(
                                data,
                                index + o,
                                render
                            );
                            const r = item.getResult()!;
                            renderResult(r);
                            insertIntoResults(r, position);
                            newResults.push(r);
                            return item;
                        });
                        const deletedSyncs = syncs.splice(
                            index,
                            deletedSize,
                            ...newSyncs
                        );
                        deletedSyncs.forEach((sync) => sync.stop());

                        const deletedResults = returnResult.splice(
                            index,
                            deletedSize,
                            ...newResults
                        );
                        const positions = deletedResults.map((r) =>
                            unmountResult(r)
                        );
                        if (returnResult.length === 0) {
                            // 结果数组空了 别忘了补空 formatResult会自动补空
                            insertIntoResults(
                                renderResult(formatResult(returnResult)),
                                positions[positions.length - 1]
                            );
                        }
                        return result;
                    };
                case 'reverse':
                    return function () {
                        const position = getPosition(returnResult);
                        const result = raw.reverse();
                        syncs.reverse();
                        for (let i = returnResult.length - 2; i >= 0; i--) {
                            insertIntoResults(returnResult[i], position);
                        }
                        // 结果也要翻转
                        returnResult.reverse();
                        // 别忘了下标
                        syncs.forEach((sync, index) =>
                            sync.updateIndex(() => index)
                        );
                        return result;
                    };
                case 'moveTo':
                    return function (from: number, to: number) {
                        const result = raw.moveTo(from, to);
                        // syncs.moveTo(from, to);
                        if (from > to) {
                            for (let i = to; i < from; i++) {
                                syncs[i].updateIndex((o) => o + 1);
                            }
                        } else {
                            for (let i = from + 1; i <= to; i++) {
                                syncs[i].updateIndex((o) => o - 1);
                            }
                        }
                        syncs[from].updateIndex(() => to);
                        syncs.moveTo(from, to);
                        const position = getPosition(
                            returnResult[to],
                            from < to
                        );
                        insertIntoResults(returnResult[from], position);
                        returnResult.moveTo(from, to);
                        return result;
                    };
                case 'exchange':
                    return function (i1: number, i2: number) {
                        const result = raw.exchange(i1, i2);
                        if (i1 !== i2) {
                            syncs[i1].updateIndex(() => i2);
                            syncs[i2].updateIndex(() => i1);
                            syncs.exchange(i1, i2);
                            const isI1Lower = i1 < i2;
                            const min = isI1Lower ? i1 : i2;
                            const max = isI1Lower ? i2 : i1;
                            const minPosition = getPosition(returnResult[min]);
                            const maxPosition = getPosition(returnResult[max]);
                            insertIntoResults(returnResult[min], maxPosition);
                            insertIntoResults(returnResult[max], minPosition);
                            returnResult.exchange(i1, i2);
                        }
                        return result;
                    };
            }
            return v;
        }
        return v;
    });
}

For.moveTo = moveTo;
For.exchange = exchange;
declare global {
    interface Array<T> {
        moveTo: (from: number, to: number) => boolean;
        exchange: (i1: number, i2: number) => boolean;
    }
}

export function moveTo<T>(arr: T[], from: number, to: number) {
    return arr.moveTo(from, to);
}
export function exchange<T>(arr: T[], i1: number, i2: number) {
    return arr.exchange(i1, i2);
}
Array.prototype.moveTo = function (from: number, to: number) {
    if (from === to) return false;
    if (from < 0 || to < 0 || from >= this.length || to >= this.length)
        throw new Error('invalid index!');
    const temp = this[from];
    if (from > to) {
        for (let i = from; i > to; i--) {
            this[i] = this[i - 1];
        }
    } else {
        for (let i = from; i < to; i++) {
            this[i] = this[i + 1];
        }
    }
    this[to] = temp;
    return true;
};
Array.prototype.exchange = function (i1: number, i2: number) {
    // return exchange(this, i1, i2);
    if (i1 === i2) return false;
    if (i1 < 0 || i2 < 0 || i1 >= this.length || i2 >= this.length)
        throw new Error('invalid index!');
    const temp = this[i1];
    this[i1] = this[i2];
    this[i2] = temp;
    return true;
};
