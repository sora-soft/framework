import {WorkerState} from '../Enum';
import {Time} from '../utility/Time';
import {v4 as uuid} from 'uuid';
import {LifeCycle} from '../utility/LifeCycle';
import {Executor, JobExecutor} from '../utility/Executor';
import {IWorkerMetaData} from '../interface/discovery';
import {Runtime} from './Runtime';
import {Timer} from '../utility/Timer';

abstract class Worker {
  constructor(name: string) {
    this.name_ = name;
    this.lifeCycle_ = new LifeCycle(WorkerState.INIT);
    this.executor_ = new Executor();
    this.intervalJobTimer_ = new Timer();
    this.id_ = uuid();
  }

  // 连接component等准备工作
  protected abstract startup(): Promise<void>;
  async start() {
    await this.lifeCycle_.setState(WorkerState.PENDING);
    this.executor_.start();
    await this.startup().catch(this.onError.bind(this));
    await this.lifeCycle_.setState(WorkerState.READY);
  }

  protected abstract shutdown(reason: string): Promise<void>;
  async stop(reason: string) {
    await this.lifeCycle_.setState(WorkerState.STOPPING);
    this.intervalJobTimer_.clearAll();
    await this.shutdown(reason).catch(this.onError.bind(this));
    await this.executor_.stop();
    await this.lifeCycle_.setState(WorkerState.STOPPED);
  }

  protected async doJob<T>(executor: JobExecutor<T>) {
    return this.executor_.doJob<T>(executor);
  }

  protected async doJobInterval(executor: JobExecutor, timeMS: number) {
    while(true) {
      if (this.state !== WorkerState.READY) {
        await this.intervalJobTimer_.timeout(timeMS);
        continue;
      }

      if (this.state > WorkerState.READY)
        break;

      const startTime = Date.now();
      await this.doJob(executor);
      const nextExecuteMS = timeMS + startTime - Date.now();
      if (nextExecuteMS > 0)
        await this.intervalJobTimer_.timeout(nextExecuteMS);
    }
  }

  protected async onError(err: Error) {
    await this.lifeCycle_.setState(WorkerState.ERROR, err);
    throw err;
  }

  get name() {
    return this.name_;
  }

  get state() {
    return this.lifeCycle_.state;
  }

  get isIdle() {
    return this.state === WorkerState.READY && this.executor_.isIdle;
  }

  get stateEventEmitter() {
    return this.lifeCycle_.emitter;
  }

  get id() {
    return this.id_;
  }

  get executor() {
    return this.executor_;
  }

  get metaData(): IWorkerMetaData {
    return {
      name: this.name,
      state: this.state,
      id: this.id_,
      nodeId: Runtime.node.id,
    }
  }

  // get runData() {}

  protected lifeCycle_: LifeCycle<WorkerState>;
  private executor_: Executor;
  private name_: string;
  private id_: string;
  private intervalJobTimer_: Timer;
}

export {Worker}
