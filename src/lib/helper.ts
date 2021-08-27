import LazyDocument from './Document';
import {
    FormattedILazyResult,
    IDomElement,
    IDomPosition,
    ILazyResult,
} from './types';
import VirtualElement from './VirtualElement';
import { IFunctionalValue, IForRenderResult } from './types';
import LazyTask from './LazyTask';

export const CHILDREN_RESULT_FLAG = Symbol('CHILDREN_RESULT_FLAG');
export const FOR_RESULT_FLAG = Symbol('FOR_RESULT_FLAG');
export const SPECIAL_ARRAY_LIST = [CHILDREN_RESULT_FLAG, FOR_RESULT_FLAG];

export function isForResult(result: any) {
    return result && result[FOR_RESULT_FLAG];
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
        const isFor = isForResult(result);
        (result as Array<any>).forEach((r) =>
            renderResult(isFor ? (r as IForRenderResult).result : r)
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
        let oldForResult = oldResult as IForRenderResult[];
        let newForResult = newResult as IForRenderResult[];
        let position = getPosition(oldForResult);
        let mapOldWithKey = new Map<
            any,
            {
                data: IForRenderResult;
                index: number;
            }
        >();
        // 旧数组处理
        oldForResult.forEach((i, index) => {
            if (
                i.key === null ||
                i.key === undefined ||
                mapOldWithKey.has(i.key)
            ) {
                // 没有key的都直接销毁
                unmountResult(i.result);
            } else {
                mapOldWithKey.set(i.key, { data: i, index });
            }
        });
        let newAddResult: FormattedILazyResult[] | null = new Proxy([], {
            get(t, k, r) {
                if (k === FOR_RESULT_FLAG) return true;
                return Reflect.get(t, k, r);
            },
        });
        newForResult.forEach((item) => {
            if (!mapOldWithKey.has(item.key)) {
                renderResult(item.result);
                return newAddResult!.push(item);
            }
            const s = mapOldWithKey.get(item.key)!;
            if (newAddResult!.length > 0) {
                const p = getPosition(s.data.result, false);
                insertIntoResults(newAddResult!, p);
                newAddResult = new Proxy([], {
                    get(t, k, r) {
                        if (k === FOR_RESULT_FLAG) return true;
                        return Reflect.get(t, k, r);
                    },
                });
            }
            item.result = diffResult(s.data.result, item.result);
            mapOldWithKey.delete(item.key);
        });
        insertIntoResults(newAddResult, position);
        Array.from(mapOldWithKey.entries()).forEach(([key, result]) => {
            unmountResult(result.data.result);
        });
        // 清除不用的数据 防止不必要的内存泄漏
        newAddResult = null;
        (oldForResult as any) = null;
        (newForResult as any) = null;
        (position as any) = null;
        mapOldWithKey.clear();
        (mapOldWithKey as any) = null;
        // 接下来就是进行diff算法
        return newResult;
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
                    type: 'renderChildren',
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

export function isSpecialArray<T>(data: T) {
    return (
        Array.isArray(data) && SPECIAL_ARRAY_LIST.some((s) => (data as any)[s])
    );
}
