import {ListenerState, ConnectorState, WorkerState} from '../../Enum';
import {RPCErrorCode} from '../../ErrorCode';
import {DiscoveryListenerEvent, DiscoveryServiceEvent, LifeCycleEvent} from '../../Event';
import {IListenerEventData, IListenerMetaData, IServiceMetaData} from '../../interface/discovery';
import {IListenerInfo} from '../../interface/rpc';
import {LabelFilter} from '../../utility/LabelFilter';
import {Ref} from '../../utility/Ref';
import {Utility} from '../../utility/Utility';
import {Logger} from '../logger/Logger';
import {Runtime} from '../Runtime';
import {ListenerCallback} from './Listener';
import {Notify} from './Notify';
import {Request} from './Request';
import {Response} from './Response';
import {Route} from './Route';
import {RPCError} from './RPCError';
import {RPCSender} from './RPCSender';

export type senderBuilder = (listenerId: string, targetId: string) => RPCSender;
export interface IRequestOptions {
  headers?: {
    [k: string]: any
  },
  timeout?: number;
}

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
type TypeOfClassMethod<T, M extends keyof T> = T[M] extends (...args: any) => any ? T[M] : never;
type RawRouteRPCMethod<T extends Route, K extends keyof T> = (body: Parameters<TypeOfClassMethod<T, K>>[0], options?: IRequestOptions, raw?: true) => Promise<Response<ThenArg<ReturnType<TypeOfClassMethod<T, K>>>>>;
type RouteRPCMethod<T extends Route, K extends keyof T> = (body: Parameters<TypeOfClassMethod<T, K>>[0], options?: IRequestOptions, raw?: false) => ReturnType<TypeOfClassMethod<T, K>>;
type ConvertRPCRouteMethod<T extends Route> = {
  [K in keyof T]: RouteRPCMethod<T, K> & RawRouteRPCMethod<T, K>;
}
type RouteMethod<T extends Route, K extends keyof T> = (body: Parameters<TypeOfClassMethod<T, K>>[0], options?: IRequestOptions) => Promise<void>;
export type ConvertRouteMethod<T extends Route> = {
  [K in keyof T]: RouteMethod<T, K>
}

class Provider<T extends Route = any> {
  static registerSender(protocol: string, builder: senderBuilder) {
    this.senderBuilder_.set(protocol, builder);
  }

  protected static senderFactory(protocol: string, listenerId: string, targetId: string) {
    const builder = this.senderBuilder_.get(protocol);
    if (!builder)
      return null;
    return builder(listenerId, targetId);
  }

  private static senderBuilder_: Map<string, senderBuilder> = new Map();

  constructor(name: string, filter: LabelFilter = new LabelFilter([]), callback?: ListenerCallback) {
    this.name_ = name;
    this.senders_ = new Map();
    this.filter_ = filter;
    this.routeCallback_ = callback;
    this.ref_ = new Ref();
    this.listenerMetaData_ = new Map();
    this.serviceMataData_ = new Map();

    this.caller_ = {
      rpc: (fromId?: string | null, toId?: string | null) => {
        return new Proxy<ConvertRPCRouteMethod<T>>({} as any , {
          get: (target, prop: string, receiver) => {
            if (!this.isStarted)
              throw new RPCError(RPCErrorCode.ERR_RPC_PROVIDER_NOT_AVAILABLE, `ERR_RPC_PROVIDER_NOT_AVAILABLE`);

            return async (body: unknown, options: IRequestOptions = {}, raw = false) => {
              const sender = Utility.randomOne([...this.senders_].map(([id, s]) => {
                return s;
              }).filter((s) => {
                return s.connector.state === ConnectorState.READY && (!toId || s.targetId === toId) && s.connector.isAvailable() && !s.isBusy;
              }));

              if (!sender)
                throw new RPCError(RPCErrorCode.ERR_RPC_SENDER_NOT_FOUND, `ERR_RPC_SENDER_NOT_FOUND, method=${prop}`);

              if (!options)
                options = {};

              const request = new Request({
                method: prop,
                payload: body,
                path: `${this.name_}/${prop}`,
                headers: options.headers || {},
              });
              const res = await sender.connector.sendRpc(request, fromId, options.timeout);
              const response = new Response(res);
              if (raw)
                return response;
              return response.payload.result;
            };
          }
        });
      },
      notify: (fromId?: string | null, toId?: string | null) => {
        return new Proxy<ConvertRouteMethod<T>>({} as any, {
          get: (target, prop: string, receiver) => {
            if (!this.isStarted)
              throw new RPCError(RPCErrorCode.ERR_RPC_PROVIDER_NOT_AVAILABLE, `ERR_RPC_PROVIDER_NOT_AVAILABLE`);

            return async (body: unknown, options: IRequestOptions = {}) => {
              const sender = Utility.randomOne([...this.senders_].map(([id, s]) => {
                return s;
              }).filter(s => {
                return s.connector.state === ConnectorState.READY && (!toId || s.listenerId === toId) && s.connector.isAvailable();
              }));

              if (!sender)
                throw new RPCError(RPCErrorCode.ERR_RPC_SENDER_NOT_FOUND, `ERR_RPC_SENDER_NOT_FOUND, method=${prop}`);

              if (!options)
                options = {};

              const notify = new Notify({
                method: prop,
                payload: body,
                path: `${this.name_}/${prop}`,
                headers: options.headers || {},
              });
              await sender.connector.sendNotify(notify, fromId);
            };
          }
        })
      },
      broadcast: (fromId?: string) => {
        return new Proxy<ConvertRouteMethod<T>>({} as any, {
          get: (target, prop: string, receiver) => {
            if (!this.isStarted)
              throw new RPCError(RPCErrorCode.ERR_RPC_PROVIDER_NOT_AVAILABLE, `ERR_RPC_PROVIDER_NOT_AVAILABLE`);

            return async (body: unknown, options?: IRequestOptions) => {
              const targetSet = new Set();
              const senders = [...this.senders_].map(([id, s]) => {
                return s;
              }).filter(s => {
                const available = s.connector.state === ConnectorState.READY && !targetSet.has(s.listenerId) && s.connector.isAvailable();
                if (available) {
                  targetSet.add(s.listenerId);
                }
                return available;
              });

              if (!options)
                options = {};

              await Promise.all(senders.map((s) => {
                const notify = new Notify({
                  method: prop,
                  payload: body,
                  path: `${this.name_}/${prop}`,
                  headers: options!.headers || {},
                });
                return s.connector.sendNotify(notify, fromId);
              }))
            };
          }
        })
      }
    }
  }

