import {ListenerState, WorkerState} from '../Enum';
import {LifeCycleEvent} from '../Event';
import {ILabels, IServiceOptions} from '../interface/config';
import {IServiceMetaData, IServiceRunData} from '../interface/discovery';
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

      Runtime.frameLogger.debug(this.logCategory, { event: 'service-state-change', state });

      switch (state) {
        case WorkerState.ERROR:
          for (const [id] of this.listenerPool_) {
            this.uninstallListener(id);
          }
          break;
      }
    });
  }

  async stop(reason: string) {
    await this.lifeCycle_.setState(WorkerState.STOPPING);
    this.intervalJobTimer_.clearAll();
    await this.executor_.stop();
    for (const id of this.listenerPool_.keys()) {
      await this.uninstallListener(id).catch((err: Error) => {
        Runtime.frameLogger.error(this.logCategory, err, { event: 'service-uninstall-listener', error: Logger.errorMessage(err) });
      });
    }
    await this.shutdown(reason).catch(this.onError.bind(this));
    await this.lifeCycle_.setState(WorkerState.STOPPED);
  }

  public async installListener(listener: Listener) {

    Runtime.frameLogger.info(this.logCategory, { event: 'install-listener', name: this.name, id: this.id, meta: listener.metaData, version: listener.version });

    {
      const labels = {
        ...this.metaData.labels,
        ...listener.labels,
      }

      await Runtime.discovery.registerEndpoint({
        ...listener.metaData,
        state: listener.state,
        targetId: this.id,
        labels,
      });
    }

    listener.stateEventEmitter.on(LifeCycleEvent.StateChange, async (pre, state, err: Error) => {
      const labels = {
        ...this.metaData.labels,
        ...listener.labels,
      }

      Runtime.discovery.registerEndpoint({
        ...listener.metaData,
        state: listener.state,
        targetId: this.id,
        labels,
      });

      switch (state) {
        case ListenerState.ERROR:
          Runtime.frameLogger.error(this.logCategory, err, { event: 'listener-err', name: this.name, id: this.id, listenerId: listener.id, preState: pre, error: Logger.errorMessage(err) });
          this.uninstallListener(listener.id);
          break;
      }
    });

    this.listenerPool_.set(listener.id, listener);

    await listener.startListen();

    Runtime.frameLogger.success(this.logCategory, { event: 'listener-started', name: this.name, id: this.id, meta: listener.metaData, version: listener.version });

  }

  public async uninstallListener(id: string) {
    const listener = this.listenerPool_.get(id);
    if (!listener)
      return;

    Runtime.frameLogger.info(this.logCategory, { event: 'uninstall-listener', name: this.name, id: this.id, meta: listener.metaData });

    this.listenerPool_.delete(id);
    await listener.stopListen();

    Runtime.frameLogger.success(this.logCategory, { event: 'listener-stopped', name: this.name, id: this.id, meta: listener.metaData });

    await Runtime.discovery.unregisterEndPoint(id);
  }

  get metaData(): IServiceMetaData {
    return {
      name: this.name,
      id: this.id,
      nodeId: Runtime.node.id,
      state: this.state,
      labels: this.options_.labels || [] as unknown as ILabels,
    }
  }

  get runData(): IServiceRunData {
    return {
      ...this.metaData,
      listeners: [...this.listenerPool_].map(([id, listener]) => {
        return {
          ...listener.metaData,
          state: listener.state,
        };
      })
    };
  }

  protected get logCategory() {
    return `service.${this.name}`
  }

  private listenerPool_: Map<string/*id*/, Listener>;
  private options_: IServiceOptions;
}

export {Service};
