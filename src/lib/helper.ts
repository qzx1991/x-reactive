import LazyDocument from './Document';
import {
    FormattedILazyResult,
    IDomElement,
    ILazyResult,
    IForRenderResult,
} from './types';
import VirtualElement from './VirtualElement';
import { IFunctionalValue, IDomPosition } from './types';
import LazyTask from './LazyTask';
import { chunk, getChunkSize, isNil } from './util';

export const RAW_CHILDREN_RESULT_FLAG = Symbol('RAW_CHILDREN_RESULT_FLAG');
export const CHILDREN_RESULT_FLAG = Symbol('CHILDREN_RESULT_FLAG');
export const FOR_RESULT_FLAG = Symbol('FOR_RESULT_FLAG');
export const SPECIAL_ARRAY_LIST = [
    CHILDREN_RESULT_FLAG,
    FOR_RESULT_FLAG,
    RAW_CHILDREN_RESULT_FLAG,
];

export function isForResult(result: any) {
    return result && result[FOR_RESULT_FLAG];
}
export function isRawChildren(result: any) {
    return result && result[RAW_CHILDREN_RESULT_FLAG];
}

/**
 * 更新的任务集中处理，避免没必要的重复渲染
 * 放在这里是为了与LazyTask解耦 layzTask是个独立的模块
 */
const NEXTTICKS_SET = new Set<LazyTask>();
function addToNextTick(task: LazyTask) {
    if (NEXTTICKS_SET.size === 0) {
        runLifeCycle();
    }
    NEXTTICKS_SET.add(task);
}
let global_next_ticks: (() => void)[] = [];
export function nextTick(h: () => void) {
    global_next_ticks.push(h);
}
export function reWriteUpdate(task: LazyTask, onUpdate?: () => void) {
    task.update = function () {
        addToNextTick(task);
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
        if (NEXTTICKS_SET.size > 0) {
            NEXTTICKS_SET.forEach((t) => {
                t.forceUpdate();
            });
            NEXTTICKS_SET.clear();
            global_next_ticks.forEach((h) => h());
            global_next_ticks = [];
        }
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
        return result as FormattedILazyResult;
    } else if (result instanceof VirtualElement) {
        return result;
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
        (result as Array<any>).forEach((r) =>
            renderResult(
                isForResult(result) ? (r as IForRenderResult).result : r
            )
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
        const isFor = isForResult(result);
        (result as Array<FormattedILazyResult>).forEach((i) =>
            appendResults(isFor ? (i as IForRenderResult).result : i, target)
        );
    } else if (result instanceof VirtualElement) {
        result.appendTo(target);
    } else {
        target.append(result as IDomElement);
    }
}

export function insertIntoResults(
    result: FormattedILazyResult,
    position: IDomPosition
) {
    if (isSpecialArray(result)) {
        const isFor = isForResult(result);
        (result as Array<any>).forEach((i) =>
            insertIntoResults(
                isFor ? (i as IForRenderResult).result : i,
                position
            )
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
    oldResult: FormattedILazyResult,
    newResult: FormattedILazyResult
) {
    // 是同一种组件
    if (
        oldResult instanceof VirtualElement &&
        newResult instanceof VirtualElement &&
        oldResult.id === newResult.id
    ) {
        // 返回旧结果
        return oldResult;
    }
    /**
     * 不存在For的渲染结果数组是0的情况，For组件已经预先处理了。
     */

    if (isForResult(oldResult) && isForResult(newResult)) {
        return diffForResult(
            oldResult as IForRenderResult[],
            newResult as IForRenderResult[]
        );
    }
    let position = unmountResult(oldResult);
    renderResult(newResult);
    if (newResult instanceof VirtualElement) {
        newResult.insertInto(position);
    } else {
        insertIntoResults(newResult as IDomElement, position);
    }
    (position as any) = null;
    return newResult;
}

export function getPosition(
    result: FormattedILazyResult,
    after = true
): IDomPosition {
    if (isSpecialArray(result)) {
        const isFor = isForResult(result);
        const r = result as FormattedILazyResult[];
        const item = r[after ? r.length - 1 : 0];
        return getPosition(
            isFor ? (item as IForRenderResult).result : item,
            after
        );
    } else if (result instanceof VirtualElement) {
        return result.getPosition(after);
    } else {
        return after
            ? {
                  nextSibling: (result as IDomElement).nextSibling,
                  parent: (result as IDomElement).parent,
              }
            : {
                  nextSibling: result as IDomElement,
                  parent: (result as IDomElement).parent,
              };
    }
}

export function unmountResult(result: FormattedILazyResult): IDomPosition {
    if (!result) throw new Error('invalid result');
    if (Array.isArray(result)) {
        const isFor = isForResult(result);
        return (result as Array<any>).reduce((lv, v) => {
            return unmountResult(isFor ? (v as IForRenderResult).result : v);
        }, {} as any);
    }
    if (result instanceof VirtualElement) {
        return result.unmount();
    } else {
        return (result as IDomElement | null)?.remove()!;
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
    children.forEach((child, index) => {
        if (isRawChildren(child)) {
            const r = renderChildren(child as any);
            childrenResult[index] = r.result;
            r.tasks.forEach((t) => tasks.push(t));
            return;
        }
        tasks.push(
            new LazyTask(
                (o) => {
                    if (o?.time === 1) {
                        const r = formatResult(child());
                        if (isRawChildren(r)) {
                            const m = renderChildren(r as IFunctionalValue[]);
                            m.tasks.forEach((t) => o.addSubTask(t));
                            childrenResult[index] = m.result;
                        } else {
                            const a = renderResult(r);
                            childrenResult.push(a);
                        }
                    } else {
                        childrenResult[index] = diffResult(
                            childrenResult[index],
                            formatResult(child())
                        );
                    }
                },
                {
                    type: 'renderChildren',
                    onStopped: () => {
                        unmountResult(childrenResult[index]);
                    },
                    onInit: (t) => reWriteUpdate(t),
                }
            )
        );
    });
    return {
        tasks,
        result: childrenResult,
    };
}

export function isSpecialArray<T>(data: T) {
    return (
        Array.isArray(data) && SPECIAL_ARRAY_LIST.some((s) => (data as any)[s])
    );
}

/**
 * 算法描述：一个打乱了顺序的数组，原数组如何通过最短的步骤去得到。
 * 1. 找到最大的不可变数组。
 * 2. 在其空缺位置插入需要的数据
 * @param ov
 * @param nv
 */
function diffForResult(ov: IForRenderResult[], nv: IForRenderResult[]) {
    // 先遍历旧数组 获取所有的key和下标
    const ovKeysAndIndexes = new Map<any, number>();
    ov.forEach((o, i) =>
        isNil(o.key) ? unmountResult(o.result) : ovKeysAndIndexes.set(o.key, i)
    );

    let lastOIndex = -1;
    nv.forEach((n, i) => {
        const key = n.key;
        const oIndex = ovKeysAndIndexes.get(key)!;
        if (!ovKeysAndIndexes.has(key)) {
            const position =
                i <= 0
                    ? getPosition(ov[0].result, false)
                    : getPosition(nv[i - 1].result);
            insertIntoResults(renderResult(nv[i].result), position);
        } else {
            n.result = diffResult(ov[oIndex].result, n.result);
            if (oIndex > lastOIndex) {
                lastOIndex = oIndex;
            } else {
                const position = getPosition(nv[i - 1].result);
                insertIntoResults(n.result, position);
            }
            ovKeysAndIndexes.delete(key);
        }
    });

    ovKeysAndIndexes.forEach((i) => unmountResult(ov[i].result));
    return nv;
}
