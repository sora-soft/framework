import {ConnectorState, ListenerState} from '../../Enum.js';
import {LifeCycle} from '../../utility/LifeCycle.js';
import {v4 as uuid} from 'uuid';
import {IListenerInfo, IRawReqPacket, IRawResPacket} from '../../interface/rpc.js';
import {IEventEmitter} from '../../interface/event.js';
import {LifeCycleEvent, ListenerEvent, ListenerWeightEvent} from '../../Event.js';
import {ILabels} from '../../interface/config.js';
import {EventEmitter} from 'events';
import {Connector} from './Connector.js';
import {Context} from '../Context.js';
import {ExError} from '../../utility/ExError.js';
import {Runtime} from '../Runtime.js';
import {Logger} from '../logger/Logger.js';

export interface IListenerEvent {
  [ListenerEvent.NewConnect]: (session: string, connector: Connector, ...args: any[]) => void;
  [ListenerEvent.LostConnect]: (session: string, connector: Connector, ...args: any[]) => void;
}

export interface IListenerWeightEvent {
  [ListenerWeightEvent.WeightChange]: (to: number, from: number) => void;
}

export type ListenerCallback<Req=unknown, Res=unknown> = (data: IRawReqPacket<Req>, session: string | undefined, connector: Connector) => Promise<IRawResPacket<Res> | null>;

abstract class Listener {
  constructor(callback: ListenerCallback, labels: ILabels = {}) {
    this.lifeCycle_ = new LifeCycle(ListenerState.INIT, false);
    this.callback_ = callback;
    this.id_ = uuid();
    this.labels_ = labels;
    this.connectionEmitter_ = new EventEmitter();
    this.weightEmitter_ = new EventEmitter();
    this.connectors_ = new Map();
    this.weight_ = 100;
    this.startContext_ = null;
  }

  protected abstract listen(context: Context): Promise<IListenerInfo>;
  public async startListen(context?: Context) {
    this.startContext_ = new Context(context);
    this.lifeCycle_.setState(ListenerState.PENDING);
    this.info_ = await this.listen(this.startContext_).catch((err: ExError) => {
      this.onError(err);
      throw err;
    }) ;
    this.lifeCycle_.setState(ListenerState.READY);
    this.startContext_.complete();
    this.startContext_ = null;
  }

  protected abstract shutdown(): Promise<void>;
  public async stopListen() {
    this.startContext_?.abort();
    this.startContext_ = null;
    this.lifeCycle_.setState(ListenerState.STOPPING);
    await this.shutdown();
    this.lifeCycle_.setState(ListenerState.STOPPED);
  }

  abstract get metaData(): IListenerInfo;
  protected newConnector(session:string, connector: Connector) {
    connector.session = session;
    this.connectors_.set(session, connector);

    connector.enableResponse(this.callback_.bind(this) as ListenerCallback<unknown, unknown>);

    connector.stateEmitter.on(LifeCycleEvent.StateChangeTo, (state) => {
      switch (state) {
        case ConnectorState.ERROR:
        case ConnectorState.STOPPED:
          if (!connector.session)
            return;
          if (this.connectors_.delete(connector.session)) {
            connector.off().catch((err: ExError) => {
              Runtime.rpcLogger.error('listener', err, {event: 'listener-connector-off-error', error: Logger.errorMessage(err)});
            });
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

  public setWeight(weight: number) {
    if (weight < 0)
      throw TypeError('listener weight should larger than 0');
    const origin = this.weight;
    this.weight_ = weight;
    this.weightEmitter_.emit(ListenerWeightEvent.WeightChange, weight, origin);
  }

  private onError(err: Error) {
    void this.lifeCycle_.setState(ListenerState.ERROR, err);
    throw err;
  }

  get info() {
    return this.info_;
  }

  get stateEventEmitter() {
    return this.lifeCycle_.emitter;
  }

  get weightEventEmiiter() {
    return this.weightEmitter_;
  }

  get state() {
    return this.lifeCycle_.state;
  }

  get weight() {
    return this.weight_;
  }

  get id() {
    return this.id_;
  }

  get labels() {
    const protocol = this.info_ ? this.info_.protocol : null;
    if (protocol)
      return {
        protocol,
        ...this.labels_,
      };
    else
      return this.labels_;
  }

  get connectionEmitter() {
    return this.connectionEmitter_;
  }

  abstract get version (): string;

  protected connectionEmitter_: IEventEmitter<IListenerEvent>;
  protected weightEmitter_: IEventEmitter<IListenerWeightEvent>;
  protected connectors_: Map<string, Connector>;
  protected lifeCycle_: LifeCycle<ListenerState>;
  protected callback_: ListenerCallback;
  private info_?: IListenerInfo;
  private id_: string;
  private labels_: ILabels;
  private startContext_: Context | null;
  private weight_: number;
}

export {Listener};
