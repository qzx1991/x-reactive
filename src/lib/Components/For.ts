import { ILazyResult, VoidOrVoidFunction } from '../types';
import { useCtx } from '../VirtualElement';
import LazyTask from '../LazyTask';
import { Lazyable } from '../Lazyable';

/**
 * 列表展示的方案
 * 不直接使用map等，避免复杂的逻辑和计算
 * @param props
 */
export function For<T = any>(
    props: { data: T[]; render: () => ILazyResult },
    ctx = useCtx({
        result: [] as ILazyResult[],
        lifeCycle: {
            beforeCreate() {
                const tasksMap = new Map<number, ArrayItemTaskData<T>>();
                const task = new LazyTask((o) => {
                    if (o.time !== 1) {
                        // 说明data更新了 我们要销毁旧数据
                    }
                    for (let i = 0; i < props.data.length; i++) {
                        const item = new ArrayItemTaskData<T>();
                        item.updateTask(
                            new LazyTask(() => {
                                item.data.value = props.data[i];
                            })
                        );
                        tasksMap.set(i, item);
                    }
                });
                return () => {
                    task.stop();
                    tasksMap.forEach((t) => t.stop());
                };
            },
        },
    })
) {
    return ctx.result;
}

export class ArrayItemTaskData<T> {
    private task?: LazyTask;
    data = Lazyable({ value: undefined as T | undefined });
    constructor() {}
    updateTask(task: LazyTask) {
        this.stop();
        this.task = task;
    }
    stop() {
        return this.task?.stop();
    }
}
