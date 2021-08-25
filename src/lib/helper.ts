import LazyDocument from './Document';
import {
    FormattedILazyResult,
    IDomElement,
    IDomPosition,
    ILazyResult,
    IFunctionalValue,
    ArrayableOnlyArray,
    ITextElement,
} from './types';
import VirtualElement from './VirtualElement';
import LazyTask from './LazyTask';

export const CHILDREN_RESULT_FLAG = Symbol('CHILDREN_RESULT_FLAG');
export const FOR_RESULT_FLAG = Symbol('FOR_RESULT_FLAG');
export const EMPTY_ARRAY_PLACEHOLD = Symbol('EMPTY_ARRAY_PLACEHOLD');
export const SPECIAL_ARRAY_LIST = [CHILDREN_RESULT_FLAG, FOR_RESULT_FLAG];

/**
 * 更新的任务集中处理，避免没必要的重复渲染
 * 放在这里是为了与LazyTask解耦 layzTask是个独立的模块
 */
const UPDATE_POOL_SET = new Set<LazyTask>();
function addToUpldatePool(task: LazyTask) {
    if (UPDATE_POOL_SET.size === 0) {
        runLifeCycle();
    }
    UPDATE_POOL_SET.add(task);
}
let global_next_ticks: (() => void)[] = [];
export function nextTick(h: () => void) {
    global_next_ticks.push(h);
}
export function reWriteUpdate(task: LazyTask, onUpdate?: () => void) {
    task.update = function () {
        addToUpldatePool(task);
    };
    const forceUpdate = task.forceUpdate;
    task.forceUpdate = function () {
        if (forceUpdate.apply(this)) {
            onUpdate?.();
            return true;
        }
        return false;
    };
}

export function runLifeCycle() {
    LazyDocument.requestAnimationFrame(() => {
        UPDATE_POOL_SET.forEach((t) => t.forceUpdate());
        UPDATE_POOL_SET.clear();
        global_next_ticks.forEach((h) => h());
        global_next_ticks = [];
    });
}

/**
 * 处理各种非格式化的结果 也就是用户各种可能的输出数据
 * 最终只保留文本节点和虚拟节点
 * @param result
 * @returns
 */

export function formatResult(result: ILazyResult): FormattedILazyResult {
    if (isSpecialArray(result)) {
        // 空数组的时候 返回一个空字符
        if ((result as ILazyResult[]).length === 0) {
            const placeholder =
                (result as any)[EMPTY_ARRAY_PLACEHOLD] ||
                LazyDocument.createTextElement('');
            if (!(result as any)[EMPTY_ARRAY_PLACEHOLD]) {
                (result as any)[EMPTY_ARRAY_PLACEHOLD] = placeholder;
            }
            return placeholder;
        }
        return result as FormattedILazyResult;
    } else if (
        result instanceof VirtualElement ||
        LazyDocument.isTextElement(result)
    ) {
        return result as VirtualElement | ITextElement;
    } else if (typeof result === 'string') {
        return LazyDocument.createTextElement(result);
    }
    return LazyDocument.createTextElement(JSON.stringify(result));
}

/**
 * 渲染结果
 * 对于虚拟节点，处理完之后要记得运行渲染 否则什么也没有
 * @param result
 * @returns
 */
export function renderResult(
    result: FormattedILazyResult
): FormattedILazyResult {
    if (isSpecialArray(result)) {
        (result as ArrayableOnlyArray<ITextElement | VirtualElement>).forEach(
            (r) => renderResult(r)
        );
    } else if (result instanceof VirtualElement) {
        result.render();
    }
    return result;
}

export function appendResults(
    result: FormattedILazyResult,
    target: IDomElement
) {
    if (isSpecialArray(result)) {
        (result as ArrayableOnlyArray<ITextElement | VirtualElement>).forEach(
            (i) => appendResults(i, target)
        );
    } else if (result instanceof VirtualElement) {
        result.appendTo(target);
    } else {
        target.append(result as IDomElement);
    }
}

