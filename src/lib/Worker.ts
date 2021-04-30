import {WorkerState} from '../Enum';
import {Time} from '../utility/Time';
import {v4 as uuid} from 'uuid';
import {LifeCycle} from '../utility/LifeCycle';
import {Executor, JobExecutor} from '../utility/Executor';
import {IWorkerMetaData} from '../interface/discovery';
import {Runtime} from './Runtime';
import {Timer} from '../utility/Timer';
import {Component} from './Component';
import {Provider} from './rpc/Provider';
import {Logger} from './logger/Logger';

abstract class Worker {
  constructor(name: string) {
    this.name_ = name;
    this.lifeCycle_ = new LifeCycle(WorkerState.INIT);
    this.executor_ = new Executor();
    this.intervalJobTimer_ = new Timer();
    this.id_ = uuid();

    this.componentPool_ = new Map();
    this.providerPool_ = new Map();

    this.lifeCycle_.addHandler(WorkerState.STOPPED, async () => {
      for (const component of this.componentPool_.keys()) {
        await this.disconnectComponent(component).catch((err: Error) => {
          Runtime.frameLogger.error(this.logCategory, err, {event: 'disconnect-component', error: Logger.errorMessage(err) });
        });
      }

      for (const provider of this.providerPool_.keys()) {
        await this.unregisterProvider(provider).catch((err: Error) => {
          Runtime.frameLogger.error(this.logCategory, err, {event: 'unregister-provider', error: Logger.errorMessage(err) });
        });
      }
    })
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

  async runCommand(commands: string[]) { return false; }

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

  public async registerProviders(providers: Provider[]) {
    for (const provider of providers) {
      await this.registerProvider(provider);
    }
  }

  public async registerProvider(provider: Provider) {
    Runtime.frameLogger.info(this.logCategory, { event: 'register-provider', id: this.id, name: this.name, provider: provider.name });

    this.providerPool_.set(provider.name, provider);

    await provider.startup();

    Runtime.frameLogger.info(this.logCategory, { event: 'provider-started', id: this.id, name: this.name, provider: provider.name });
  }

  public async unregisterProvider(name: string) {
    const provider = this.providerPool_.get(name);
    if (!provider)
      return;

    Runtime.frameLogger.info(this.logCategory, { event: 'unregister-provider', id: this.id, name: this.name, provider: name });

    await provider.shutdown();

    Runtime.frameLogger.info(this.logCategory, { event: 'provider-unregistered', id: this.id, name: this.name, provider: name });
  }

  public async connectComponents(components: Component[]) {
    for (const component of components) {
      await this.connectComponent(component);
    }
  }

  public async connectComponent(component: Component) {
    Runtime.frameLogger.info(this.logCategory, { event: 'connect-component', id: this.id, name: this.name, component: component.name, version: component.version });

    this.componentPool_.set(component.name, component);

    await component.start();

    Runtime.frameLogger.info(this.logCategory, { event: 'component-connected', id: this.id, name: this.name, component: component.name, version: component.version });
  }

  public async disconnectComponent(name: string) {
    const component = this.componentPool_.get(name);
    if (!component)
      return;

    Runtime.frameLogger.info(this.logCategory, { event: 'disconnect-component', id: this.id, name: this.name, component: name });

    this.componentPool_.delete(name);
    await component.stop();

    Runtime.frameLogger.info(this.logCategory, { event: 'component-disconnected', id: this.id, name: this.name, component: name });
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

  protected get logCategory() {
    return `worker.${this.name}`
  }

  // get runData() {}

  protected lifeCycle_: LifeCycle<WorkerState>;
  private executor_: Executor;
  private name_: string;
  private id_: string;
  private intervalJobTimer_: Timer;
  private componentPool_: Map<string/*name*/, Component>;
  private providerPool_: Map<string/*name*/, Provider>;
}

export {Worker}
