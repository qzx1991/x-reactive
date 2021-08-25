/**是否是代理对象 */
export const LAZYABLE_FLAG = Symbol('_$$__$$__is_lazyable');
/**是否是一个已经proxy */
export const LAZYABLED_FLAG = Symbol('_$$__$$__is_lazyabled');
/** 代理对象的原生对象属性标识 */
export const ORIGIN_TARGET_FLAG = Symbol('_$$__$$__origin_target_flag');

export type LazyableGetHandlerType<T> = (
    object: T,
    key: string | number | symbol,
    value: any
) => void;
export type LazyableSetHandlerType<T> = (
    object: T,
    key: string | number | symbol,
    value: any,
    oldValue: any,
    isAdd: boolean
) => void;
export type LazyableDeleteHandlerType<T> = (
    object: T,
    key: string | number | symbol,
    oldValue: any
) => void;

export type LazyableAddHandlerType<T> = (
    object: T,
    key: string | number | symbol,
    value: any
) => void;

export type LazyableHandlerType<T> =
    | LazyableGetHandlerType<T>
    | LazyableSetHandlerType<T>
    | LazyableDeleteHandlerType<T>
    | LazyableAddHandlerType<T>;
export type LazyableOptType = 'get' | 'set' | 'add' | 'delete';

export function isLazyabledData(v: any): boolean {
    return v && v[LAZYABLED_FLAG];
}
/**
 * 代理一个对象让它变得可以被监听
 * @param value 需要被监听的值
 */
type LazyableKeyType = {
    include?: (string | symbol)[];
    exclude?: (string | symbol)[];
};
function canKeyLazyable(
    k: string | symbol,
    { include, exclude }: LazyableKeyType = {}
) {
    if (exclude && exclude.includes(k)) return false;
    if (include) {
        return include.includes(k);
    }
    return true;
}

const GET_HANDLERS_MAP = new Map<any, Set<LazyableGetHandlerType<any>>>();
const SET_HANDLERS_MAP = new Map<any, Set<LazyableSetHandlerType<any>>>();
const DELETE_HANDLERS_MAP = new Map<any, Set<LazyableDeleteHandlerType<any>>>();
const ADD_HANDLERS_MAP = new Map<any, Set<LazyableSetHandlerType<any>>>();
function getHandlersMapByType(type: LazyableOptType) {
    switch (type) {
        case 'get':
            return GET_HANDLERS_MAP;
        case 'set':
            return SET_HANDLERS_MAP;
        case 'delete':
            return DELETE_HANDLERS_MAP;
        case 'add':
            return ADD_HANDLERS_MAP;
    }
}
function onLazyableOpt(
    map: Map<any, Set<any>>,
    t: any = 'default',
    ...args: any[]
) {
    map.get(t)?.forEach((h) => h(...args));
}
let id = 0;
let LAZYABLE_GET_TRANSFORMERS: {
    id: number;
    handler: (v: any, t: any, k: string | number | symbol, r?: any) => any;
}[] = [];

// 转换获取值的逻辑
export function transformLazyable(
    h: (v: any, t: any, k: string | number | symbol, r?: any) => any
) {
    const myId = ++id;
    LAZYABLE_GET_TRANSFORMERS.push({
        id: myId,
        handler: h,
    });
    return () =>
        (LAZYABLE_GET_TRANSFORMERS = LAZYABLE_GET_TRANSFORMERS.filter(
            (i) => i.id !== myId
        ));
}

