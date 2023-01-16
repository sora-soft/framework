import {ListenerState, SenderState, WorkerState} from '../../Enum';
import {RPCErrorCode} from '../../ErrorCode';
import {DiscoveryListenerEvent, DiscoveryServiceEvent, LifeCycleEvent} from '../../Event';
import {IListenerMetaData} from '../../interface/discovery';
import {IListenerInfo} from '../../interface/rpc';
import {LabelFilter} from '../../utility/LabelFilter';
import {Ref} from '../../utility/Ref';
import {Utility} from '../../utility/Utility';
import {Logger} from '../logger/Logger';
import {Runtime} from '../Runtime';
import {Notify} from './Notify';
import {Request} from './Request';
import {Response} from './Response';
import {Route} from './Route';
import {RPCError} from './RPCError';
import {Sender} from './Sender';

export type senderBuilder = (listenerId: string, targetId: string) => Sender;
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

  constructor(name: string, filter: LabelFilter = new LabelFilter([]), route?: Route) {
    this.name_ = name;
    this.senders_ = new Map();
    this.filter_ = filter;
    this.route_ = route;
    this.ref_ = new Ref();

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
                return s.state === SenderState.READY && (!toId || s.targetId === toId) && s.isAvailable() && !s.isBusy;
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
              const res = await sender.sendRpc(request, fromId, options.timeout);
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
                return s.state === SenderState.READY && (!toId || s.listenerId === toId) && s.isAvailable();
              }))

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
              await sender.sendNotify(notify, fromId);
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
                const available = s.state === SenderState.READY && !targetSet.has(s.listenerId) && s.isAvailable();
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
                return s.sendNotify(notify, fromId);
              }))
            };
          }
        })
      }
    }
  }

  async shutdown() {
    await this.ref_.minus(async () => {
      await Promise.all([...this.senders_].map(async ([id, sender]) => {
        await sender.off();
      }));
    }).catch((err: Error) => {
      if (err.message === 'ERR_REF_NEGATIVE')
        Runtime.frameLogger.warn(`provider.${this.name_}`, { event: 'duplicate-stop' });
    });
  }

  async startup() {
    await this.ref_.add(async () => {
      const endpoints = await Runtime.discovery.getEndpointList(this.name_);
      for (const info of endpoints) {
        this.createSender(info);
      }

      Runtime.discovery.serviceEmitter.on(DiscoveryServiceEvent.ServiceStateUpdate, async (id, state, pre, meta) => {
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
          case WorkerState.STOPPED:
            for (const sender of this.senderList_) {
              if (sender.targetId === id) {
                this.removeSender(sender.listenerId);
              }
            }
            break;
        }
      });

      Runtime.discovery.listenerEmitter.on(DiscoveryListenerEvent.ListenerCreated, async (info) => {
        if (info.service === this.name_ && this.filter_.isSatisfy(info.labels))
          this.createSender(info);
      });
      Runtime.discovery.listenerEmitter.on(DiscoveryListenerEvent.ListenerStateUpdate, async (id, state, pre, meta) => {
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
            await sender.start(meta).catch(err => {
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
    await sender.off().catch(err => {
      Runtime.frameLogger.error(this.logCategory, err, { event: 'sender-stop-failed', error: Logger.errorMessage(err), name: this.name_ });
    });;
  }

  private async createSender(endpoint: IListenerMetaData) {
    if (this.senders_.has(endpoint.id)) {
      const existed = this.senders_.get(endpoint.id);
      Runtime.frameLogger.debug(this.logCategory, {
        event: 'remove-exited-sender',
        listener: this.formatLogListener(endpoint),
        targetId: existed!.targetId,
        state: existed!.state,
        name: this.name_
      });

      this.removeSender(endpoint.id);
    }

    if (!endpoint.targetId)
      return;

    const sender = Provider.senderFactory(endpoint.protocol, endpoint.id, endpoint.targetId);
    if (!sender)
      return;

    sender.stateEmitter.on(LifeCycleEvent.StateChangeTo, (state) => {
      Runtime.frameLogger.info(this.logCategory, {event: 'sender-state-change', id: sender.listenerId, state});
      switch(state) {
        case SenderState.ERROR:
        case SenderState.STOPPED:
          this.removeSender(sender.listenerId);
          break;
      }
    });

    Runtime.frameLogger.success(this.logCategory, { event: 'sender-created', listener: this.formatLogListener(endpoint), targetId: sender.targetId, name: this.name_ });

    this.senders_.set(endpoint.id, sender);
    if (this.route_)
      await sender.enableResponse(this.route_);

    if (endpoint.state === ListenerState.READY)
      sender.start(endpoint).catch(err => {
        Runtime.frameLogger.error(this.logCategory, err, { event: 'sender-started-failed', error: Logger.errorMessage(err), name: this.name_ });
      });

    return sender;
  }

  private get logCategory() {
    return `provider.${this.name_}`;
  }

  private formatLogListener(listener: IListenerInfo) {
    return { id: listener.id, protocol: listener.protocol, endpoint: listener.endpoint };
  }

  private name_: string;
  private senders_: Map<string /*endpoint id*/, Sender>;
  private caller_: {
    rpc: (fromId?: string | null, toId?: string | null) => ConvertRPCRouteMethod<T>,
    notify: (fromId?: string | null, toId?: string | null) => ConvertRouteMethod<T>,
    broadcast: (fromId?: string) => ConvertRouteMethod<T>,
  };
  private filter_: LabelFilter;
  private route_: Route | undefined;
  private ref_: Ref;
}

export {Provider}
