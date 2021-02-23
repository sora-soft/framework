import {FrameworkErrorCode} from '../../ErrorCode';
import {IServiceOptions, IWorkerOptions} from '../../interface/config';
import {FrameworkError} from '../FrameworkError';
import {Node} from '../Node';
import {Route} from '../rpc/Route';
import {Runtime} from '../Runtime';

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
  @Route.method
  async createService(body: IReqCreateService) {
    const service = Node.serviceFactory(body.name, body.options);
    if (!service)
      throw new FrameworkError(FrameworkErrorCode.ERR_SERVICE_NOT_FOUND, `ERR_SERVICE_NOT_FOUND, name=${body.name}`);
    await Runtime.installService(service);
    return {id: service.id};
  }

  @Route.method
  async createWorker(body: IReqCreateWorker) {
    const worker = Node.workerFactory(body.name, body.options);
    if (!worker)
      throw new FrameworkError(FrameworkErrorCode.ERR_WORKER_NOT_FOUND, `ERR_WORKER_NOT_FOUND, name=${body.name}`);
    await Runtime.installWorker(worker);
    return {id: worker.id};
  }

  @Route.method
  async removeService(body: IReqRemoveWorker) {
    Runtime.uninstallService(body.id, body.reason);
    return {};
  }

  @Route.method
  async removeWorker(body: IReqRemoveWorker) {
    Runtime.uninstallWorker(body.id, body.reason);
    return {};
  }

  @Route.method
  async fetchRunningData() {
    return {
      services: Runtime.services.map((service) => service.metaData),
      workers: Runtime.workers.map((worker) => worker.metaData),
      node: Runtime.node.nodeMetaData,
    }
  }
}

export {NodeHandler}
