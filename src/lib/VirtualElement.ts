import {
    FormattedILazyResult,
    FunctionalComponent,
    IComponentType,
    IDomElement,
    IFunctionalValue,
    IJSXProperty,
    VoidOrVoidFunction,
} from './types';
import LazyTask from './LazyTask';
import LazyProp from './LazyProps';
import { Lazyable, onLazyable, Raw } from './Lazyable';
import { AddGlobalIocHandler, Ioc } from 'qzx-ioc';
import {
    formatResult,
    diffResult,
    appendResults,
    unmountResult,
    insertIntoResults,
    reWriteUpdate,
    getPosition,
} from './helper';
import LazyDocument from './Document';
import { IDomPosition } from './types';
import {
    renderChildren,
    renderResult,
    RAW_CHILDREN_RESULT_FLAG,
} from './helper';

let TEMP_ELEMENT: VirtualElement | undefined = undefined;
// 添加依赖注入的全局处理逻辑
AddGlobalIocHandler((v) => Lazyable(v));

export default class VirtualElement {
    isNative = false;
    isFragment = false;
    isComponent = false;
    mainTask?: LazyTask;
    // 普通组件的孩子节点
    childrenResult: FormattedILazyResult[] = [];
    mainProp?: LazyProp;
    ctx?: FunctionContextType<any, any, any, any, any>;
    onCreated: (() => VoidOrVoidFunction)[] = [];
    beforeCreate: (() => VoidOrVoidFunction)[] = [];
    onMounted: (() => VoidOrVoidFunction)[] = [];
    onUnMounted: VoidFunction[] = [];
    // 函数组件的结果
    renderResult?: FormattedILazyResult;
    nativeElement?: IDomElement;
    constructor(
        // 组件的唯一ID
        public id: number,
        // 组件的类型
        public tag: IComponentType,
        // 组件的属性
        public props: IJSXProperty[],
        // 组件的子节点
        public children: IFunctionalValue[]
    ) {}

    // 把结果添加到真实节点中去
    appendTo(dom: IDomElement) {
        // this.getElements().forEach((ele) => dom.append(ele));
        if (this.isComponent) {
            appendResults(this.renderResult!, dom);
        } else if (this.isNative && this.nativeElement) {
            dom.append(this.nativeElement);
        } else if (this.isFragment) {
            appendResults(this.childrenResult, dom);
        }
        this.onMounted
            .map((i) => i())
            .forEach((i) =>
                typeof i === 'function' ? this.onUnMounted.push(i) : null
            );
    }
    getPosition(after = true): IDomPosition {
        if (this.isComponent) {
            return getPosition(this.renderResult!, after);
        } else if (this.isNative && this.nativeElement) {
            return getPosition(this.nativeElement, after);
        } else if (this.isFragment) {
            return getPosition(this.childrenResult, after);
        }
        throw new Error('not a valid component');
    }

