import {ListenerState, WorkerState} from '../Enum';
import {LifeCycleEvent} from '../Event';
import {ILabels, IServiceOptions} from '../interface/config';
import {IServiceMetaData, IServiceRunData} from '../interface/discovery';
import {ExError} from '../utility/ExError';
import {Context} from './Context';
import {Logger} from './logger/Logger';
import {Listener} from './rpc/Listener';
import {Runtime} from './Runtime';
import {Worker} from './Worker';

abstract class Service extends Worker {
  constructor(name: string, options: IServiceOptions) {
    super(name);
    this.options_ = options;
    if (!this.options_.labels)
      this.options_.labels = {};

    this.listenerPool_ = new Map();

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
    await this.lifeCycle_.setState(WorkerState.STOPPING);
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
    await this.lifeCycle_.setState(WorkerState.STOPPED);
  }

  public async installListener(listener: Listener, ctx?: Context) {
    if (!ctx)
      ctx = new Context();

    Runtime.frameLogger.info(this.logCategory, {event: 'install-listener', name: this.name, id: this.id, meta: listener.metaData, version: listener.version});

    {
      const labels = {
        ...this.metaData.labels,
        ...listener.labels,
      };

      await ctx.await(Runtime.discovery.registerEndpoint({
        ...listener.metaData,
        id: listener.id,
        state: listener.state,
        targetId: this.id,
        labels,
      }));
    }

    listener.stateEventEmitter.on(LifeCycleEvent.StateChange, async (pre, state, err: Error) => {
      const labels = {
        ...this.metaData.labels,
        ...listener.labels,
      };

      Runtime.discovery.registerEndpoint({
        ...listener.metaData,
        id: listener.id,
        state: listener.state,
        targetId: this.id,
        labels,
      }).catch((e: ExError) => {
        Runtime.frameLogger.error('service', e, {event: 'register-service-endpoint', error: Logger.errorMessage(e)});
      });

      switch (state) {
        case ListenerState.ERROR:
          Runtime.frameLogger.error(this.logCategory, err, {event: 'listener-err', name: this.name, id: this.id, listenerId: listener.id, preState: pre, error: Logger.errorMessage(err)});
          this.uninstallListener(listener.id).catch((e: ExError) => {
            Runtime.frameLogger.error('service', e, {event: 'uninstall-listener', error: Logger.errorMessage(e)});
          });
          break;
      }
    });

    this.listenerPool_.set(listener.id, listener);

    await listener.startListen();

    Runtime.frameLogger.success(this.logCategory, {event: 'listener-started', name: this.name, id: this.id, meta: listener.metaData, version: listener.version});

  }

  public async registerEndpoints() {
    for (const [_, listener] of this.listenerPool_.entries()) {
      const labels = {
        ...this.metaData.labels,
        ...listener.labels,
      };

      await Runtime.discovery.registerEndpoint({
        ...listener.metaData,
        id: listener.id,
        state: listener.state,
        targetId: this.id,
        labels,
      });
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

    await Runtime.discovery.unregisterEndPoint(id);
  }

  get metaData(): IServiceMetaData {
    return {
      name: this.name,
      id: this.id,
      nodeId: Runtime.node.id,
      state: this.state,
      labels: this.options_.labels || [] as unknown as ILabels,
    };
  }

  get runData(): IServiceRunData {
    return {
      ...this.metaData,
      listeners: [...this.listenerPool_].map(([_, listener]) => {
        return {
          ...listener.metaData,
          id: listener.id,
          state: listener.state,
        };
      })
    };
  }

  protected get logCategory() {
    return `service.${this.name}`;
  }

  protected get listenerPool() {
    return this.listenerPool_;
  }

  private listenerPool_: Map<string/* id*/, Listener>;
  private options_: IServiceOptions;
}

export {Service};