  async ensureSender(info: IListenerMetaData, serviceName: string) {
    const sender = this.senders_.get(info.id);
    if (!sender && serviceName === this.name_ && this.filter_.isSatisfy(info.labels)) {
        await this.createSender(info);
    }
  }

  async shutdown() {
    await this.ref_.minus(async () => {
      await Promise.all([...this.senders_].map(async ([_, sender]) => {
        await sender.connector.off();
      }));
    }).catch((err: Error) => {
      if (err.message === 'ERR_REF_NEGATIVE')
        Runtime.frameLogger.warn(`provider.${this.name_}`, { event: 'duplicate-stop' });
    });
  }

  async startup() {
    await this.ref_.add(async () => {
      const services = await Runtime.discovery.getServiceList(this.name_);
      for (const info of services) {
        this.serviceMataData_.set(info.id, info);
      }

      const endpoints = await Runtime.discovery.getEndpointList(this.name_);
      for (const info of endpoints) {
        this.listenerMetaData_.set(info.id, info);
        if (!info.targetId)
          continue;
        const service = this.serviceMataData_.get(info.targetId);
        if (!service)
          continue;
        await this.ensureSender(info, service.name);
      }

      // TODO: 这里应该由一个统一中心负责监听，而不是每个provider各自监听
      Runtime.discovery.serviceEmitter.on(DiscoveryServiceEvent.ServiceStateUpdate, async (id, state, pre, meta) => {
        this.serviceMataData_.set(id, meta);
        switch (state) {
          case WorkerState.BUSY:
            for (const sender of this.senderList_) {
              if (sender.targetId === id) {
                sender.isBusy = true;
              }
            }
            break;
          case WorkerState.READY:
            for (const sender of this.senderList_) {
              if (sender.targetId === id) {
                sender.isBusy = false;
              }
            }
            break;
          case WorkerState.ERROR:
          case WorkerState.STOPPING:
          case WorkerState.STOPPED: {
            for (const sender of this.senderList_) {
              if (sender.targetId === id) {
                this.removeSender(sender.listenerId);
              }
            }
            break;
          }
        }
      });
      Runtime.discovery.serviceEmitter.on(DiscoveryServiceEvent.ServiceDeleted, async (id) => {
        this.serviceMataData_.delete(id);
      });

      Runtime.discovery.listenerEmitter.on(DiscoveryListenerEvent.ListenerCreated, async (info) => {
        this.listenerMetaData_.set(info.id, info);
        if (info.service === this.name_ && this.filter_.isSatisfy(info.labels))
          this.createSender(info);
      });
      Runtime.discovery.listenerEmitter.on(DiscoveryListenerEvent.ListenerStateUpdate, async (id, state, pre, meta) => {
        this.listenerMetaData_.set(id, meta);
        let sender = this.senders_.get(id);
        if (!sender && state === ListenerState.READY) {
          if (meta.service === this.name_ && this.filter_.isSatisfy(meta.labels))
            sender = await this.createSender(meta);
          return;
        }

        if (!sender)
          return;

        switch (state) {
          case ListenerState.READY:
            await sender.connector.start(meta).catch(err => {
              Runtime.frameLogger.error(this.logCategory, err, { event: 'sender-started-failed', error: Logger.errorMessage(err), name: this.name_ });
            });
            break;
          case ListenerState.STOPPING:
          case ListenerState.STOPPED:
          case ListenerState.ERROR:
            this.removeSender(id);
            break;
        }
      });
      Runtime.discovery.listenerEmitter.on(DiscoveryListenerEvent.ListenerDeleted, async (id) => {
        this.listenerMetaData_.delete(id);
        this.removeSender(id);
      });
    });
  }

