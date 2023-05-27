import {IListenerMetaData, INodeMetaData, IServiceMetaData, IWorkerMetaData} from '../../interface/discovery.js';
import {Context} from '../Context.js';
import {Election} from '../Election.js';
import {BehaviorSubject} from 'rxjs';

export interface IDiscoveryInfo {
  version: string;
  type: string;
}

abstract class Discovery {
  constructor() {
    this.serviceSubject_ = new BehaviorSubject([]);
    this.workerSubject_ = new BehaviorSubject([]);
    this.listenerSubject_ = new BehaviorSubject([]);
    this.nodeSubject_ = new BehaviorSubject([]);
    this.startupContext_ = null;
  }

  // 获取所有节点信息（本地与远端）
  abstract getAllServiceList(): Promise<IServiceMetaData[]>;
  abstract getServiceList(name: string): Promise<IServiceMetaData[]>;
  abstract getAllEndpointList(): Promise<IListenerMetaData[]>;
  abstract getEndpointList(service: string): Promise<IListenerMetaData[]>;
  abstract getNodeList(): Promise<INodeMetaData[]>;
  abstract getAllWorkerList(): Promise<IWorkerMetaData[]>;
  abstract getWorkerList(worker: string): Promise<IWorkerMetaData[]>;

  // 获取单个节点信息（本地与远端）
  abstract getServiceById(id: string): Promise<IServiceMetaData | undefined>;
  abstract getWorkerById(id: string): Promise<IWorkerMetaData | undefined>;
  abstract getNodeById(id: string): Promise<INodeMetaData | undefined>;
  abstract getEndpointById(id: string): Promise<IListenerMetaData | undefined>;

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
    this.startupContext_.complete();
    this.startupContext_ = null;
  }

  async disconnect() {
    this.startupContext_?.abort();
    this.startupContext_ = null;
    await this.shutdown();
    this.nodeSubject_.complete();
    this.workerSubject_.complete();
    this.serviceSubject_.complete();
    this.listenerSubject_.complete();
  }

  get serviceSubject() {
    return this.serviceSubject_;
  }

  get listenerSubject() {
    return this.listenerSubject_;
  }

  get workerSubject() {
    return this.workerSubject_;
  }

  get nodeSubject() {
    return this.nodeSubject_;
  }

  abstract get version(): string;

  abstract get info(): IDiscoveryInfo;
  protected serviceSubject_: BehaviorSubject<IServiceMetaData[]>;
  protected listenerSubject_: BehaviorSubject<IListenerMetaData[]>;
  protected nodeSubject_: BehaviorSubject<INodeMetaData[]>;
  protected workerSubject_: BehaviorSubject<IWorkerMetaData[]>;
  private startupContext_: Context | null;
}

export {Discovery};