export function Lazyable<T extends object>(
    value: T,
    opt: LazyableKeyType = {}
): T {
    if (!value) return value;
    if (typeof value !== 'object') return value;
    if (hasTargetLazyabled(value)) return (Raw(value) as any)?.[LAZYABLE_FLAG];
    const R: any = new Proxy(value, {
        get(t, k, r) {
            if (k === ORIGIN_TARGET_FLAG) return t;
            if (k === LAZYABLED_FLAG) return true;
            const v = Reflect.get(t, k, r);
            if (!canKeyLazyable(k, opt)) {
                return v;
            }
            const Rv = hasTargetLazyabled(v)
                ? (getLazyableRawData(v) as any)?.[LAZYABLE_FLAG] // 已经是代理对象了 获取这个对象存储的代理结果
                : k !== '__proto__' &&
                  (v?.__proto__ === ([] as any).__proto__ ||
                      v?.__proto__ === ({} as any).__proto__) // 是一个普通的对象而非一个类
                ? Lazyable(v) // 响应化
                : v;
            onLazyableOpt(GET_HANDLERS_MAP, t, R, k, Rv);
            onLazyableOpt(GET_HANDLERS_MAP, 'default', R, k, Rv);
            return LAZYABLE_GET_TRANSFORMERS.reduce(
                (lastv, h) => h.handler(lastv, R, k, r),
                Rv
            );
        },
        set(t, k, v, r) {
            const isAdd = !t.hasOwnProperty(k);
            const oldValue = Reflect.get(t, k);
            // 将原生的值放进去
            const res = Reflect.set(t, k, getLazyableRawData(v), r);
            onLazyableOpt(SET_HANDLERS_MAP, t, R, k, v, oldValue, isAdd);
            onLazyableOpt(
                SET_HANDLERS_MAP,
                'default',
                R,
                k,
                v,
                oldValue,
                isAdd
            );
            if (isAdd) {
                onLazyableOpt(ADD_HANDLERS_MAP, t, R, k, v, oldValue, isAdd);
                onLazyableOpt(
                    ADD_HANDLERS_MAP,
                    'default',
                    R,
                    k,
                    v,
                    oldValue,
                    isAdd
                );
            }
            return res;
        },
        deleteProperty(t, p) {
            const oldValue = Reflect.get(t, p);
            const res = Reflect.deleteProperty(t, p);
            onLazyableOpt(DELETE_HANDLERS_MAP, t, R, p, oldValue);
            onLazyableOpt(DELETE_HANDLERS_MAP, 'default', R, p, oldValue);

            return res;
        },
    });
    // 在原生对象中记录这个代理对象 保证所有的原生对象其实指向同一个代理对象 是否有必要 有待实践

    (value as any)[LAZYABLE_FLAG] = R;
    return R;
}

/**
 * 判断一个对象是否已经被代理过
 * @param value
 * @returns
 */
export function hasTargetLazyabled<T>(value: T): boolean {
    return (value as any)?.[LAZYABLE_FLAG];
}

/**
 * 获取一个被代理过的对象的原始数据
 * @param value
 * @returns
 */
export function getLazyableRawData<T>(value: T): T {
    return (value as any)?.[ORIGIN_TARGET_FLAG] || value;
}

export const Raw = getLazyableRawData;

/**
 * 让一个值变得可被代理
 * @param value
 */

export function Ref<T>(value: T): { value: T } {
    return Lazyable({ value });
}

export function onLazyable<T>(
    type: 'get',
    t: T,
    h: LazyableGetHandlerType<T>
): () => void;
export function onLazyable<T>(
    type: 'get',
    h: LazyableGetHandlerType<T>
): () => void;
export function onLazyable<T>(
    type: 'set',
    t: any,
    h: LazyableSetHandlerType<T>
): () => void;
export function onLazyable<T>(
    type: 'set',
    h: LazyableSetHandlerType<T>
): () => void;
export function onLazyable<T>(
    type: 'add',
    t: any,
    h: LazyableAddHandlerType<T>
): () => void;
export function onLazyable<T>(
    type: 'add',
    h: LazyableAddHandlerType<T>
): () => void;
export function onLazyable<T>(
    type: 'delete',
    t: any,
    h: LazyableDeleteHandlerType<T>
): () => void;
export function onLazyable<T>(
    type: 'delete',
    h: LazyableDeleteHandlerType<T>
): () => void;
export function onLazyable(type: LazyableOptType, t: any, h?: any) {
    if (!h) {
        const temp = t;
        t = 'default';
        h = temp;
    }
    const map = getHandlersMapByType(type);
    if (!map) return () => {};
    if (!map.has(t)) {
        map.set(t, new Set());
    }
    map.get(t)?.add(h);
    return () => {
        map.get(t)?.delete(h);
        if (map.get(t)?.size === 0) map.delete(t);
    };
}

//记录哪些属性是stateable的
export const STATE_FLAG = Symbol('state_flag');
