import {ListenerState, OPCode} from '../../Enum';
import {LifeCycle} from '../../utility/LifeCycle';
import {v4 as uuid} from 'uuid';
import {IListenerInfo, IRawNetPacket, IRawResPacket} from '../../interface/rpc';
import {Executor} from '../../utility/Executor';
import {IEventEmitter} from '../../interface/event';
import {ListenerEvent} from '../../Event';
import {ILabels} from '../../interface/config';
import {EventEmitter} from 'events';

export interface IListenerEvent {
  [ListenerEvent.NewConnect]: (session: string, ...args: any[]) => void;
}

export type ListenerCallback = (data: IRawNetPacket, session: string) => Promise<IRawResPacket>;

abstract class Listener {
  constructor(callback: ListenerCallback, executor: Executor, labels: ILabels = {}) {
    this.lifeCycle_ = new LifeCycle(ListenerState.INIT);
    this.callback_ = callback;
    this.executor_ = executor;
    this.id_ = uuid();
    this.labels_ = labels;
    this.connectionEmitter_ = new EventEmitter();
  }

  protected abstract listen(): Promise<IListenerInfo>;
  public async startListen() {
    await this.lifeCycle_.setState(ListenerState.PENDING);
    this.info_ = await this.listen().catch(this.onError.bind(this)) as IListenerInfo;
    await this.lifeCycle_.setState(ListenerState.READY);
  }

  protected abstract shutdown(): Promise<void>;
  public async stopListen() {
    await this.lifeCycle_.setState(ListenerState.STOPPING);
    await this.shutdown();
    await this.lifeCycle_.setState(ListenerState.STOPPED);
  }

  // 只有通过 handleMessage 才能拿到 callback，保证所有处理都是在 executor 内进行的
  protected async handleMessage(handler: (callback: ListenerCallback) => Promise<void>) {
    return this.executor_.doJob(async () => {
      await handler(this.callback_);
    });
  }

  abstract get metaData(): IListenerInfo;

  private async onError(err: Error) {
    await this.lifeCycle_.setState(ListenerState.ERROR, err);
    throw err;
  }

  get info() {
    return this.info_;
  }

  get stateEventEmitter() {
    return this.lifeCycle_.emitter;
  }

  get state() {
    return this.lifeCycle_.state;
  }

  get id() {
    return this.id_;
  }

  get labels() {
    const protocol = this.info_ ? this.info_.protocol : null;
    if (protocol)
      return {
        protocol,
        ...this.labels_
      };
    else
      return this.labels_;
  }

  get connectionEmitter() {
    return this.connectionEmitter_;
  }

  abstract get version (): string;

  protected connectionEmitter_: IEventEmitter<IListenerEvent>;
  protected lifeCycle_: LifeCycle<ListenerState>;
  private callback_: ListenerCallback;
  private info_: IListenerInfo;
  private id_: string;
  private executor_: Executor;
  private labels_: ILabels;
}

export {Listener}
