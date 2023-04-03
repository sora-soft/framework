import EventEmitter = require('events');
import {DiscoveryEvent, DiscoveryListenerEvent, DiscoveryNodeEvent, DiscoveryServiceEvent} from '../../Event.js';
import {IEventEmitter} from '../../interface/event.js';
import {IListenerEventData, IListenerMetaData, INodeMetaData, IServiceMetaData, IWorkerMetaData} from '../../interface/discovery.js';
import {ListenerState, WorkerState} from '../../Enum.js';
import {Context} from '../Context.js';
import {Election} from '../Election.js';

export interface IServiceEvent {
  [DiscoveryServiceEvent.ServiceCreated]: (info: IServiceMetaData) => void;
  [DiscoveryServiceEvent.ServiceDeleted]: (id: string, info: IServiceMetaData) => void;
  [DiscoveryServiceEvent.ServiceUpdated]: (id: string, info: IServiceMetaData) => void;
  [DiscoveryServiceEvent.ServiceStateUpdate]: (id: string, state: WorkerState, pre: WorkerState, info: IServiceMetaData) => void;
}

export interface IDiscoveryListenerEvent {
  [DiscoveryListenerEvent.ListenerCreated]: (info: IListenerEventData) => void;
  [DiscoveryListenerEvent.ListenerDeleted]: (id: string, info: IListenerEventData) => void;
  [DiscoveryListenerEvent.ListenerUpdated]: (id: string, info: IListenerEventData) => void;
  [DiscoveryListenerEvent.ListenerStateUpdate]: (id: string, state: ListenerState, pre: ListenerState, info: IListenerEventData) => void;
}

export interface INodeEvent {
  [DiscoveryNodeEvent.NodeCreated]: (info: INodeMetaData) => void;
  [DiscoveryNodeEvent.NodeUpdated]: (id: string, info: INodeMetaData) => void;
  [DiscoveryNodeEvent.NodeDeleted]: (id: string, info: INodeMetaData) => void;
  [DiscoveryNodeEvent.NodeStateUpdate]: (id: string, state: WorkerState, pre: WorkerState, info: INodeMetaData) => void;
}

export interface IDiscoveryEvent {
  [DiscoveryEvent.DiscoveryReconnect]: () => void;
}

export interface IDiscoveryInfo {
  version: string;
  type: string;
}

abstract class Discovery {
  constructor() {
    this.serviceEmitter_ = new EventEmitter();
    this.listenerEmitter_ = new EventEmitter();
    this.nodeEmitter_ = new EventEmitter();
    this.discoveryEmitter_ = new EventEmitter();
  }

  // 获取所有节点信息（本地与远端）
  abstract getAllServiceList(): Promise<IServiceMetaData[]>;
  abstract getServiceList(name: string, ): Promise<IServiceMetaData[]>;
  abstract getAllEndpointList(): Promise<IListenerMetaData[]>;
  abstract getEndpointList(service: string, ): Promise<IListenerMetaData[]>;
  abstract getNodeList(): Promise<INodeMetaData[]>;

  // 获取单个节点信息（本地与远端）
  abstract getServiceById(id: string): Promise<IServiceMetaData>;

  // 注册本地信息
  abstract registerWorker(worker: IWorkerMetaData): Promise<void>;
  abstract registerService(service: IServiceMetaData): Promise<void>;
  abstract registerEndpoint(info: IListenerMetaData): Promise<void>;
  abstract registerNode(node: INodeMetaData): Promise<void>;
  abstract unregisterWorker(id: string): Promise<void>;
  abstract unregisterService(id: string): Promise<void>;
  abstract unregisterEndPoint(id: string): Promise<void>;
  abstract unregisterNode(id: string): Promise<void>;

  // 创建选举机
  abstract createElection(name: string): Election;

  protected abstract startup(context: Context): Promise<void>;
  protected abstract shutdown(): Promise<void>;

  async connect(context: Context) {
    this.startupContext_ = new Context(context);
    await this.startup(this.startupContext_);
    this.startupContext_ = null;
  }

  async disconnect() {
    this.startupContext_?.abort();
    this.startupContext_ = null;
    await this.shutdown();
  }

  get serviceEmitter() {
    return this.serviceEmitter_;
  }

  get listenerEmitter() {
    return this.listenerEmitter_;
  }

  get discoveryEmitter() {
    return this.discoveryEmitter_;
  }

  get nodeEmitter() {
    return this.nodeEmitter_;
  }

  abstract get version(): string;

  abstract get info(): IDiscoveryInfo;

  protected serviceEmitter_: IEventEmitter<IServiceEvent>;
  protected listenerEmitter_: IEventEmitter<IDiscoveryListenerEvent>;
  protected nodeEmitter_: IEventEmitter<INodeEvent>;
  protected discoveryEmitter_: IEventEmitter<IDiscoveryEvent>;
  private startupContext_: Context | null;
}

export {Discovery};
