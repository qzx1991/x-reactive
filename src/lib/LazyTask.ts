import { LazyableOptType, onLazyable } from './Lazyable';
import { someOfMap } from './util';
export interface ILazyTaskContext<T = any> {
    time: number;
    reasons?: TaskChangeReason[];
    addSubTask: (task?: LazyTask) => void;
    stop: () => void;
    setData: (data: T) => void;
    getData: () => T | undefined;
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

function addRely(task: LazyTask, t: any, k: string) {
    task.addRely(t, k);
    if (!TARGET_TASK_RELY.has(t)) {
        TARGET_TASK_RELY.set(t, new Map());
    }
    if (!TARGET_TASK_RELY.get(t)?.has(k)) {
        TARGET_TASK_RELY.get(t)?.set(k, new Set());
    }
    TARGET_TASK_RELY.get(t)?.get(k)?.add(task);
}

onLazyable('get', (t, k, v) => {
    // 任务得允许被记录
    if (TEMP_RUNNING_TASK) {
        addRely(TEMP_RUNNING_TASK, t, k as string);
    }
});

onLazyable('set', (t, k, v, ov, isAdd) => {
    Array.from(
        TARGET_TASK_RELY.get(t)?.get(k as string | number) || []
    )?.forEach((task) => {
        task.addReason({
            target: t,
            key: k,
            type: isAdd ? 'add' : 'set',
            value: v,
            oldValue: ov,
        });
        task.update();
    });
});
onLazyable('delete', (t, k, ov) => {
    Array.from(
        TARGET_TASK_RELY.get(t)?.get(k as string | number) || []
    ).forEach((task) => {
        task.addReason({
            target: t,
            key: k,
            type: 'delete',
            value: undefined,
            oldValue: ov,
        });
        task.update();
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

    rely = new Map<any, Set<string | number>>();

    addRely(target: any, key: string | number) {
        if (!this.rely.get(target)) {
            this.rely.set(target, new Set());
        }
        this.rely.get(target)?.add(key);
    }

    removeRely() {
        this.rely.forEach((set) => set.clear());
        this.rely.clear();
    }

    constructor(
        private handler: (
            ctx: ILazyTaskContext<T>
        ) => VoidFunction | undefined | void,
        private option: {
            type: string;
            autoAppendParent?: boolean;
            autoRun?: boolean;
            onStopped?: () => void;
            data?: T;
            onInit?: (ins: LazyTask) => void;
            shouldUpdate?: (reasons: TaskChangeReason[]) => boolean;
        }
    ) {
        // console.log(option.type);
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
        this.unsub = this.handler({
            time: ++this.time,
            addSubTask: this.addSubTask.bind(this),
            stop: this.stop.bind(this),
            reasons: this.reasons,
            setData: this.setData.bind(this),
            getData: this.getData.bind(this),
        });
        TEMP_RUNNING_TASK = ORIGIN;
    }
    addReason(reason: TaskChangeReason) {
        if (this.hasStopped) return false;
        if (!this.reasons) {
            this.reasons = [];
        }
        this.reasons.push(reason);
    }
    private shouldUpdate() {
        if (this.option.shouldUpdate && typeof this.option.shouldUpdate) {
            return this.option.shouldUpdate(this.reasons || []);
        }
        let data = new Map<
            any,
            Map<string | number, { oldValue: any; newValue: any }>
        >();
        this.reasons?.forEach((reason) => {
            if (!data.get(reason.target)) {
                data.set(reason.target, new Map());
            }
            let keyMap = data.get(reason.target)!;
            if (!keyMap?.has(reason.key)) {
                keyMap?.set(reason.key, {
                    oldValue: reason.oldValue,
                    newValue: reason.value,
                });
            } else {
                keyMap.get(reason.key)!.newValue = reason.value;
            }
            (keyMap as any) = null;
        });
        // 但凡存在新值、旧值不等的情况，都需要更新 否则不更新
        const should = someOfMap(data, (k, v) =>
            someOfMap(v, (key, d) => {
                return d.newValue !== d.oldValue;
            })
        );
        data.clear();
        (data as any) = null;
        return should;
    }

    forceUpdate(): boolean {
        // 如果已经停止了 那就不能更新了
        if (this.hasStopped) return false;
        // 不过条件不允许更新  那也是不能更新的
        if (!this.shouldUpdate()) {
            return false;
        }
        this.removeRely();
        this.unsub?.();
        this.run();
        delete this.reasons;
        return true;
    }
    update() {
        this.forceUpdate();
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
        this.removeRely();
        delete (this as any).rely;
        delete this.data;
        delete this.reasons;
        // console.log(`STOPPED: ${this.option.type}`);
    }
    addSubTask(task?: LazyTask) {
        if (!task) return;
        if (!this.subTasks) {
            this.subTasks = new Set();
        }
        this.subTasks?.add(task);
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
