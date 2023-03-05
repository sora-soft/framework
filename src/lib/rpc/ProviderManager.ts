import {ListenerState} from '../../Enum';
import {DiscoveryListenerEvent} from '../../Event';
import {IListenerMetaData} from '../../interface/discovery';
import {ExError} from '../../utility/ExError';
import {LabelFilter} from '../../utility/LabelFilter';
import {ArrayMap} from '../../utility/Utility';
import {Context} from '../Context';
import {Discovery} from '../discovery/Discovery';
import {Logger} from '../logger/Logger';
import {Runtime} from '../Runtime';
import {Provider} from './Provider';
import {Response} from './Response';
import {Route} from './Route';
import {RPCSender} from './RPCSender';

export type senderBuilder = (listenerId: string, targetId: string, wieght: number) => RPCSender;
export interface IRequestOptions {
  headers?: {
    [k: string]: any;
  };
  timeout?: number;
}

export type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
export type TypeOfClassMethod<T, M extends keyof T> = T[M] extends (...args: any) => any ? T[M] : never;
export type RawRouteRPCMethod<T extends Route, K extends keyof T> = (body: Parameters<TypeOfClassMethod<T, K>>[0], options?: IRequestOptions, raw?: true) => Promise<Response<ThenArg<ReturnType<TypeOfClassMethod<T, K>>>>>;
export type RouteRPCMethod<T extends Route, K extends keyof T> = (body: Parameters<TypeOfClassMethod<T, K>>[0], options?: IRequestOptions, raw?: false) => ReturnType<TypeOfClassMethod<T, K>>;
export type ConvertRPCRouteMethod<T extends Route> = {
  [K in keyof T]: RouteRPCMethod<T, K> & RawRouteRPCMethod<T, K>;
}
export type RouteMethod<T extends Route, K extends keyof T> = (body: Parameters<TypeOfClassMethod<T, K>>[0], options?: IRequestOptions) => Promise<void>;
export type ConvertRouteMethod<T extends Route> = {
  [K in keyof T]: RouteMethod<T, K>
}

export type EndpointStateUpdateHandler = (id: string, state: ListenerState, meta: IListenerMetaData) => Promise<void>;
export type EndpointEventHandler = (id: string, event: DiscoveryListenerEvent, meta: IListenerMetaData) => Promise<void>;

class ProviderManager {
  constructor(discovery: Discovery) {
    this.discovery_ = discovery;
  }

  addEndpointUpateHandler(targetName: string, filter: LabelFilter, handler: EndpointStateUpdateHandler) {
    this.endpointStateHandlerMap_.append(targetName, {handle: handler, filter});
    for (const [id, meta] of this.listenerMetaData_) {
      if (meta.targetName === targetName && filter.isSatisfy(meta.labels))
        handler(id, meta.state, meta).catch((err: ExError) => {
          Runtime.frameLogger.error('provider-manager', err, {event: 'provider-endpoint-state-handler-error', error: Logger.errorMessage(err)});
        });
    }
  }

  addEndpointEventHandler(targetName: string, filter: LabelFilter, handler: EndpointEventHandler) {
    this.endpointEventHandlerMap_.append(targetName, {handle: handler, filter});

    for (const [id, meta] of this.listenerMetaData_) {
      if (meta.targetName === targetName && filter.isSatisfy(meta.labels))
        handler(id, DiscoveryListenerEvent.ListenerCreated, meta).catch((err: ExError) => {
          Runtime.frameLogger.error('provider-manager', err, {event: 'provider-endpoint-event-handler-error', error: Logger.errorMessage(err)});
        });
    }
  }

  async start(ctx: Context) {
    const endpoints = await ctx.await(this.discovery_.getAllEndpointList());
    for (const meta of endpoints) {
      this.listenerMetaData_.set(meta.id, meta);
    }

    this.discovery_.listenerEmitter.on(DiscoveryListenerEvent.ListenerCreated, async (meta) => {
      this.listenerMetaData_.set(meta.id, meta);
      const handlers = this.endpointEventHandlerMap_.sureGet(meta.targetName);
      for (const handler of handlers) {
        if (handler.filter.isSatisfy(meta.labels)) {
          handler.handle(meta.id, DiscoveryListenerEvent.ListenerCreated, meta).catch((err: ExError) => {
            Runtime.frameLogger.error('provider-manager', err, {event: 'provider-endpoint-event-handler-error', error: Logger.errorMessage(err)});
          });
        }
      }
    });

    this.discovery_.listenerEmitter.on(DiscoveryListenerEvent.ListenerStateUpdate, async (id, state, pre, meta) => {
      this.listenerMetaData_.set(id, meta);
      const handlers = this.endpointStateHandlerMap_.sureGet(meta.targetName);
      for (const handler of handlers) {
        if (handler.filter.isSatisfy(meta.labels)) {
          handler.handle(id, state, meta).catch((err: ExError) => {
            Runtime.frameLogger.error('provider-manager', err, {event: 'provider-endpoint-state-handler-error', error: Logger.errorMessage(err)});
          });
        }
      }
    });
    this.discovery_.listenerEmitter.on(DiscoveryListenerEvent.ListenerDeleted, async (id) => {
      const meta = this.listenerMetaData_.get(id);
      if (!meta)
        return;

      this.listenerMetaData_.delete(id);
      const handlers = this.endpointEventHandlerMap_.sureGet(meta.targetName);
      for (const handler of handlers) {
        if (handler.filter.isSatisfy(meta.labels)) {
          handler.handle(id, DiscoveryListenerEvent.ListenerDeleted, meta).catch((err: ExError) => {
            Runtime.frameLogger.error('provider-manager', err, {event: 'provider-endpoint-event-handler-error', error: Logger.errorMessage(err)});
          });
        }
      }
    });
  }

  registerSender(protocol: string, builder: senderBuilder) {
    this.senderBuilder_.set(protocol, builder);
  }

  senderFactory(protocol: string, listenerId: string, targetId: string, weight: number) {
    const builder = this.senderBuilder_.get(protocol);
    if (!builder)
      return null;
    return builder(listenerId, targetId, weight);
  }

  async addProvider(provider: Provider) {
    this.providerMap_.append(provider.name, provider);
  }

  getAllProviders() {
    return [...this.providerMap_].map(([_, provider]) => provider).flat();
  }

  isEndpointRunning(id: string) {
    const meta = this.listenerMetaData_.get(id);
    if (!meta)
      return false;
    return meta.state === ListenerState.READY;
  }

  getEndpoingMeta(id: string) {
    return this.listenerMetaData_.get(id);
  }

  private discovery_: Discovery;
  private senderBuilder_: Map<string, senderBuilder> = new Map();
  private listenerMetaData_: Map<string /* endpoint id*/, IListenerMetaData> = new Map();
  private providerMap_: ArrayMap<string /* service name */, Provider> = new ArrayMap();

  private endpointStateHandlerMap_: ArrayMap<string /* service name */, {handle: EndpointStateUpdateHandler; filter: LabelFilter}> = new ArrayMap();
  private endpointEventHandlerMap_: ArrayMap<string /* service name */, {handle: EndpointEventHandler; filter: LabelFilter}> = new ArrayMap();
}

export {ProviderManager};
