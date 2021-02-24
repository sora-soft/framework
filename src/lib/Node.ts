import os = require('os');
import {INodeOptions, IServiceOptions, IWorkerOptions} from '../interface/config';
import {Service} from './Service';
import {TCPListener} from './tcp/TCPListener';
import {Route} from './rpc/Route';
import {NodeHandler} from './handler/NodeHandler';
import {INodeMetaData, IServiceMetaData, IWorkerMetaData} from '../interface/discovery';
import {TCPSender} from './tcp/TCPSender';
import {Broadcaster} from './rpc/Broadcaster';
import {INodeNotifyHandler} from './handler/NodeNotifyHandler';
import {Runtime} from './Runtime';
import {INodeRunData, serviceBuilder, workerBuilder} from '../interface/node';

class Node extends Service {
  static registerWorker(name: string, builder: workerBuilder) {
    this.workerBuilder_.set(name, builder);
  }

  static workerFactory(name: string, options: IWorkerOptions) {
    const builder = this.workerBuilder_.get(name);
    if (!builder)
      return null;
    return builder(options);
  }

  static registerService(name: string, builder: serviceBuilder) {
    this.serviceBuilder_.set(name, builder);
  }

  static serviceFactory(name: string, options: IServiceOptions) {
    const builder = this.serviceBuilder_.get(name);
    if (!builder)
      return null;
    return builder(options);
  }

  private static serviceBuilder_: Map<string, serviceBuilder> = new Map();
  private static workerBuilder_: Map<string, workerBuilder> = new Map();

  constructor(options: INodeOptions) {
    super('node', options);
    this.nodeOptions_ = options;
    this.broadcaster_ = new Broadcaster();
  }

  async startup() {
    const route = new NodeHandler(this);
    this.TCPListener_ = new TCPListener(this.nodeOptions_.api, Route.callback(route), this.executor);

    await this.installListener(this.TCPListener_);

    this.doJobInterval(async () => {
      this.broadcaster_.notify(this.id).notifyNodeState(this.nodeRunData);
    }, 1000);
  }

  async shutdown() {}

  registerBroadcaster(method: keyof INodeNotifyHandler, session: string) {
    const socket = this.TCPListener_.getSocket(session);
    if (!socket)
      return;
    const sender = new TCPSender(this.TCPListener_.id, this.id, socket);
    this.broadcaster_.registerSender(method, sender);
  }

  get nodeRunData(): INodeRunData {
    return {
      services: Runtime.services.map((service) => service.metaData),
      workers: Runtime.workers.map((worker) => worker.metaData),
      node: Runtime.node.nodeStateData,
    }
  }

  get nodeStateData(): INodeMetaData {
    return {
      id: this.id,
      host: os.hostname(),
      pid: process.pid,
      endpoint: this.TCPListener_.metaData,
      state: this.state,
    }
  }
  private nodeOptions_: INodeOptions;
  private broadcaster_: Broadcaster<INodeNotifyHandler>;
  private TCPListener_: TCPListener;
}

export {Node};
