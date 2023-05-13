import {WorkerState} from '../Enum.js';
import {AbortErrorCode, FrameworkErrorCode} from '../ErrorCode.js';
import {DiscoveryEvent} from '../Event.js';
import {IRuntimeOptions} from '../interface/config.js';
import {AbortError} from '../utility/AbortError.js';
import {ExError} from '../utility/ExError.js';
import {Time} from '../utility/Time.js';
import {Component} from './Component.js';
import {Context} from './Context.js';
import {Discovery} from './discovery/Discovery.js';
import {FrameworkError} from './FrameworkError.js';
import {FrameworkLogger} from './FrameworkLogger.js';
import {Logger} from './logger/Logger.js';
import {Node} from './Node.js';
import {RPCLogger} from './rpc/RPCLogger.js';
import {Service} from './Service.js';
import {Worker} from './Worker.js';
import {ProviderManager} from './rpc/ProviderManager.js';
import {readFile} from 'fs/promises';
import {UnixTime} from '../index.js';

const pkg = JSON.parse(
  await readFile(new URL('../../package.json', import.meta.url), {encoding: 'utf-8'})
) as {version: string};

class Runtime {
  static version = pkg.version;
  static appVersion = '0.0.0';
  static startTime = UnixTime.now();

  static get frameLogger() {
    return this.frameLogger_;
  }

  private static frameLogger_: FrameworkLogger = new FrameworkLogger();

  static get rpcLogger() {
    return this.rpcLogger_;
  }
  private static rpcLogger_: RPCLogger = new RPCLogger();

  static async loadConfig(options: IRuntimeOptions) {
    this.scope_ = options.scope;
    this.frameLogger.success('runtime', {event: 'load-config', config: options});
  }

  static async startup(node: Node, discovery: Discovery, ctx?: Context) {
    const context = this.startCtx_ = new Context(ctx);
    process.on('uncaughtException', (err: ExError) => {
      if (err instanceof AbortError)
        return;
      this.frameLogger_.error('runtime', err, {event: 'uncaught-exception', error: Logger.errorMessage(err), stack: err.stack});
    });

    process.on('unhandledRejection', (err: ExError) => {
      if (err instanceof AbortError)
        return;
      this.frameLogger_.error('runtime', err, {event: 'uncaught-rejection', error: Logger.errorMessage(err), stack: err.stack});
    });

    process.on('SIGINT', async () => {
      this.frameLogger_.info('process', 'receive SIGINT');
      await this.shutdown();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      this.frameLogger_.info('process', 'receive SIGTERM');
      await this.shutdown();
      process.exit(0);
    });

    this.discovery_ = discovery;
    await this.discovery_.connect(context).catch((err: ExError) => {
      if (err instanceof AbortError)
        throw err;
      this.frameLogger_.fatal('runtime', err, {event: 'connect-discovery', error: Logger.errorMessage(err)});
      process.exit(1);
    });

    this.pvdManager_ = new ProviderManager(discovery);
    await this.pvdManager_.start(context);

    this.node_ = node;
    await this.installService(node, context).catch((err: ExError) => {
      if (err instanceof AbortError)
        throw err;
      this.frameLogger_.fatal('runtime', err, {event: 'install-node', error: Logger.errorMessage(err)});
      process.exit(1);
    });

    await context.await(this.discovery_.registerNode(this.node_.nodeStateData)).catch((err: ExError) => {
      if (err instanceof AbortError)
        throw err;
      this.frameLogger_.fatal('runtime', err, {event: 'register-node', error: Logger.errorMessage(err)});
      process.exit(1);
    });

    this.discovery_.discoveryEmitter.on(DiscoveryEvent.DiscoveryReconnect, async () => {
      this.frameLogger_.info('runtime', {event: 'discovery-reconnect'});
      this.discovery_.registerNode(this.node.nodeStateData).catch((err: ExError) => {
        this.frameLogger_.error('runtime', err, {event: 'register-node', error: Logger.errorMessage(err)});
      });

      for(const service of this.services) {
        await this.discovery_.registerService(service.metaData).catch((err: ExError) => {
          this.frameLogger_.error('runtime', err, {event: 'register-service', error: Logger.errorMessage(err)});
        });

        await service.registerEndpoints().catch((err: ExError) => {
          this.frameLogger_.error('runtime', err, {event: 'register-listener', error: Logger.errorMessage(err)});
        });
      }

      for (const worker of this.workers) {
        await this.discovery_.registerWorker(worker.metaData).catch((err: ExError) => {
          this.frameLogger_.error('runtime', err, {event: 'register-worker', error: Logger.errorMessage(err)});
        });
      }
    });

    this.frameLogger_.success('framework', {event: 'start-runtime-success', discovery: discovery.info, node: node.metaData});
    this.startCtx_ = null;
  }