export function getPlaceHolder(result: FormattedILazyResult) {
    if (
        isSpecialArray(result) &&
        (result as FormattedILazyResult[]).length === 0
    ) {
        return (result as any)[EMPTY_ARRAY_PLACEHOLD] as
            | ITextElement
            | undefined;
    }
    return undefined;
}

export function getPosition(
    result: FormattedILazyResult,
    after = true
): IDomPosition {
    if (isSpecialArray(result)) {
        const r = result as FormattedILazyResult[];
        const placeholder = getPlaceHolder(r);
        // 表示存在占位符
        if (placeholder) {
            return getPosition(placeholder, after);
        } else {
            // 是一个大于0的数组
            const item = after ? r[r.length - 1] : r[0];
            return getPosition(item, after);
        }
    } else if (result instanceof VirtualElement) {
        return result.getPosition(after);
    } else {
        const r = result as IDomElement;
        return after
            ? {
                  nextSibling: r.nextSibling,
                  parent: r.parent,
              }
            : {
                  nextSibling: r,
                  parent: r.parent,
              };
    }
}

export function insertIntoResults(
    result: FormattedILazyResult,
    position: IDomPosition
) {
    if (isSpecialArray(result)) {
        (result as ArrayableOnlyArray<ITextElement | VirtualElement>).forEach(
            (i) => insertIntoResults(i, position)
        );
    } else if (result instanceof VirtualElement) {
        result.insertInto(position);
    } else {
        (result as IDomElement).insertInto(position);
    }
}

/**
 * 比较两个结果，比较的思路：
 * 只有ID相同，才认为是相同的两个组件，否则就是卸载、渲染
 * 对于数组如何处理？
 * @param oldResult
 * @param newResult
 * @returns
 */
export function diffResult(
    oldResult: FormattedILazyResult | undefined,
    newResult: FormattedILazyResult
) {
    if (!oldResult) return renderResult(newResult);
    // 是同一种组件
    if (
        oldResult instanceof VirtualElement &&
        newResult instanceof VirtualElement &&
        oldResult.id === newResult.id
    ) {
        // 返回旧结果
        return oldResult;
    }
    const position = unmountResult(oldResult);
    renderResult(newResult);
    if (newResult instanceof VirtualElement) {
        newResult.insertInto(position);
    } else {
        insertIntoResults(newResult as IDomElement, position);
    }
    return newResult;
}

export function unmountResult(result: FormattedILazyResult): IDomPosition {
    if (result instanceof VirtualElement) {
        return result.unmount();
    } else {
        const dom = result as IDomElement;
        const position: IDomPosition = {
            parent: dom.parent,
            nextSibling: dom.nextSibling,
        };
        dom.remove();
        return position;
    }
}

export function renderChildren(children: IFunctionalValue[]) {
    const childrenResult: FormattedILazyResult[] = new Proxy([], {
        get(t, k, r) {
            if (k === CHILDREN_RESULT_FLAG) return true;
            return Reflect.get(t, k, r);
        },
    });
    const tasks: LazyTask[] = [];
    children.forEach((child, index) =>
        tasks.push(
            new LazyTask(
                (o) => {
                    if (o?.time === 1) {
                        childrenResult.push(
                            formatResult(renderResult(child()))
                        );
                    } else {
                        childrenResult[index] = diffResult(
                            childrenResult[index],
                            formatResult(renderResult(child()))
                        );
                    }
                },
                {
                    onStopped: () => {
                        unmountResult(childrenResult[index]);
                    },
                    onInit: (t) => reWriteUpdate(t),
                }
            )
        )
    );
    return {
        tasks,
        result: childrenResult,
    };
}
/**
 * 判断是不是特殊的数组 是的话 就不JSON化
 * @param data
 * @returns
 */
export function isSpecialArray<T>(data: T) {
    return (
        Array.isArray(data) && SPECIAL_ARRAY_LIST.some((s) => (data as any)[s])
    );
}
