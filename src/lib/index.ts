import VirtualElement from './VirtualElement';
import LazyHTMLDocument from './HTMLDocument';
import LazyDocument from './Document';
import {
    renderResult,
    formatResult,
    appendResults,
    runLifeCycle,
} from './helper';
import {
    IComponentType,
    IJSXProperty,
    IFunctionalValue,
    IDocument,
    ILazyResult,
    IDomElement,
} from './types';
export * from './types';
const Lazyman = {
    /**
     * 创建虚拟节点 这是JSX
     * @param id
     * @param tag
     * @param props
     * @param children
     * @returns
     */
    createElement(
        // 组件的ID
        id: number,
        // 组件的类型
        tag: IComponentType,
        // 传给组件的属性
        props: IJSXProperty[],
        // 组件的子节点
        children: IFunctionalValue[]
    ) {
        return new VirtualElement(id, tag, props, children);
    },
    /**
     * 加载驱动 这里便于跨平台
     * @param document
     */
    driveDom(document: IDocument = LazyHTMLDocument) {
        Object.assign(LazyDocument, document);
    },
    // 渲染组件到指定的节点上 这是起点
    render(element: ILazyResult, dom: string | IDomElement) {
        const target =
            typeof dom === 'string' ? LazyDocument.querySelect(`#${dom}`) : dom;
        if (!target) throw new Error('target dom not exists!');
        appendResults(renderResult(formatResult(element)), target);
    },
};

// 导出组件
export default Lazyman;