  static async shutdown() {
    if (this.shutdownPromise_) {
      return this.shutdownPromise_;
    }

    this.startCtx_?.abort();
    this.startCtx_ = null;
    this.shutdownPromise_ = new Promise(async (resolve) => {
      const promises: Promise<unknown>[] = [];
      for (const [id, service] of [...this.services_]) {
        if (id === this.node_.id)
          continue;
        const promise = this.uninstallService(id, 'runtime_shutdown').catch((err: ExError) => {
          this.frameLogger_.error('runtime', err, {event: 'uninstall-service', error: Logger.errorMessage(err), id: service.id});
        });
        promises.push(promise);
      }
      await Promise.all(promises);

      this.frameLogger_.info('runtime', {event: 'all-service-closed'});

      promises.length = 0;
      for (const [id, worker] of [...this.workers_]) {
        const promise = this.uninstallWorker(id, 'runtime_shutdown').catch((err: ExError) => {
          this.frameLogger_.error('runtime', err, {event: 'uninstall-worker', error: Logger.errorMessage(err), id: worker.id});
        });
        promises.push(promise);
      }
      await Promise.all(promises);

      this.frameLogger_.info('runtime', {event: 'all-worker-closed'});

      await this.uninstallService(this.node_.id, 'runtime_shutdown').catch((err: ExError) => {
        this.frameLogger_.error('runtime', err, {event: 'uninstall-service', error: Logger.errorMessage(err), id: this.node.id});
      });

      await this.pvdManager_.stop();

      await this.discovery_.disconnect();

      await Time.timeout(1000);

      this.frameLogger_.info('runtime', {event: 'discovery-disconnected'});

      resolve();
    });

    return this.shutdownPromise_;
  }

  static async installService(service: Service, context?: Context) {
    if (this.services_.has(service.id))
      return;
    this.services_.set(service.id, service);

    this.frameLogger.info('runtime', {event: 'service-starting', name: service.name, id: service.id});

    service.lifeCycle.addAllHandler(async () => {
      await this.discovery_.registerService(service.metaData);
    });

    await this.discovery_.registerService(service.metaData);
    if (context?.signal.aborted)
      throw new AbortError(AbortErrorCode.ERR_ABORT);

    await service.start(context).catch((err: ExError) => {
      if (err instanceof AbortError)
        throw err;
      this.frameLogger_.error('runtime', err, {event: 'install-service-start', error: Logger.errorMessage(err), name: service.name, id: service.id});
      throw err;
    });

    this.frameLogger.success('runtime', {event: 'service-started', name: service.name, id: service.id});
  }

  static async installWorker(worker: Worker, context?: Context) {
    if (this.workers_.has(worker.id))
      return;

    this.workers_.set(worker.id, worker);

    this.frameLogger.info('runtime', {event: 'worker-starting', name: worker.name, id: worker.id});

    worker.lifeCycle.addAllHandler(async () => {
      await this.discovery_.registerWorker(worker.metaData);
    });

    await this.discovery_.registerWorker(worker.metaData);
    if (context?.signal.aborted)
      throw new AbortError(AbortErrorCode.ERR_ABORT);

    await worker.start(context).catch((err: ExError) => {
      if (err instanceof AbortError)
        throw err;
      this.frameLogger_.error('runtime', err, {event: 'install-worker-start', error: Logger.errorMessage(err), name: worker.name, id: worker.id});
      throw err;
    });

    this.frameLogger.success('runtime', {event: 'worker-started', name: worker.name, id: worker.id});
  }

  static async uninstallWorker(id: string, reason: string) {
    const worker = this.workers_.get(id);
    if (!worker)
      return;

    this.frameLogger.info('runtime', {event: 'worker-stopping', name: worker.name, id: worker.id});

    this.workers_.delete(id);

    if (worker.state < WorkerState.STOPPING)
      await worker.stop(reason).catch((err: ExError) => {
        this.frameLogger_.error('runtime', err, {event: 'uninstall-worker', error: Logger.errorMessage(err), name: worker.name, id: worker.id});
      });

    if (worker.state === WorkerState.STOPPED)
      this.frameLogger.success('runtime', {event: 'worker-stopped', name: worker.name, id: worker.id, reason});
  }

  static async uninstallService(id: string, reason: string) {
    const service = this.services_.get(id);
    if (!service)
      return;

    this.frameLogger.info('runtime', {event: 'service-stopping', name: service.name, id: service.id});

    this.services_.delete(id);
    if (service.state < WorkerState.STOPPING)
      await service.stop(reason).catch((err: ExError) => {
        this.frameLogger_.error('runtime', err, {event: 'uninstall-service', error: Logger.errorMessage(err), name: service.name, id: service.id});
      });

    if (service.state === WorkerState.STOPPED)
      this.frameLogger.success('runtime', {event: 'service-stopped', name: service.name, id: service.id, reason});
  }

  static registerComponent(name: string, component: Component) {
    if (this.components_.has(name))
      this.frameLogger.error('runtime', new FrameworkError(FrameworkErrorCode.ERR_DUPLICATED_COMPONENT, `ERR_DUPLICATED_COMPONENT, name=${name}`, undefined, {name}));

    this.components_.set(name, component);
    component.name = name;
  }

  static getComponent<T extends Component>(name: string) {
    return this.components_.get(name) as T;
  }

  static get node() {
    return this.node_;
  }

  static get discovery() {
    return this.discovery_;
  }

  static get pvdManager() {
    return this.pvdManager_;
  }

  static get scope() {
    return this.scope_;
  }

  static get services() {
    return [...this.services_].map(([_, service]) => service);
  }

  static get workers() {
    return [...this.workers_].map(([_, worker]) => worker);
  }

  static get components() {
    return [...this.components_].map(([_, component]) => component);
  }

  private static node_: Node;
  private static discovery_: Discovery;
  private static pvdManager_: ProviderManager;
  private static scope_: string;
  private static services_: Map<string, Service> = new Map();
  private static workers_: Map<string, Worker> = new Map();
  private static components_: Map<string, Component> = new Map();
  private static shutdownPromise_: Promise<void>;
  private static startCtx_: Context | null;
}

export {Runtime};
