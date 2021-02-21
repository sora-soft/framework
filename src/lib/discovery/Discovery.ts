import EventEmitter = require('events');
import {DiscoveryListenerEvent, DiscoveryNodeEvent, DiscoveryServiceEvent} from '../../Event';
import {IEventEmitter} from '../../interface/event';
import {IListenerEventData, IListenerMetaData, INodeMetaData, IServiceMetaData} from '../../interface/discovery';
import {ListenerState, WorkerState} from '../../Enum';

export interface IServiceEvent {
  [DiscoveryServiceEvent.ServiceCreated]: (info: IServiceMetaData) => void;
  [DiscoveryServiceEvent.ServiceDeleted]: (id: string, info: IServiceMetaData) => void;
  [DiscoveryServiceEvent.ServiceUpdated]: (id: string, info: IServiceMetaData) => void;
  [DiscoveryServiceEvent.ServiceStateUpdate]: (id: string, state: WorkerState, pre: WorkerState, info: IServiceMetaData) => void;
}

export interface IListenerEvent {
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

abstract class Discovery {
  constructor() {
    this.serviceEmitter_ = new EventEmitter();
    this.listenerEmitter_ = new EventEmitter();
    this.nodeEmitter_ = new EventEmitter();
  }

  // 获取所有节点信息（本地与远端）
  abstract getServiceList(name: string, ): Promise<IServiceMetaData[]>;
  abstract getEndpointList(service: string, ): Promise<IListenerMetaData[]>;
  abstract getNodeList(): Promise<INodeMetaData[]>;

  // 获取单个节点信息（本地与远端）
  abstract getServiceById(id: string): Promise<IServiceMetaData>;

  // 注册本地信息
  abstract registerService(service: IServiceMetaData): Promise<void>;
  abstract registerEndpoint(info: IListenerMetaData): Promise<void>;
  abstract registerNode(node: INodeMetaData): Promise<void>;
  abstract unregisterService(id: string): Promise<void>;
  abstract unregisterEndPoint(id: string): Promise<void>;
  abstract unregisterNode(id: string): Promise<void>;

  protected abstract startup(): Promise<void>;
  protected abstract shutdown(): Promise<void>;

  async connect() {
    await this.startup();
  }

  async disconnect() {
    await this.shutdown();
  }

  get serviceEmitter() {
    return this.serviceEmitter_;
  }

  get listenerEmitter() {
    return this.listenerEmitter_;
  }

  protected serviceEmitter_: IEventEmitter<IServiceEvent>;
  protected listenerEmitter_: IEventEmitter<IListenerEvent>;
  protected nodeEmitter_: IEventEmitter<INodeEvent>;
}

export {Discovery}
