import {ListenerState, SenderState} from '../../Enum';
import {RPCErrorCode} from '../../ErrorCode';
import {DiscoveryListenerEvent} from '../../Event';
import {IListenerMetaData} from '../../interface/discovery';
import {LabelFilter} from '../../utility/LabelFilter';
import {Utility} from '../../utility/Utility';
import {Runtime} from '../Runtime';
import {Notify} from './Notify';
import {Request} from './Request';
import {Response} from './Response';
import {Route} from './Route';
import {RPCError} from './RPCError';
import {Sender} from './Sender';

export type senderBuilder = (targetId: string) => Sender;
export interface IRequestOptions {
  headers?: {
    [k: string]: any
  }
}

type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
type TypeOfClassMethod<T, M extends keyof T> = T[M] extends (...args: any) => any ? T[M] : never;
type RawRouteRPCMethod<T extends Route, K extends keyof T> = (body: Parameters<TypeOfClassMethod<T, K>>[0], options?: IRequestOptions, raw?: true) => Promise<Response<ThenArg<ReturnType<TypeOfClassMethod<T, K>>>>>;
type RouteRPCMethod<T extends Route, K extends keyof T> = (body: Parameters<TypeOfClassMethod<T, K>>[0], options?: IRequestOptions, raw?: false) => ReturnType<TypeOfClassMethod<T, K>>;
type ConvertRPCRouteMethod<T extends Route> = {
  [K in keyof T]: RawRouteRPCMethod<T, K> & RouteRPCMethod<T, K>;
}
type RouteMethod<T extends Route, K extends keyof T> = (body: Parameters<TypeOfClassMethod<T, K>>[0], options?: IRequestOptions) => Promise<void>;
type ConvertRouteMethod<T extends Route> = {
  [K in keyof T]: RouteMethod<T, K>
}

class Provider<T extends Route> {
  static registerSender(protocol: string, builder: senderBuilder) {
    this.senderBuilder_.set(protocol, builder);
  }

  protected static senderFactory(protocol: string, targetId: string) {
    const builder = this.senderBuilder_.get(protocol);
    if (!builder)
      return null;
    return builder(targetId);
  }

  private static senderBuilder_: Map<string, senderBuilder> = new Map();

  constructor(name: string, filter: LabelFilter = new LabelFilter([])) {
    this.name_ = name;
    this.senders_ = new Map();
    this.filter_ = filter;

    this.caller_ = {
      rpc: (fromId?: string, toId?: string) => {
        return new Proxy<ConvertRPCRouteMethod<T>>({} as any , {
          get: (target, prop: string, receiver) => {
            return async (body: unknown, options: IRequestOptions = {}, raw = false) => {
              const sender = Utility.randomOne([...this.senders_].map(([id, s]) => {
                return s;
              }).filter((s) => {
                return s.state === SenderState.READY && (!toId || s.targetId === toId);
              }));

              if (!sender)
                throw new RPCError(RPCErrorCode.ERR_RPC_SENDER_NOT_FOUND, `ERR_RPC_SENDER_NOT_FOUND, method=${prop}`);

              if (!options)
                options = {};

              const request = new Request({
                method: prop,
                payload: body,
                headers: options.headers || {},
              });
              const res = await sender.sendRpc(request, fromId);
              const response = new Response(res);
              if (raw)
                return response;
              return response.payload;
            };
          }
        });
      },
      notify: (fromId?: string, toId?: string) => {
        return new Proxy<ConvertRouteMethod<T>>({} as any, {
          get: (target, prop: string, receiver) => {
            return async (body: unknown, options: IRequestOptions = {}) => {
              const sender = Utility.randomOne([...this.senders_].map(([id, s]) => {
                return s;
              }).filter(s => {
                return s.state === SenderState.READY && (!toId || s.targetId === toId);
              }))

              if (!sender)
                throw new RPCError(RPCErrorCode.ERR_RPC_SENDER_NOT_FOUND, `ERR_RPC_SENDER_NOT_FOUND, method=${prop}`);

              if (!options)
                options = {};

              const notify = new Notify({
                method: prop,
                payload: body,
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
            return async (body: unknown, options?: IRequestOptions) => {
              const targetSet = new Set();
              const senders = [...this.senders_].map(([id, s]) => {
                return s;
              }).filter(s => {
                const available = s.state === SenderState.READY && !targetSet.has(s.targetId);
                if (available) {
                  targetSet.add(s.targetId);
                }
                return available;
              });

              if (!options)
                options = {};

              await Promise.all(senders.map((s) => {
                const notify = new Notify({
                  method: prop,
                  payload: body,
                  headers: options.headers || {},
                });
                return s.sendNotify(notify, fromId);
              }))
            };
          }
        })
      }
    }
  }

  async startup() {
    const endpoints = await Runtime.discovery.getEndpointList(this.name_);
    for (const info of endpoints) {
      this.createSender(info);
    }

    Runtime.discovery.listenerEmitter.on(DiscoveryListenerEvent.ListenerCreated, async (info) => {
      if (info.service === this.name_ && this.filter_.isSatisfy(info.labels))
        this.createSender(info);
    });
    Runtime.discovery.listenerEmitter.on(DiscoveryListenerEvent.ListenerStateUpdate, async (id, state, pre, meta) => {
      const sender = this.senders_.get(id);
      if (!sender) {
        if (meta.service === this.name_ && this.filter_.isSatisfy(meta.labels))
          this.createSender(meta);
        return;
      }

      switch (state) {
        case ListenerState.READY:
          await sender.start(meta);
          break;
        case ListenerState.STOPPING:
        case ListenerState.STOPPED:
        case ListenerState.ERROR:
          await sender.off();
          break;
      }
    });
    Runtime.discovery.listenerEmitter.on(DiscoveryListenerEvent.ListenerDeleted, async (id) => {
      const sender = this.senders_.get(id);
      if (!sender)
        return;

      await sender.off();
      this.senders_.delete(id);
    });
  }

  get caller() {
    return this.caller_;
  }

  get senders() {
    return this.senders_;
  }

  private async createSender(endpoint: IListenerMetaData) {
    const sender = Provider.senderFactory(endpoint.protocol, endpoint.targetId);
    if (!sender)
      return;

    this.senders_.set(endpoint.id, sender);
    if (endpoint.state === ListenerState.READY)
      await sender.start(endpoint);

    return sender;
  }

  private name_: string;
  private senders_: Map<string /*endpoint id*/, Sender>;
  private caller_: {
    rpc: (fromId?: string) => ConvertRPCRouteMethod<T>,
    notify: (fromId?: string, toId?: string) => ConvertRouteMethod<T>,
    broadcast: (fromId?: string) => ConvertRouteMethod<T>
  };
  private filter_: LabelFilter;
}

export {Provider}
