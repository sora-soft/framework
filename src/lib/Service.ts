import {ListenerState, WorkerState} from '../Enum';
import {LifeCycleEvent} from '../Event';
import {IServiceOptions} from '../interface/config';
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

    this.lifeCycle_.addHandler(WorkerState.STOPPED, async () => {
      for (const id of this.listenerPool_.keys()) {
        await this.uninstallListener(id).catch((err: Error) => {
          Runtime.frameLogger.error(this.logCategory, err, { event: 'service-uninstall-listener', error: Logger.errorMessage(err) });
        });
      }
    });

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

  public async installListener(listener: Listener) {

    Runtime.frameLogger.info(this.logCategory, { event: 'install-listener', serviceId: this.id, meta: listener.metaData });

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
          Runtime.frameLogger.error(this.logCategory, err, { event: 'listener-err', id: listener.id, preState: pre, error: Logger.errorMessage(err) });
          this.uninstallListener(listener.id);
          break;
      }
    });

    await listener.startListen();

    Runtime.frameLogger.success(this.logCategory, { event: 'listener-started', serviceId: this.id, meta: listener.metaData });

    this.listenerPool_.set(listener.id, listener);
  }

  public async uninstallListener(id: string) {
    const listener = this.listenerPool_.get(id);
    if (!listener)
      return;

    Runtime.frameLogger.info(this.logCategory, { event: 'uninstall-listener', serviceId: this.id, meta: listener.metaData });

    this.listenerPool_.delete(id);
    await listener.stopListen();

    Runtime.frameLogger.success(this.logCategory, { event: 'listener-stopped', serviceId: this.id, meta: listener.metaData });

    await Runtime.discovery.unregisterEndPoint(id);
  }

  get metaData(): IServiceMetaData {
    return {
      name: this.name,
      id: this.id,
      nodeId: Runtime.node.id,
      state: this.state,
      labels: this.options_.labels
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
