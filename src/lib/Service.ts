import {WorkerState} from '../Enum';
import {LifeCycleEvent} from '../Event';
import {IServiceOptions} from '../interface/config';
import {IServiceMetaData} from '../interface/discovery';
import {Listener} from './rpc/Listener';
import {Runtime} from './Runtime';
import {Worker} from './Worker';

abstract class Service extends Worker {
  constructor(name: string, options: IServiceOptions) {
    super(name);
    this.options_ = options;
    this.listenerPool_ = new Map();

    this.lifeCycle_.addHandler(WorkerState.STOPPED, async () => {
      for (const id of this.listenerPool_.keys()) {
        await this.uninstallListener(id).catch((err: Error) => {
          // TODO: logging
        });
      }
    });

    this.lifeCycle_.emitter.on(LifeCycleEvent.StateChangeTo, (state: WorkerState) => {
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

    await Runtime.discovery.registerEndpoint({
      ...listener.metaData,
      state: listener.state,
      targetId: this.id,
    });

    listener.stateEventEmitter.on(LifeCycleEvent.StateChange, () => {
      Runtime.discovery.registerEndpoint({
        ...listener.metaData,
        state: listener.state,
        targetId: this.id,
      });
    });

    await listener.startListen();

    this.listenerPool_.set(listener.id, listener);
  }

  public async uninstallListener(id: string) {
    const listener = this.listenerPool_.get(id);
    if (!listener)
      return;

    await listener.stopListen();

    await Runtime.discovery.unregisterEndPoint(id);
    this.listenerPool_.delete(id);
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

  private listenerPool_: Map<string/*id*/, Listener>;
  private options_: IServiceOptions;
}

export {Service};
