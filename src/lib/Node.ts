import os = require('os');
import {INodeOptions, IServiceOptions, IWorkerOptions} from '../interface/config';
import {Service} from './Service';
import {TCPListener} from './tcp/TCPListener';
import {Route} from './rpc/Route';
import {NodeHandler} from './handler/NodeHandler';
import {INodeMetaData} from '../interface/discovery';
import {Broadcaster} from './rpc/Broadcaster';
import {INodeNotifyHandler} from './handler/NodeNotifyHandler';
import {Runtime} from './Runtime';
import {INodeRunData, ServiceBuilder, WorkerBuilder} from '../interface/node';
import {Context} from './Context';
import {ExError} from '../utility/ExError';
import {Logger} from './logger/Logger';
import {Utility} from '../utility/Utility';

class Node extends Service {
  static registerWorker(name: string, builder: WorkerBuilder) {
    this.workerBuilder_.set(name, builder);
  }

  static workerFactory(name: string, options: IWorkerOptions) {
    const builder = this.workerBuilder_.get(name);
    if (!builder)
      return null;
    return builder(options);
  }

  static registerService(name: string, builder: ServiceBuilder) {
    this.serviceBuilder_.set(name, builder);
  }

  static serviceFactory(name: string, options: IServiceOptions) {
    const builder = this.serviceBuilder_.get(name);
    if (!builder)
      return null;
    return builder(options);
  }

  private static serviceBuilder_: Map<string, ServiceBuilder> = new Map();
  private static workerBuilder_: Map<string, WorkerBuilder> = new Map();

  constructor(options: INodeOptions) {
    super('node', options);
    this.nodeOptions_ = options;
    this.broadcaster_ = new Broadcaster();
  }

  async startup(context: Context) {
    const route = new NodeHandler(this);
    this.TCPListener_ = new TCPListener(this.nodeOptions_.api, Route.callback(route), {});

    await this.installListener(this.TCPListener_, context);

    this.doJobInterval(async () => {
      this.broadcaster_.notify(this.id).notifyNodeState(this.nodeRunData).catch((err: ExError) => {
        Runtime.frameLogger.error('node', err, {event: 'node-broadcast-state-error', error: Logger.errorMessage(err)});
      });
    }, 1000).catch(Utility.null);
  }

  async shutdown() {}

  registerBroadcaster(method: keyof INodeNotifyHandler, session: string) {
    const socket = this.TCPListener_.getConnector(session);
    if (!socket)
      return;
    this.broadcaster_.registerConnector(method, socket);
  }

  get nodeRunData(): INodeRunData {
    return {
      services: Runtime.services.map((service) => service.runData),
      workers: Runtime.workers.map((worker) => worker.metaData),
      node: Runtime.node.nodeStateData,
    };
  }

  get nodeStateData(): INodeMetaData {
    return {
      id: this.id,
      host: os.hostname(),
      pid: process.pid,
      endpoint: this.TCPListener_.metaData,
      state: this.state,
    };
  }
  private nodeOptions_: INodeOptions;
  private broadcaster_: Broadcaster<INodeNotifyHandler>;
  private TCPListener_: TCPListener;
}

export {Node};
