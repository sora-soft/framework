import {ConnectorCommand, ConnectorState, ListenerState} from '../../Enum.js';
import {LifeCycle} from '../../utility/LifeCycle.js';
import {v4 as uuid} from 'uuid';
import {IListenerInfo, IRawReqPacket, IRawResPacket} from '../../interface/rpc.js';
import {ILabels} from '../../interface/config.js';
import {Connector} from './Connector.js';
import {Context} from '../Context.js';
import {ExError} from '../../utility/ExError.js';
import {Runtime} from '../Runtime.js';
import {Logger} from '../logger/Logger.js';
import {SubscriptionManager} from '../../utility/SubscriptionManager.js';
import {BehaviorSubject, Subject} from 'rxjs';


export enum ListenerConnectionEventType {
  NewConnection = 'new-connection',
  LostConnection = 'lost-connection',
}

export interface IListenerConnectionEvent {
  type: ListenerConnectionEventType;
  connector: Connector;
  session: string;
}

export type ListenerCallback<Req=unknown, Res=unknown> = (data: IRawReqPacket<Req>, session: string | undefined, connector: Connector) => Promise<IRawResPacket<Res> | null>;

abstract class Listener {
  constructor(callback: ListenerCallback, labels: ILabels = {}) {
    this.lifeCycle_ = new LifeCycle(ListenerState.INIT, false);
    this.callback_ = callback;
    this.id_ = uuid();
    this.labels_ = labels;
    this.connectionSubject_ = new Subject();
    this.connectors_ = new Map();
    this.weight_ = 100;
    this.startContext_ = null;
    this.weightSubject_ = new BehaviorSubject(this.weight);
    this.subManager_ = new SubscriptionManager();
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
    this.closeAllConnector();
    await this.shutdown();
    this.lifeCycle_.setState(ListenerState.STOPPED);
    this.subManager_.destroy();
  }

  abstract get metaData(): IListenerInfo;
  protected newConnector(session:string, connector: Connector) {
    connector.session = session;
    this.connectors_.set(session, connector);

    connector.enableResponse(this.callback_.bind(this) as ListenerCallback<unknown, unknown>);

    const sub = connector.stateSubject.subscribe((state) => {
      switch (state) {
        case ConnectorState.ERROR:
        case ConnectorState.STOPPED:
          if (!connector.session)
            return;
          if (this.connectors_.delete(connector.session)) {
            connector.off().catch((err: ExError) => {
              Runtime.rpcLogger.error('listener', err, {event: 'listener-connector-off-error', error: Logger.errorMessage(err)});
            });
            this.connectionSubject_.next({
              type: ListenerConnectionEventType.LostConnection,
              connector,
              session,
            });
          }
          break;
      }
    });
    this.subManager_.register(sub);

    this.connectionSubject.next({
      type: ListenerConnectionEventType.NewConnection,
      connector,
      session,
    });
  }

  protected closeAllConnector() {
    for (const [_, connector] of [...this.connectors_]) {
      connector.sendCommand(ConnectorCommand.Close, {}).catch(() => {});
    }
  }

  public getConnector(session: string) {
    return this.connectors_.get(session);
  }

  public setWeight(weight: number) {
    if (weight < 0)
      throw TypeError('listener weight should larger than 0');
    this.weight_ = weight;
    this.weightSubject_.next(weight);
  }

  private onError(err: Error) {
    void this.lifeCycle_.setState(ListenerState.ERROR);
    throw err;
  }

  get info() {
    return this.info_;
  }

  get stateSubject() {
    return this.lifeCycle_.stateSubject;
  }

  get weightSubject() {
    return this.weightSubject_;
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

  get connectionSubject() {
    return this.connectionSubject_;
  }

  get connectors() {
    return this.connectors_;
  }

  abstract get version (): string;

  protected connectionSubject_: Subject<IListenerConnectionEvent>;
  protected weightSubject_: BehaviorSubject<number>;
  protected connectors_: Map<string, Connector>;
  protected lifeCycle_: LifeCycle<ListenerState>;
  protected callback_: ListenerCallback;
  private info_?: IListenerInfo;
  private id_: string;
  private labels_: ILabels;
  private startContext_: Context | null;
  private weight_: number;
  private subManager_: SubscriptionManager;
}

export {Listener};
