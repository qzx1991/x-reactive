import {
    FormattedILazyResult,
    FunctionalComponent,
    IComponentType,
    IDomElement,
    IFunctionalValue,
    IJSXProperty,
    VoidOrVoidFunction,
} from './Lazyman';
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
} from './helper';
import LazyDocument from './Document';
import { IDomPosition } from './Lazyman';
import { renderChildren, renderResult } from './helper';

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
    ctx?: FunctionContextType<any, any, any, any>;
    onCreated: (() => VoidOrVoidFunction)[] = [];
    onMounted: (() => VoidOrVoidFunction)[] = [];
    onUnMounted: VoidFunction[] = [];
    nextticks: (() => void)[] = [];
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
        this.mainProp = new LazyProp(this.props);
        const prop = this.mainProp.getProp();
        this.mainTask = new LazyTask(
            (ctx) => {
                const ORIGIN = TEMP_ELEMENT;
                TEMP_ELEMENT = this;
                // 计算渲染结果
                const result = renderResult(
                    formatResult(
                        tag(prop, ctx?.time === 1 ? undefined : this.ctx)
                    )
                );

                // 若存在就结果 处理旧结果
                if (this.renderResult) {
                    this.renderResult = diffResult(this.renderResult, result);
                } else {
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
            },
            {
                onInit: (task) => {
                    reWriteUpdate(task, () => {
                        this.nextticks.forEach(
                            (n) => typeof n === 'function' && n()
                        );
                        this.nextticks = [];
                    });
                },
            }
        );
    }
    private renderFragment() {
        // 有可能还没定义mainTask
        if (!this.mainTask) {
            this.mainTask = new LazyTask(() => {});
        }
        const { tasks, result } = renderChildren(this.children);
        this.childrenResult = result;
        tasks.forEach((t) => this.mainTask?.addSubTask(t));
    }

    private handleNativeProperty(property: string) {
        const prop = this.mainProp?.getProp();
        if (!prop) return;
        const rawProp = Raw(prop);
        const task = new LazyTask(
            () => {
                // 不存在属性了 是删除
                if (!rawProp.hasOwnProperty(property)) {
                    task.stop();
                } else {
                    this.nativeElement?.setAttribute(property, prop[property]);
                }
                return () => this.nativeElement?.removeAttribute(property);
            },
            {
                onInit: (task) => reWriteUpdate(task),
            }
        );
        return task;
    }
    private renderNative() {
        const tag = this.tag as string;
        this.nativeElement = LazyDocument.createElement(tag);

        this.mainProp = new LazyProp(this.props);
        const prop = this.mainProp.getProp();
        this.mainTask = new LazyTask((o) => {
            // if (rawProp.hasOwnProperty)
            for (let property in prop) {
                o?.addSubTask(this.handleNativeProperty(property));
            }
            // 监听新增
            // 删除在handleNativeProperty内处理
            const unsub = onLazyable('add', prop, (t, k) => {
                o?.addSubTask(this.handleNativeProperty(k as string));
            });
            // 组件卸载时要销毁这个监听
            return unsub;
        });
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
        const result = unmountResult(this.renderResult!);
        // 调用钩子函数
        this.onUnMounted.forEach((i) => i());
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
    M extends Record<string, (...args: any[]) => any>
>(
    option: FunctionalComponentConfig<T, C, S, M>
): FunctionContextType<T, C, S, M> {
    if (!TEMP_ELEMENT) throw new Error('you are not in a VirtualElement!');
    const ctx: any = {
        state: option.state ? Lazyable(option.state) : undefined,
        inject: {},
        nextTick: (h: () => void) => TEMP_ELEMENT?.nextticks.push(h),
    };
    TEMP_ELEMENT.ctx = ctx;
    // 处理下生命周期函数
    if (option.lifeCycle) {
        for (let life in option.lifeCycle) {
            switch (life) {
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
                    const task = new LazyTask(() => {
                        t[k as string] =
                            option.computed?.[k as string].apply(ctx);
                    });
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
export type FunctionContextType<T, C, S, M> = M & {
    state: T;
    computed: ComputedType<C>;
    inject: ServiceType<S>;
    nexttick: () => void;
};
export type FunctionalComponentConfig<T, C, S, M> = {
    state?: T;
    computed?: C & ThisType<FunctionContextType<T, C, S, M>>;
    inject?: S & ThisType<FunctionContextType<T, C, S, M>>;
    lifeCycle?: ComponentLifeCycle & ThisType<FunctionContextType<T, C, S, M>>;
    methods?: M & ThisType<FunctionContextType<T, C, S, M>>;
};
export type ComponentLifeCycle = {
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
