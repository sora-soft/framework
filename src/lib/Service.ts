import {TypeGuard} from '@sora-soft/type-guard';
import {ListenerState, WorkerState} from '../Enum.js';
import {LifeCycleEvent, ListenerWeightEvent} from '../Event.js';
import {ILabels, IServiceOptions} from '../interface/config.js';
import {IServiceMetaData, IServiceRunData} from '../interface/discovery.js';
import {ExError} from '../utility/ExError.js';
import {QueueExecutor} from '../utility/QueueExecutor.js';
import {Utility} from '../utility/Utility.js';
import {Context} from './Context.js';
import {Logger} from './logger/Logger.js';
import {Listener} from './rpc/Listener.js';
import {Runtime} from './Runtime.js';
import {Worker} from './Worker.js';

abstract class Service extends Worker {
  constructor(name: string, options: IServiceOptions) {
    super(name, options);
    TypeGuard.assert<IServiceOptions>(options);
    this.serviceOptions_ = options;

    this.listenerPool_ = new Map();
    this.discoveryExecutor_ = new QueueExecutor();
    this.discoveryExecutor_.start();

    this.lifeCycle_.emitter.on(LifeCycleEvent.StateChangeTo, (state: WorkerState) => {

      Runtime.frameLogger.debug(this.logCategory, {event: 'service-state-change', state});

      switch (state) {
        case WorkerState.ERROR:
          for (const [id] of this.listenerPool_) {
            this.uninstallListener(id).catch((err: ExError) => {
              Runtime.frameLogger.error('service', err, {event: 'uninstall-listener-error', error: Logger.errorMessage(err)});
            });
          }
          break;
      }
    });
  }

  async stop(reason: string) {
    this.abortStartup();
    this.lifeCycle_.setState(WorkerState.STOPPING);
    this.intervalJobTimer_.clearAll();
    for (const id of this.listenerPool_.keys()) {
      await this.uninstallListener(id).catch((err: ExError) => {
        Runtime.frameLogger.error(this.logCategory, err, {event: 'service-uninstall-listener', error: Logger.errorMessage(err)});
      });
    }
    await this.executor_.stop();
    await this.shutdown(reason).catch((err: ExError) => {
      this.onError(err);
    });
    this.lifeCycle_.setState(WorkerState.STOPPED);
  }

  public async installListener(listener: Listener, ctx?: Context) {
    const context = new Context(ctx);

    Runtime.frameLogger.info(this.logCategory, {event: 'install-listener', name: this.name, id: this.id, meta: listener.metaData, version: listener.version});

    await context.await(this.registerEndpoint(listener));

    listener.weightEventEmiiter.on(ListenerWeightEvent.WeightChange, async () => {
      await this.registerEndpoint(listener);
    });

    listener.stateEventEmitter.on(LifeCycleEvent.StateChange, async (pre, state, err: Error) => {
      await this.registerEndpoint(listener);
      switch (state) {
        case ListenerState.ERROR: {
          Runtime.frameLogger.error(this.logCategory, err, {event: 'listener-err', name: this.name, id: this.id, listenerId: listener.id, preState: pre, error: Logger.errorMessage(err)});
          this.uninstallListener(listener.id).catch((e: ExError) => {
            Runtime.frameLogger.error('service', e, {event: 'uninstall-listener', error: Logger.errorMessage(e)});
          });
          break;
        }
      }
    });

    this.listenerPool_.set(listener.id, listener);

    await listener.startListen();

    Runtime.frameLogger.success(this.logCategory, {event: 'listener-started', name: this.name, id: this.id, meta: listener.metaData, version: listener.version});
    context.complete();
  }

  public async registerEndpoint(listener: Listener) {
    await this.discoveryExecutor_.doJob(async () => {
      await Runtime.discovery.registerEndpoint(this.getListenerMetaData(listener));
    }).catch((e: ExError) => {
      Runtime.frameLogger.error('service', e, {event: 'register-endpoint', error: Logger.errorMessage(e)});
      throw e;
    });
  }

  public async registerEndpoints() {
    for (const [_, listener] of this.listenerPool_.entries()) {
      this.registerEndpoint(listener).catch(Utility.null);
    }
  }

  public async uninstallListener(id: string) {
    const listener = this.listenerPool_.get(id);
    if (!listener)
      return;

    Runtime.frameLogger.info(this.logCategory, {event: 'uninstall-listener', name: this.name, id: this.id, meta: listener.metaData});

    this.listenerPool_.delete(id);
    await listener.stopListen();

    Runtime.frameLogger.success(this.logCategory, {event: 'listener-stopped', name: this.name, id: this.id, meta: listener.metaData});

    await this.discoveryExecutor_.doJob(async () => {
      await Runtime.discovery.unregisterEndPoint(id);
    });
  }

  protected getListenerMetaData(listener: Listener) {
    const labels = {
      ...this.metaData.labels,
      ...listener.labels,
    };

    return {
      ...listener.metaData,
      id: listener.id,
      state: listener.state,
      targetId: this.id,
      targetName: this.name,
      weight: listener.weight,
      version: listener.version,
      labels,
    };
  }

  get metaData(): IServiceMetaData {
    return Utility.deepCopy({
      name: this.name,
      alias: this.serviceOptions_.alias,
      id: this.id,
      nodeId: Runtime.node.id,
      state: this.state,
      startTime: this.startTime_,
      labels: this.serviceOptions_.labels || [] as unknown as ILabels,
    });
  }

  get runData(): IServiceRunData {
    return Utility.deepCopy({
      ...this.metaData,
      listeners: [...this.listenerPool_].map(([_, listener]) => {
        return {
          ...listener.metaData,
          id: listener.id,
          state: listener.state,
          weight: listener.weight,
        };
      }),
    });
  }

  protected get logCategory() {
    return `service.${this.name}`;
  }

  protected get listenerPool() {
    return this.listenerPool_;
  }

  private listenerPool_: Map<string/* id*/, Listener>;
  private discoveryExecutor_: QueueExecutor;
  private serviceOptions_: IServiceOptions;
}

export {Service};