  get name() {
    return this.name_;
  }

  get caller() {
    return this.caller_;
  }

  get senders() {
    return this.senders_;
  }

  get isStarted() {
    return this.ref_.count > 0;
  }

  private get senderList_() {
    return [...this.senders_].map(([id, sender]) => sender);
  }

  private async removeSender(id: string) {
    const sender = this.senders_.get(id);
    if (!sender)
      return;

    Runtime.frameLogger.info(this.logCategory, { event: 'remove-sender', name: this.name_, id });
    this.senders_.delete(id);
    await sender.connector.off().catch(err => {
      Runtime.frameLogger.error(this.logCategory, err, { event: 'sender-stop-failed', error: Logger.errorMessage(err), name: this.name_ });
    });;
  }

  private async reconnect(meta: IListenerMetaData) {
    Runtime.frameLogger.info(this.logCategory, {event: 'reconnect-sender', name: this.name, id: meta.id});
    this.createSender(meta);
  }

  private async createSender(endpoint: IListenerMetaData) {
    if (this.senders_.has(endpoint.id)) {
      const existed = this.senders_.get(endpoint.id);
      Runtime.frameLogger.debug(this.logCategory, {
        event: 'remove-exited-sender',
        listener: this.formatLogListener(endpoint),
        targetId: existed!.targetId,
        state: existed!.connector.state,
        name: this.name_
      });

      this.removeSender(endpoint.id);
    }

    if (!endpoint.targetId)
      return;

    const sender = Provider.senderFactory(endpoint.protocol, endpoint.id, endpoint.targetId);
    if (!sender)
      return;

    const serviceMeta = this.serviceMataData_.get(endpoint.targetId);
    if (serviceMeta && serviceMeta.state === WorkerState.BUSY)
      sender.isBusy = true;

    sender.connector.stateEmitter.on(LifeCycleEvent.StateChangeTo, (state) => {
      Runtime.frameLogger.info(this.logCategory, {event: 'sender-state-change', id: sender.listenerId, state});
      switch(state) {
        case ConnectorState.STOPPED:
        case ConnectorState.ERROR:
          this.removeSender(sender.listenerId);
          const listenerMeta = this.listenerMetaData_.get(sender.listenerId);
          if (listenerMeta && listenerMeta.state === ListenerState.READY) {
            // 这个sender意外停止
            this.reconnect(listenerMeta);
          }
          break;
      }
    });

    Runtime.frameLogger.success(this.logCategory, { event: 'sender-created', listener: this.formatLogListener(endpoint), targetId: sender.targetId, name: this.name_ });

    this.senders_.set(endpoint.id, sender);
    if (this.routeCallback_)
      await sender.connector.enableResponse(this.routeCallback_);

    if (endpoint.state === ListenerState.READY) {
      sender.connector.start(endpoint).catch(err => {
        Runtime.frameLogger.error(this.logCategory, err, { event: 'sender-started-failed', error: Logger.errorMessage(err), name: this.name_ });
      });
    }

    return sender;
  }

  private get logCategory() {
    return `provider.${this.name_}`;
  }

  private formatLogListener(listener: IListenerInfo) {
    return { protocol: listener.protocol, endpoint: listener.endpoint };
  }

  private name_: string;
  private senders_: Map<string /*endpoint id*/, RPCSender>;
  private caller_: {
    rpc: (fromId?: string | null, toId?: string | null) => ConvertRPCRouteMethod<T>,
    notify: (fromId?: string | null, toId?: string | null) => ConvertRouteMethod<T>,
    broadcast: (fromId?: string) => ConvertRouteMethod<T>,
  };
  private filter_: LabelFilter;
  private routeCallback_: ListenerCallback | undefined;
  private ref_: Ref;
  private listenerMetaData_: Map<string /*endpoint id*/, IListenerMetaData>;
  private serviceMataData_: Map<string /*service id*/, IServiceMetaData>;
}

export {Provider}