    insertInto(position: IDomPosition) {
        // this.getElements().forEach((ele) => dom.append(ele));
        if (this.isComponent) {
            insertIntoResults(this.renderResult!, position);
        } else if (this.isNative && this.nativeElement) {
            this.nativeElement.insertInto(position);
        } else if (this.isFragment) {
            insertIntoResults(this.childrenResult, position);
        }
        this.onMounted
            .map((i) => i())
            .forEach((i) =>
                typeof i === 'function' ? this.onUnMounted.push(i) : null
            );
    }
    /**
     * 渲染结果
     * 主要就是处理几种种不同的组件类型
     */
    render() {
        if (typeof this.tag === 'function') {
            this.isComponent = true;
            return this.renderComponent();
        } else if (this.tag === 'fragment') {
            this.isFragment = true;
            return this.renderFragment();
        } else if (typeof this.tag === 'string') {
            this.isNative = true;
            return this.renderNative();
        }
        throw new Error('not a valid Component!');
    }
    private renderComponent() {
        const tag = this.tag as FunctionalComponent;
        // 对于函数组件是要处理children的 在其内部是要使用的
        this.mainProp = new LazyProp(
            this.props,
            new Proxy(this.children, {
                get(t, k, r) {
                    if (k === RAW_CHILDREN_RESULT_FLAG) return true;
                    return Reflect.get(t, k, r);
                },
            })
        );
        delete (this as any).props;
        delete (this as any).children;

        this.mainTask = new LazyTask(
            (ctx) => {
                let ORIGIN: VirtualElement | null | undefined = TEMP_ELEMENT;
                TEMP_ELEMENT = this;
                // 计算渲染结果
                let result: FormattedILazyResult | null = formatResult(
                    tag(
                        this.mainProp?.getProp(),
                        ctx?.time === 1 ? undefined : this.ctx
                    )
                );

                // 若存在就结果 处理旧结果
                if (this.renderResult) {
                    this.renderResult = diffResult(this.renderResult, result);
                } else {
                    renderResult(result);
                    this.renderResult = result;
                }

                if (ctx?.time === 1) {
                    this.onCreated
                        .map((v) => v())
                        .forEach((i) =>
                            typeof i === 'function'
                                ? this.onUnMounted.push(i)
                                : null
                        );
                }
                TEMP_ELEMENT = ORIGIN;
                // 解除不必要的可能导致内存泄漏的地方
                ORIGIN = null;
                result = null;
            },
            {
                onInit: (task) => {
                    reWriteUpdate(task);
                },
                type: 'functional component main',
            }
        );
    }
    private renderFragment() {
        // 有可能还没定义mainTask
        if (!this.mainTask) {
            this.mainTask = new LazyTask(() => {}, {
                type: 'fragment component main',
            });
        }
        let D: ReturnType<typeof renderChildren> | null | undefined =
            renderChildren(this.children);
        this.childrenResult = D.result;
        D.tasks.forEach((t) => this.mainTask?.addSubTask(t));
        // 解除引用
        D = null;
    }

    private handleNativeProperty(property: string) {
        return new LazyTask(
            (o) => {
                let prop: Record<string, any> | null | undefined =
                    this.mainProp?.getProp();
                if (!prop) return;
                let rawProp: Record<string, any> | null = Raw(prop);
                // 不存在属性了 是删除
                if (!rawProp?.hasOwnProperty(property)) {
                    o?.stop();
                } else {
                    this.nativeElement?.setAttribute(
                        property,
                        prop?.[property]
                    );
                }
                prop = null;
                rawProp = null;
                return () => this.nativeElement?.removeAttribute(property);
            },
            {
                onInit: (i) => reWriteUpdate(i),
                type: 'handler native property',
            }
        );
    }
    private renderNative() {
        const tag = this.tag as string;
        this.nativeElement = LazyDocument.createElement(tag);
        this.mainProp = new LazyProp(this.props);
        delete (this as any).props;
        this.mainTask = new LazyTask(
            (o) => {
                let prop: Record<string, any> | undefined | null =
                    this.mainProp?.getProp();
                for (let property in prop) {
                    o?.addSubTask(this.handleNativeProperty(property));
                }
                // 监听新增
                // 删除在handleNativeProperty内处理
                const unsub = onLazyable('add', prop, (t, k) => {
                    o?.addSubTask(this.handleNativeProperty(k as string));
                });
                // 组件卸载时要销毁这个监听
                return () => {
                    unsub();
                    prop = null;
                };
            },
            {
                type: 'native component main',
            }
        );
        // 渲染子节点
        this.renderFragment();
        // 将子节点添加到Native节点上
        appendResults(this.childrenResult, this.nativeElement!);
    }

    unmount(): IDomPosition {
        this.mainProp?.stop();
        // 停止主任务 子任务也自动停止
        this.mainTask?.stop();
        // 卸载子组件
        const result = unmountResult(
            this.isNative
                ? this.nativeElement!
                : this.isFragment
                ? this.childrenResult
                : this.renderResult!
        );
        if (this.isNative) {
            unmountResult(this.childrenResult);
        }

        // 调用钩子函数
        this.onUnMounted.forEach((i) => i());
        delete this.mainTask;
        delete this.mainProp;
        delete (this as any).childrenResult;
        delete this.ctx;
        delete (this as any).onCreated;
        delete (this as any).beforeCreate;
        delete (this as any).onMounted;
        delete (this as any).onUnMounted;
        delete (this as any).id;
        delete (this as any).tag;
        delete (this as any).props;
        delete (this as any).children;
        delete this.renderResult;
        delete this.nativeElement;
        return result;
    }
}

/**
 * 这下面一坨都是处理函数组件用到的
 */
