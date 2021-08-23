export type Arrayable<T> = Array<Arrayable<T>[] | T> | T;
export type ArrayableOnlyArray<T> = Array<ArrayableOnlyArray<T>[] | T>;
export type Flattern<T> = T extends ArrayableOnlyArray<infer M> ? M : T;
export type MapPromise<T> = T extends Promise<any> ? T : T | Promise<T>;

export type VoidOrVoidFunction = void | VoidFunction;

export interface IDomPosition {
    parent?: IDomElement;
    nextSibling?: IDomElement;
    preSibling?: IDomElement;
}

// createElement创建的一个虚拟组件
export interface VirtualElement {}

export interface IDocument {
    isTextElement: (result: any) => boolean;
    createTextElement: (text: string) => ITextElement;
    createElement: (tag: string) => IDomElement;
    querySelect: (tag: string) => IDomElement | null;
    querySelectAll: (tag: string) => IDomElement[] | null;
    insertBefore: (eles: IDomElement[], target: IDomElement) => void;
    requestAnimationFrame: (h: () => void) => void;
}
// 抽象画的DOM组件
export interface IDomElement {
    // 向元素最后添加新的子节点
    append: (eles: IDomElement[] | IDomElement) => void;
    // 元素的下一个节点
    nextSibling?: IDomElement;
    // 元素的上一个节点
    preSibling?: IDomElement;
    // 元素的父节点
    parent?: IDomElement;

    insertInto: (position: IDomPosition) => void;

    // 在元素钱插入一个元素
    insertBefore: (target: IDomElement) => void; // 在子元素dom前插入新的元素
    // 设置元素的属性
    setAttribute: (attr: string, value: any) => void;
    // 移除元素的属性
    removeAttribute: (attr: string, value?: any) => void;
    // 移除该元素
    remove: () => void;
}
export interface ITextElement extends IDomElement {
    // 获取元素的文本内容
    getText: () => string;
    // 设置元素的文本内容
    setText: (str: string) => void;
}

export type ILazyResult = Arrayable<
    Arrayable<string | number | undefined | null | VirtualElement>
>;

export type FormattedILazyResult = Arrayable<ITextElement | VirtualElement>;

export type IComponentProp<T extends Record<string, any> = {}> = {
    children?: ILazyResult;
} & T;

export type FunctionalComponent<P extends IComponentProp = {}> = (
    // 传入的属性
    props?: P,
    // 属性的上下文环境 用以替换Component (我们舍弃Component)
    ctx?: {}
) => ILazyResult;

export type IComponentType = string | FunctionalComponent;

export type IJSXPropertyType = 'normal' | 'rest';

export type IFunctionalValue<T = any> = () => T;

export interface IJSXProperty {
    type: IJSXPropertyType;
    name: string;
    value: IFunctionalValue;
}
