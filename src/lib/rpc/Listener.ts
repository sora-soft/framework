import {ConnectorState, ListenerState} from '../../Enum';
import {LifeCycle} from '../../utility/LifeCycle';
import {v4 as uuid} from 'uuid';
import {IListenerInfo, IRawNetPacket, IRawResPacket} from '../../interface/rpc';
import {IEventEmitter} from '../../interface/event';
import {LifeCycleEvent, ListenerEvent} from '../../Event';
import {ILabels} from '../../interface/config';
import {EventEmitter} from 'events';
import {Connector} from './Connector';

export interface IListenerEvent {
  [ListenerEvent.NewConnect]: (session: string, connector: Connector, ...args: any[]) => void;
  [ListenerEvent.LostConnect]: (session: string, connector: Connector, ...args: any[]) => void;
}

export type ListenerCallback = (data: IRawNetPacket, session: string, connector: Connector) => Promise<IRawResPacket | null>;

abstract class Listener {
  constructor(callback: ListenerCallback, labels: ILabels = {}) {
    this.lifeCycle_ = new LifeCycle(ListenerState.INIT);
    this.callback_ = callback;
    this.id_ = uuid();
    this.labels_ = labels;
    this.connectionEmitter_ = new EventEmitter();
    this.connectors_ = new Map();
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

  abstract get metaData(): IListenerInfo;
  protected async newConnector(session:string, connector: Connector) {
    connector.session = session;
    this.connectors_.set(session, connector);

    connector.enableResponse(this.callback_.bind(this));

    connector.stateEmitter.on(LifeCycleEvent.StateChangeTo, (state) => {
      switch (state) {
        case ConnectorState.ERROR:
        case ConnectorState.STOPPED:
          if (this.connectors_.delete(connector.session)) {
            connector.destory();
            this.connectionEmitter_.emit(ListenerEvent.LostConnect, session, connector);
          }
          break;
      }
    });
    this.connectionEmitter_.emit(ListenerEvent.NewConnect, session, connector);
  }

  public getConnector(session: string) {
    return this.connectors_.get(session);
  }

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
  protected connectors_: Map<string, Connector>;
  protected lifeCycle_: LifeCycle<ListenerState>;
  protected callback_: ListenerCallback;
  private info_: IListenerInfo;
  private id_: string;
  private labels_: ILabels;
}

export {Listener}
