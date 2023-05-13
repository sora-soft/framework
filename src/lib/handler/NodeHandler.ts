import {RPCHeader} from '../../Const.js';
import {FrameworkErrorCode} from '../../ErrorCode.js';
import {IServiceOptions, IWorkerOptions} from '../../interface/config.js';
import {INodeRunData} from '../../interface/node.js';
import {ExError} from '../../utility/ExError.js';
import {Context} from '../Context.js';
import {FrameworkError} from '../FrameworkError.js';
import {Logger} from '../logger/Logger.js';
import {Node} from '../Node.js';
import {Request} from '../rpc/Request.js';
import {Route} from '../rpc/Route.js';
import {Runtime} from '../Runtime.js';

export interface IReqCreateService {
  name: string;
  options: IServiceOptions;
}

export interface IReqCreateWorker {
  name: string;
  options: IWorkerOptions;
}

export interface IReqRemoveWorker {
  id: string;
  reason: string;
}

class NodeHandler extends Route {
  constructor(node: Node) {
    super();
    this.node_ = node;
  }

  @Route.method
  async createService(body: IReqCreateService) {
    if (body.name === 'node')
      throw new FrameworkError(FrameworkErrorCode.ERR_NODE_SERVICE_CANNOT_BE_CREATED, 'ERR_NODE_SERVICE_CANNOT_BE_CREATED');

    const service = Node.serviceFactory(body.name, body.options);
    if (!service)
      throw new FrameworkError(FrameworkErrorCode.ERR_SERVICE_NOT_FOUND, `ERR_SERVICE_NOT_FOUND, name=${body.name}`, undefined, {name: body.name});
    await Runtime.installService(service, new Context());
    return {id: service.id};
  }

  @Route.method
  async createWorker(body: IReqCreateWorker) {
    const worker = Node.workerFactory(body.name, body.options);
    if (!worker)
      throw new FrameworkError(FrameworkErrorCode.ERR_WORKER_NOT_FOUND, `ERR_WORKER_NOT_FOUND, name=${body.name}`, undefined, {name: body.name});
    await Runtime.installWorker(worker);
    return {id: worker.id};
  }

  @Route.method
  async removeService(body: IReqRemoveWorker) {
    if (body.id === this.node_.id)
      throw new FrameworkError(FrameworkErrorCode.ERR_NODE_SERVICE_CANNOT_BE_CLOSED, 'ERR_NODE_SERVICE_CANNOT_BE_CLOSED');
    Runtime.uninstallService(body.id, body.reason).catch((err: ExError) => {
      Runtime.frameLogger.error(`${this.node_.name}.handler`, err, {event: 'uninstall-service-error', error: Logger.errorMessage(err)});
    });
    return {};
  }

  @Route.method
  async removeWorker(body: IReqRemoveWorker) {
    Runtime.uninstallWorker(body.id, body.reason).catch((err: ExError) => {
      Runtime.frameLogger.error(`${this.node_.name}.handler`, err, {event: 'uninstall-worker-error', error: Logger.errorMessage(err)});
    });
    return {};
  }

  @Route.method
  async shutdown() {
    Runtime.shutdown().catch((err: ExError) => {
      Runtime.frameLogger.error(`${this.node_.name}.handler`, err, {event: 'shutdown-error', error: Logger.errorMessage(err)});
    });
    return {};
  }

  @Route.method
  async registerRunningDataNotify(body: void, request: Request<{}>): Promise<INodeRunData | null> {
    const session = request.getHeader<string>(RPCHeader.RPC_SESSION_HEADER);
    if (!session)
      throw new FrameworkError(FrameworkErrorCode.ERR_SESSION_NOT_FOUND, 'ERR_SESSION_NOT_FOUND');
    this.node_.registerBroadcaster('notifyNodeState', session);
    return this.node_.notifiedNodeState;
  }

  @Route.method
  async unregisterRunningDataNotify(body: void, request: Request<{}>) {
    const session = request.getHeader<string>(RPCHeader.RPC_SESSION_HEADER);
    if (!session)
      return {};
    this.node_.unregisterBroadcaster('notifyNodeState', session);
    return {};
  }

  @Route.method
  async fetchRunningData() {
    return this.node_.nodeRunData;
  }

  private node_: Node;
}

export {NodeHandler};
