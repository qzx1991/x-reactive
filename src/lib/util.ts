import { Arrayable, ArrayableOnlyArray, Flattern } from './types';
import { isLazyabledData, Lazyable } from './Lazyable';
import LazyTask from './LazyTask';

/**
 * 压平数组的方法 数组可能嵌套很深，通过这个放大将数组压平了
 * @param data
 * @returns
 */

export function flattern<T>(data: Arrayable<T>): T[] {
    if (!Array.isArray(data)) return [data];
    const result: T[] = [];
    data.map((i) => {
        if (!Array.isArray(i)) result.push(i);
        flattern(i as Arrayable<T>).map((j) => result.push(j));
    });
    return result;
}

export function omit<T extends Record<string, any>, K extends keyof T>(
    data: T,
    ...args: ArrayableOnlyArray<K>
): Omit<T, K> {
    const keys = new Set(flattern(args));
    if (isLazyabledData(data)) {
        // 自动加入当前所在任务中去，防止不必要的内存泄漏
        const result: any = Lazyable({} as any);
        for (let i in data) {
            if (!keys.has(i as any)) {
                new LazyTask(
                    () => {
                        result[i] = data[i];
                    },
                    { autoAppendParent: true }
                );
            }
        }
        return result;
    } else {
        const result: any = {};
        for (let key in data) {
            if (!keys.has(key as any)) {
                result[key] = data[key];
            }
        }
        return result;
    }
}

export function pick<T extends Record<string, any>, K extends keyof T>(
    data: T,
    ...args: ArrayableOnlyArray<K>
): Pick<T, K> {
    const keys = new Set(flattern(args));
    if (isLazyabledData(data)) {
        const result = Lazyable({} as any);
        for (let i in data) {
            if (keys.has(i as any)) {
                new LazyTask(
                    () => {
                        result[i] = data[i];
                    },
                    {
                        autoAppendParent: true,
                    }
                );
            }
        }
        return result;
    } else {
        const result: any = {};
        for (let key in data) {
            if (keys.has(key as any)) {
                result[key] = data[key];
            }
        }
        return result;
    }
}

export function someOfMap<K, V>(
    data: Map<K, V>,
    some: (k: K, v: V) => boolean
) {
    const entries = data.entries();
    for (let [key, value] of entries) {
        if (some(key, value)) {
            return true;
        }
    }
    return false;
}
