import os = require('os');
import {INodeOptions, IServiceOptions, IWorkerOptions} from '../interface/config.js';
import {Service} from './Service.js';
import {TCPListener} from './tcp/TCPListener.js';
import {Route} from './rpc/Route.js';
import {NodeHandler} from './handler/NodeHandler.js';
import {INodeMetaData} from '../interface/discovery.js';
import {Broadcaster} from './rpc/Broadcaster.js';
import {INodeNotifyHandler} from './handler/NodeNotifyHandler.js';
import {Runtime} from './Runtime.js';
import {INodeRunData, ServiceBuilder, WorkerBuilder} from '../interface/node.js';
import {Context} from './Context.js';
import {ExError} from '../utility/ExError.js';
import {Logger} from './logger/Logger.js';
import {NodeTime, Utility} from '../utility/Utility.js';
import {TypeGuard} from '@sora-soft/type-guard';
import jsondiffpatch from 'jsondiffpatch';

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
    TypeGuard.assert<INodeOptions>(options);
    this.nodeOptions_ = options;
    this.broadcaster_ = new Broadcaster();
  }

  async startup(context: Context) {
    const route = new NodeHandler(this);
    this.TCPListener_ = new TCPListener(this.nodeOptions_.api, Route.callback(route), {});
    await this.installListener(this.TCPListener_, context);

    this.doJobInterval(async () => {
      const data = this.nodeRunData;
      const diff = jsondiffpatch.diff(this.notifiedNodeState_, data);
      if (diff) {
        this.broadcaster_.notify(this.id).notifyNodeState({
          id: this.id,
          diff,
        }).catch((err: ExError) => {
          Runtime.frameLogger.error('node', err, {event: 'node-broadcast-state-error', error: Logger.errorMessage(err)});
        });
      }
      this.notifiedNodeState_ = JSON.parse(JSON.stringify(data), jsondiffpatch.dateReviver) as INodeRunData;
    }, NodeTime.second(1)).catch(Utility.null);
  }

  async shutdown() {}

  registerBroadcaster(method: keyof INodeNotifyHandler, session: string) {
    const connector = this.TCPListener_.getConnector(session);
    if (!connector)
      return;
    this.broadcaster_.registerConnector(method, connector);
  }

  unregisterBroadcaster(method: keyof INodeNotifyHandler, session: string) {
    this.broadcaster_.unregisterConnector(method, session);
  }

  get nodeRunData(): INodeRunData {
    return {
      services: Runtime.services.map((service) => service.runData),
      workers: Runtime.workers.map((worker) => worker.metaData),
      providers: Runtime.pvdManager.getAllProviders().map((provider) => provider.metaData),
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
  private notifiedNodeState_: INodeRunData;
}

export {Node};
