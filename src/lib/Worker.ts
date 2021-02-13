import EventEmitter = require('events');
import {WorkerState} from '../Enum';
import {WorkerEvent} from '../Event';
import {ExecutorQueue, JobExecutor} from '../utility/ExecutorQueue';
import {Time} from '../utility/Time';

abstract class Worker {
  constructor(name: string, uuid: string) {
    this.name_ = name;
    this.state_ = WorkerState.INIT;
    this.stateEventEmitter_ = new EventEmitter();
    this.jobExecutor_ = new ExecutorQueue();
    this.uuid_ = uuid;
  }

  // 连接component等准备工作
  protected abstract startup(): Promise<void>;
  // 开始正式工作
  protected abstract afterStartup(): Promise<void>;
  async start() {
    this.state_ = WorkerState.PENDING;
    this.stateEventEmitter_.emit(WorkerEvent.STARTING);
    await this.startup().catch(this.onError.bind(this));
    this.state_ = WorkerState.READY;
    this.stateEventEmitter_.emit(WorkerEvent.READY);
    await this.afterStartup().catch(this.onError.bind(this));
  }

  protected abstract shutdown(reason: string): Promise<void>;
  async stop(reason: string) {
    this.state_ = WorkerState.STOPPING;
    this.stateEventEmitter_.emit(WorkerEvent.STOPPING);
    await this.jobExecutor_.stop();

    return this.shutdown(reason).then(() => {
      this.state_ = WorkerState.STOPPED;
      this.stateEventEmitter_.emit(WorkerEvent.STOPPED);
    }).catch(this.onError.bind(this));
  }

  // 任何 Worker 都应该同一时间只处理一件事情以此保证事务的顺序处理
  protected async doJob<T>(executor: JobExecutor<T>) {
    return this.jobExecutor_.doJob<T>(executor);
  }

  protected async doJobInterval(executor: JobExecutor, timeMS: number) {
    while(this.state_ === WorkerState.READY) {
      const startTime = Date.now();
      await this.doJob(executor);
      const nextExecuteMS = timeMS + startTime - Date.now();
      if (nextExecuteMS > 0)
        await Time.timeout(nextExecuteMS);
    }
  }

  protected onError(err: Error) {
    this.state_ = WorkerState.ERROR;
    this.stateEventEmitter_.emit(WorkerEvent.ERROR, err);
    throw err;
  }

  get name() {
    return this.name_;
  }

  get state() {
    return this.state_;
  }

  get isIdle() {
    return this.state_ === WorkerState.READY && this.jobExecutor_.isIdle;
  }

  get stateEventEmitter() {
    return this.stateEventEmitter_;
  }

  get uuid() {
    return this.uuid_;
  }

  protected state_: WorkerState;
  protected stateEventEmitter_: EventEmitter;
  private jobExecutor_: ExecutorQueue;
  private name_: string;
  private uuid_: string;
}

export {Worker}
