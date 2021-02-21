import os = require('os');
import {INodeOptions, IServiceOptions, IWorkerOptions} from '../interface/config';
import {Service} from './Service';
import {TCPListener} from './tcp/TCPListener';
import {Route} from './rpc/Route';
import {NodeHandler} from './handler/NodeHandler';
import {INodeMetaData} from '../interface/discovery';
import {Worker} from './Worker';

export type serviceBuilder = (options: IServiceOptions) => Service;
export type workerBuilder = (options: IWorkerOptions) => Worker;

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
  }

  async startup() {
    const route = new NodeHandler(this);
    this.listener_ = new TCPListener(this.nodeOptions_.api, Route.callback(route), this.executor);
    await this.installListener(this.listener_);
  }

  async shutdown() {}

  get nodeMetaData(): INodeMetaData {
    return {
      id: this.id,
      host: os.hostname(),
      pid: process.pid,
      endpoint: this.listener_.metaData,
      state: this.state,
    }
  }
  private nodeOptions_: INodeOptions;
  private listener_: TCPListener;
}

export {Node};
