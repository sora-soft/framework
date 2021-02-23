import {WorkerState} from '../Enum';
import {LifeCycleEvent} from '../Event';
import {IRuntimeOptions, IServiceOptions} from '../interface/config';
import {Discovery} from './discovery/Discovery';
import {FrameworkLogger} from './FrameworkLogger';
import {Node} from './Node'
import {Service} from './Service';
import {Worker} from './Worker';

class Runtime {
  static get frameLogger() {
    if (!this.frameLogger_)
      this.frameLogger_ = new FrameworkLogger();
    return this.frameLogger_;
  }

  private static frameLogger_: FrameworkLogger;

  static async loadConfig(options: IRuntimeOptions) {
    this.scope_ = options.scope;
    this.frameLogger.success('runtime', {event: 'load-config', config: options});
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

    this.frameLogger.info('runtime', {event: 'service-starting', name: service.name, id: service.id });

    service.stateEventEmitter.on(LifeCycleEvent.StateChange, (state: WorkerState) => {
      this.discovery_.registerService(service.metaData);
    });

    await this.discovery_.registerService(service.metaData);

    await service.start();

    this.frameLogger.success('runtime', {event: 'service-started', name: service.name, id: service.id});
  }

  static async installWorker(worker: Worker) {
    if (this.workers_.has(worker.id))
      return;

    this.frameLogger.info('runtime', {event: 'worker-starting', name: worker.name, id: worker.id });

    this.workers_.set(worker.id, worker);
    await worker.start();

    this.frameLogger.success('runtime', {event: 'worker-started', name: worker.name, id: worker.id});

  }

  static async uninstallWorker(id: string, reason: string) {
    const worker = this.workers_.get(id);
    if (!worker)
      return;

    this.frameLogger.info('runtime', {event: 'worker-stopping', name: worker.name, id: worker.id });

    this.workers_.delete(id);

    if (worker.state < WorkerState.STOPPING)
      await worker.stop(reason);

    this.frameLogger.success('runtime', {event: 'worker-stopped', name: worker.name, id: worker.id});
  }

  static async uninstallService(id: string, reason: string) {
    const service = this.services_.get(id);
    if (!service)
      return;

    this.frameLogger.info('runtime', {event: 'service-stopping', name: service.name, id: service.id });

    this.services_.delete(id);
    if (service.state < WorkerState.STOPPING)
      await service.stop(reason);

    this.frameLogger.success('runtime', {event: 'service-stopped', name: service.name, id: service.id});
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
