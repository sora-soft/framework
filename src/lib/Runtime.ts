import {WorkerState} from '../Enum';
import {LifeCycleEvent} from '../Event';
import {IRuntimeOptions, IServiceOptions} from '../interface/config';
import {Discovery} from './discovery/Discovery';
import {Node} from './Node'
import {Service} from './Service';
import {Worker} from './Worker';

class Runtime {

  static async loadConfig(options: IRuntimeOptions) {
    this.scope_ = options.scope;
  }

  static async startup(node: Node, discovery: Discovery) {
    this.discovery_ = discovery;
    await this.discovery_.connect();
    this.node_ = node;
    await this.installService(node);

    await this.discovery_.registerNode(this.node_.nodeMetaData);

    process.on('uncaughtException', (err) => {
      // TODO
    });

    process.on('unhandledRejection', (err) => {
      // TODO
    })
  }

  static async shutdown() {
    const promises = [];
    for (const [id, service] of [...this.services_]) {
      const promise = this.uninstallService(id, 'runtime_shutdown');
      promises.push(promise);
    }
    await Promise.all(promises);
  }

  static async installService(service: Service) {
    if (this.services_.has(service.id))
      return;
    this.services_.set(service.id, service);

    service.stateEventEmitter.on(LifeCycleEvent.StateChange, (state: WorkerState) => {
      this.discovery_.registerService(service.metaData);
    });

    await this.discovery_.registerService(service.metaData);

    await service.start();
  }

  static async installWorker(worker: Worker) {
    if (this.workers_.has(worker.id))
      return;

    this.workers_.set(worker.id, worker);

    await worker.start();
  }

  static async uninstallWorker(id: string, reason: string) {
    const worker = this.workers_.get(id);
    if (!worker)
      return;

    if (worker.state < WorkerState.STOPPING)
      await worker.stop(reason);

    this.workers_.delete(id);
  }

  static async uninstallService(id: string, reason: string) {
    const service = this.services_.get(id);
    if (!service)
      return;

    if (service.state < WorkerState.STOPPING)
      await service.stop(reason);

    this.services_.delete(id);
  }

  static get node() {
    return this.node_;
  }

  static get discovery() {
    return this.discovery_;
  }

  static get scope() {
    return this.scope_;
  }

  static get services() {
    return [...this.services_].map(([id, service]) => service);
  }

  static get workers() {
    return [...this.workers_].map(([id, worker]) => worker);
  }

  private static node_: Node;
  private static discovery_: Discovery;
  private static scope_: string;
  private static services_: Map<string, Service> = new Map();
  private static workers_: Map<string, Worker> = new Map();
}

export {Runtime}
