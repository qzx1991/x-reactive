import { ILazyResult } from '../types';
import { useCtx } from '../VirtualElement';
import { FOR_RESULT_FLAG, formatResult } from '../helper';

/**
 * 列表展示的方案
 * 不直接使用map等，避免复杂的逻辑和计算
 * @param props
 */
export function For<T = any>(props: {
    data: T[];
    key: keyof T | ((item: T, index: number) => any);
    render: (item: T, index: number) => ILazyResult;
}) {
    return props.data.length === 0
        ? ''
        : new Proxy(
              props.data.map((item, index) => ({
                  key:
                      typeof props.key === 'function'
                          ? props.key(item, index)
                          : item?.[props.key],
                  result: formatResult(props.render(item, index)),
              })),
              {
                  get(t, k, r) {
                      if (k === FOR_RESULT_FLAG) return true;
                      return Reflect.get(t, k, r);
                  },
              }
          );
}
