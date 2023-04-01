import {WorkerState} from '../Enum.js';
import {v4 as uuid} from 'uuid';
import {LifeCycle} from '../utility/LifeCycle.js';
import {Executor, JobExecutor} from '../utility/Executor.js';
import {IWorkerMetaData} from '../interface/discovery.js';
import {Runtime} from './Runtime.js';
import {Timer} from '../utility/Timer.js';
import {Component} from './Component.js';
import {Provider} from './rpc/Provider.js';
import {Logger} from './logger/Logger.js';
import {Context} from './Context.js';
import {UnixTime, Utility} from '../utility/Utility.js';
import {ExError} from '../utility/ExError.js';

abstract class Worker {
  constructor(name: string) {
    this.name_ = name;
    this.lifeCycle_ = new LifeCycle(WorkerState.INIT, true);
    this.executor_ = new Executor();
    this.intervalJobTimer_ = new Timer();
    this.id_ = uuid();

    this.componentPool_ = new Map();
    this.providerPool_ = new Map();

    this.lifeCycle_.addHandler(WorkerState.STOPPED, async () => {
      for (const provider of this.providerPool_.keys()) {
        await this.unregisterProvider(provider).catch((err: Error) => {
          Runtime.frameLogger.error(this.logCategory, err, {event: 'unregister-provider', error: Logger.errorMessage(err)});
        });
      }
      for (const component of this.componentPool_.keys()) {
        await this.disconnectComponent(component).catch((err: Error) => {
          Runtime.frameLogger.error(this.logCategory, err, {event: 'disconnect-component', error: Logger.errorMessage(err)});
        });
      }
    });
  }

  // 连接component等准备工作
  protected abstract startup(context: Context): Promise<void>;
  async start(context?: Context) {
    context = this.startupContext_ = new Context(context);
    await context.await(this.lifeCycle_.setState(WorkerState.PENDING));
    this.executor_.start();
    await context.await(this.startup(context).catch((err: ExError) => {
      this.onError(err);
    }));
    await context.await(this.lifeCycle_.setState(WorkerState.READY));
    this.startupContext_ = null;
    this.startTime_ = UnixTime.now();
  }

  protected abstract shutdown(reason: string): Promise<void>;
  async stop(reason: string) {
    this.abortStartup();
    await this.lifeCycle_.setState(WorkerState.STOPPING);
    this.intervalJobTimer_.clearAll();
    await this.executor_.stop();
    await this.shutdown(reason).catch((err: ExError) => {
      this.onError(err);
    });
    await this.lifeCycle_.setState(WorkerState.STOPPED);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async runCommand(...args: unknown[]) {
    return false;
  }

  protected async doJob<T>(executor: JobExecutor<T>) {
    return this.executor_.doJob<T>(executor);
  }

  protected abortStartup() {
    this.startupContext_?.abort();
    this.startupContext_ = null;
  }

  protected async doJobInterval(executor: JobExecutor, timeMS: number) {
    while(true) {
      if (this.state > WorkerState.READY)
        break;

      if (this.state !== WorkerState.READY) {
        await this.intervalJobTimer_.timeout(timeMS);
        continue;
      }

      const startTime = Date.now();
      await this.doJob(executor).catch((err: Error) => {
        Runtime.frameLogger.error(this.logCategory, err, {event: 'do-interval-job-error', error: Logger.errorMessage(err)});
      });
      const nextExecuteMS = timeMS + startTime - Date.now();
      if (nextExecuteMS > 0)
        await this.intervalJobTimer_.timeout(nextExecuteMS);
    }
  }

  public async registerProviders(providers: Provider[], ctx?: Context) {
    for (const provider of providers) {
      await this.registerProvider(provider, ctx);
    }
  }

  public async registerProvider(provider: Provider, ctx?: Context) {
    Runtime.frameLogger.info(this.logCategory, {event: 'register-provider', id: this.id, name: this.name, provider: provider.name});

    this.providerPool_.set(provider.name, provider);

    await provider.startup(ctx);

    Runtime.frameLogger.info(this.logCategory, {event: 'provider-started', id: this.id, name: this.name, provider: provider.name});
  }

  public async unregisterProvider(name: string) {
    const provider = this.providerPool_.get(name);
    if (!provider)
      return;

    Runtime.frameLogger.info(this.logCategory, {event: 'unregister-provider', id: this.id, name: this.name, provider: name});

    await provider.shutdown();

    Runtime.frameLogger.info(this.logCategory, {event: 'provider-unregistered', id: this.id, name: this.name, provider: name});
  }

  public async connectComponents(components: Component[], ctx?: Context) {
    for (const component of components) {
      await this.connectComponent(component, ctx);
    }
  }

  public async connectComponent(component: Component, ctx?: Context) {
    Runtime.frameLogger.info(this.logCategory, {event: 'connect-component', id: this.id, name: this.name, component: component.name, version: component.version});

    this.componentPool_.set(component.name, component);

    await component.start(ctx);

    Runtime.frameLogger.info(this.logCategory, {event: 'component-connected', id: this.id, name: this.name, component: component.name, version: component.version});
  }

  public async disconnectComponent(name: string) {
    const component = this.componentPool_.get(name);
    if (!component)
      return;

    Runtime.frameLogger.info(this.logCategory, {event: 'disconnect-component', id: this.id, name: this.name, component: name});

    this.componentPool_.delete(name);
    await component.stop();

    Runtime.frameLogger.info(this.logCategory, {event: 'component-disconnected', id: this.id, name: this.name, component: name});
  }

  protected onError(err: Error) {
    Runtime.frameLogger.error(this.logCategory, err, {event: 'worker-on-error', error: Logger.errorMessage(err)});
    this.abortStartup();
    this.lifeCycle_.setState(WorkerState.ERROR, err).catch(Utility.null);
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

  get lifeCycle() {
    return this.lifeCycle_;
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
      startTime: this.startTime_,
    };
  }

  protected get logCategory() {
    return `worker.${this.name}`;
  }

  protected lifeCycle_: LifeCycle<WorkerState>;
  protected executor_: Executor;
  protected intervalJobTimer_: Timer;
  protected startTime_: number;
  private name_: string;
  private id_: string;
  private componentPool_: Map<string/* name*/, Component>;
  private providerPool_: Map<string/* name*/, Provider>;
  private startupContext_: Context | null;
}

export {Worker};
