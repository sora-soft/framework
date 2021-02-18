import {WorkerState} from '../Enum';
import {Listener} from './rpc/Listener';
import {Worker} from './Worker';

abstract class Service extends Worker {
  constructor(name: string) {
    super(name);
    this.listenerPool_ = new Map();

    this.lifeCycle_.addHandler(WorkerState.STOPPED, async () => {
      for (const id of this.listenerPool_.keys()) {
        await this.uninstallListener(id).catch(() => {
          // TODO: logging
        });
      }
    });
  }

  public async installListener(listener: Listener) {

    await listener.startListen();

    this.listenerPool_.set(listener.id, listener);
  }

  public async uninstallListener(id: string) {
    const listener = this.listenerPool_.get(id);
    if (!listener)
      return;

    await listener.stopListen();

    this.listenerPool_.delete(id);
  }

  private listenerPool_: Map<string/*id*/, Listener>;
}

export {Service};
