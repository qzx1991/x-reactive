import { LazyableOptType, onLazyable } from './Lazyable';
export interface ILazyTaskContext<T = any> {
    time: number;
    reasons?: TaskChangeReason[];
    addSubTask: (task?: LazyTask) => void;
    stop: () => void;
    setData?: (data: T) => void;
    getData?: () => T | undefined;
}

// 当前正在运行的任务
let TEMP_RUNNING_TASK: LazyTask | undefined;

// 获取当前正在运行的任务
export function getTempTask() {
    return TEMP_RUNNING_TASK;
}

export type TaskChangeReason = {
    target: any; // 导致变化的对象
    key: any; // 导致变化的key
    type: LazyableOptType;
    value: any;
    oldValue?: any;
};

const TARGET_TASK_RELY = new Map<any, Map<string | number, Set<LazyTask>>>();
const TASK_TARGET_RELY = new Map<LazyTask, Map<any, Set<string | number>>>();

function addRely(task: LazyTask, t: any, k: string) {
    if (!TASK_TARGET_RELY.has(task)) {
        TASK_TARGET_RELY.set(task, new Map());
    }
    if (!TASK_TARGET_RELY.get(task)?.has(t)) {
        TASK_TARGET_RELY.get(task)?.set(t, new Set());
    }
    TASK_TARGET_RELY.get(task)?.get(t)?.add(k);
    if (!TARGET_TASK_RELY.has(t)) {
        TARGET_TASK_RELY.set(t, new Map());
    }
    if (!TARGET_TASK_RELY.get(t)?.has(k)) {
        TARGET_TASK_RELY.get(t)?.set(k, new Set());
    }
    TARGET_TASK_RELY.get(t)?.get(k)?.add(task);
}
function removeRely(task: LazyTask) {
    const t = TASK_TARGET_RELY.get(task);
    TASK_TARGET_RELY.delete(task);
    t?.forEach((keys, target) => {
        keys.forEach((key) => {
            TARGET_TASK_RELY.get(target)?.get(key)?.delete(task);
            if (TARGET_TASK_RELY.get(target)?.get(key)?.size === 0) {
                TARGET_TASK_RELY.get(target)?.delete(key);
            }
            if (TARGET_TASK_RELY.get(target)?.size === 0) {
                TARGET_TASK_RELY.delete(target);
            }
        });
    });
}

onLazyable('get', (t, k, v) => {
    // 任务得允许被记录
    if (TEMP_RUNNING_TASK) {
        addRely(TEMP_RUNNING_TASK, t, k as string);
    }
});

onLazyable('set', (t, k, v, ov, isAdd) => {
    TARGET_TASK_RELY.get(t)
        ?.get(k as string | number)
        ?.forEach((t) => {
            t.addReason({
                target: t,
                key: k,
                type: isAdd ? 'add' : 'set',
                value: v,
                oldValue: ov,
            });
            t.update();
        });
});
onLazyable('delete', (t, k, ov) => {
    TARGET_TASK_RELY.get(t)
        ?.get(k as string | number)
        ?.forEach((t) => {
            t.addReason({
                target: t,
                key: k,
                type: 'delete',
                value: undefined,
                oldValue: ov,
            });
            t.update();
        });
});

export default class LazyTask<T = any> {
    // 任务存储的数据
    private data?: T;
    // 父任务
    private parent?: LazyTask;
    // 节流函数

    private subTasks?: Set<LazyTask>;

    private time: number = 0;

    private unsub?: (() => void) | void;

    private reasons?: TaskChangeReason[];
    private hasStopped = false;

    constructor(
        private handler: (
            ctx?: ILazyTaskContext<T>
        ) => VoidFunction | undefined | void,
        private option: {
            autoAppendParent?: boolean;
            autoRun?: boolean;
            name?: string;
            onStopped?: () => void;
            data?: T;
            onInit?: (ins: LazyTask) => void;
        } = {}
    ) {
        if (this.option.data) {
            this.setData(this.option.data);
        }
        if (option.autoAppendParent) {
            getTempTask()?.addSubTask(this);
        }
        if (option.onInit) {
            option.onInit(this);
        }
        if (option.autoRun || option.autoRun === undefined) {
            this.run();
        }
    }
    run() {
        const ORIGIN = TEMP_RUNNING_TASK;
        TEMP_RUNNING_TASK = this;
        const ctx: ILazyTaskContext<T> = {
            time: ++this.time,
            addSubTask: this.addSubTask.bind(this),
            stop: this.stop.bind(this),
            reasons: this.reasons,
            setData: this.setData.bind(this),
            getData: this.getData.bind(this),
        };
        this.unsub = this.handler(ctx);
        TEMP_RUNNING_TASK = ORIGIN;
    }
    addReason(reason: TaskChangeReason) {
        if (this.hasStopped) return false;
        if (!this.reasons) {
            this.reasons = [];
        }
        this.reasons.push(reason);
    }
    forceUpdate() {
        if (this.hasStopped) return;
        this.unsub?.();
        this.run();
        delete this.reasons;
    }
    update() {
        return this.forceUpdate();
    }
    stop() {
        // 移除所有的子任务
        this.subTasks?.forEach((t) => t.stop());
        this.subTasks?.clear();
        // 别忘了也要从父节点移除
        this.parent?.removeSubTask(this);
        // 销毁函数
        this.unsub?.();
        this.hasStopped = true;
        this.option.onStopped?.();
        // 移除依赖
        removeRely(this);
    }
    addSubTask(task?: LazyTask) {
        task && this.subTasks?.add(task);
    }
    removeSubTask(task: LazyTask) {
        task.stop();
        delete task.parent;
        this.subTasks?.delete(task);
    }
    setData(data: T) {
        this.data = data;
    }
    getData() {
        return this.data;
    }
}