export type ComputedType<T> = T extends Record<string, any>
    ? {
          [p in keyof T]: ReturnType<T[p]>;
      }
    : T;
export function useCtx<
    T extends Record<string, any>,
    C extends Record<string, (...args: any[]) => any>,
    S extends Record<string, new (...args: any[]) => any>,
    M extends Record<string, (...args: any[]) => any>,
    D extends Record<string, any>
>(
    option: FunctionalComponentConfig<T, C, S, M, D>
): FunctionContextType<T, C, S, M, D> {
    if (!TEMP_ELEMENT) throw new Error('you are not in a VirtualElement!');
    const { state, lifeCycle, inject, methods, computed, ...rest } = option;
    let ctx: any = {
        state: option.state ? Lazyable(option.state) : undefined,
        inject: {},
        ...rest,
    };
    TEMP_ELEMENT.ctx = ctx;
    TEMP_ELEMENT.onUnMounted.push(() => (ctx = null));
    // 处理下生命周期函数
    if (option.lifeCycle) {
        for (let life in option.lifeCycle) {
            switch (life) {
                case 'beforeCreate':
                    TEMP_ELEMENT.beforeCreate.push(
                        option.lifeCycle[life]!.bind(ctx)
                    );
                    TEMP_ELEMENT.beforeCreate
                        .map((v) => v())
                        .forEach((i) =>
                            typeof i === 'function'
                                ? TEMP_ELEMENT?.onUnMounted.push(i)
                                : null
                        );
                    break;
                case 'onCreated':
                    TEMP_ELEMENT.onCreated.push(
                        option.lifeCycle[life]!.bind(ctx)
                    );
                    break;
                case 'onMounted':
                    TEMP_ELEMENT.onMounted.push(
                        option.lifeCycle[life]!.bind(ctx)
                    );
                    break;
                case 'onUnMounted':
                    TEMP_ELEMENT.onUnMounted.push(
                        option.lifeCycle[life]!.bind(ctx)
                    );
                    break;
            }
        }
    }
    // 处理依赖注入
    if (option.inject) {
        for (let S in option.inject) {
            ctx.inject[S] = Ioc(option.inject[S]);
        }
    }
    // 处理函数
    if (option.methods) {
        for (let method in option.methods) {
            ctx[method] = option.methods[method].bind(ctx);
        }
    }
    // 处理计算数据
    if (option.computed) {
        ctx.computed = new Proxy(Lazyable({} as Record<string, any>), {
            get(t, k, r) {
                if (
                    !Raw(t).hasOwnProperty(k) ||
                    !option.computed?.hasOwnProperty(k) ||
                    typeof option.computed[k as string] !== 'function'
                ) {
                    const task = new LazyTask(
                        () => {
                            t[k as string] =
                                option.computed?.[k as string].apply(ctx);
                        },
                        {
                            type: 'handle ctx computed',
                        }
                    );
                    // 在组件销毁的时候要停止这个监听
                    TEMP_ELEMENT?.onUnMounted.push(() => task.stop());
                }
                return Reflect.get(t, k, r);
            },
            set() {
                throw new Error("computed value can't be set");
            },
        });
    }
    return ctx as any;
}
export type FunctionContextType<T, C, S, M, D> = D &
    M & {
        state: T;
        computed: ComputedType<C>;
        inject: ServiceType<S>;
    };
export type FunctionalComponentConfig<T, C, S, M, D> = {
    state?: T;
    computed?: C & ThisType<FunctionContextType<T, C, S, M, D>>;
    inject?: S & ThisType<FunctionContextType<T, C, S, M, D>>;
    lifeCycle?: ComponentLifeCycle &
        ThisType<FunctionContextType<T, C, S, M, D>>;
    methods?: M & ThisType<FunctionContextType<T, C, S, M, D>>;
} & D;
export type ComponentLifeCycle = {
    beforeCreate?: () => VoidOrVoidFunction;
    onCreated?: () => VoidOrVoidFunction;
    onMounted?: () => VoidOrVoidFunction;
    onUnMounted?: VoidFunction;
};

export type ServiceType<T> = T extends Record<
    string,
    new (...args: any[]) => any
>
    ? {
          [p in keyof T]: InstanceType<T[p]>;
      }
    : T;
