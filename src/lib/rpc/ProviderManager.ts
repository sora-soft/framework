import {ListenerState} from '../../Enum.js';
import {DiscoveryListenerEvent} from '../../Event.js';
import {IListenerMetaData} from '../../interface/discovery.js';
import {ExError} from '../../utility/ExError.js';
import {LabelFilter} from '../../utility/LabelFilter.js';
import {ArrayMap} from '../../utility/Utility.js';
import {Context} from '../Context.js';
import {Discovery, IDiscoveryListenerEvent} from '../discovery/Discovery.js';
import {Logger} from '../logger/Logger.js';
import {Runtime} from '../Runtime.js';
import {Provider} from './Provider.js';
import {Response} from './Response.js';
import {Route} from './Route.js';
import {RPCSender} from './RPCSender.js';

export type senderBuilder = (listenerId: string, targetId: string, wieght: number) => RPCSender;
export interface IRequestOptions {
  headers?: {
    [k: string]: any;
  };
  timeout?: number;
}

export type UndefinedToVoid<T> = T extends undefined ? void : T;
export type ThenArg<T> = T extends PromiseLike<infer U> ? U : T;
export type TypeOfClassMethod<T, M extends keyof T> = T[M] extends (...args: any) => any ? T[M] : never;
export type RawRouteRPCMethod<T extends Route, K extends keyof T> = (body: UndefinedToVoid<Parameters<TypeOfClassMethod<T, K>>[0]>, options?: IRequestOptions, raw?: true) => Promise<Response<ThenArg<ReturnType<TypeOfClassMethod<T, K>>>>>;
export type RouteRPCMethod<T extends Route, K extends keyof T> = (body: UndefinedToVoid<Parameters<TypeOfClassMethod<T, K>>[0]>, options?: IRequestOptions, raw?: false) => ReturnType<TypeOfClassMethod<T, K>>;
export type ConvertRPCRouteMethod<T extends Route> = {
  [K in keyof T]: RouteRPCMethod<T, K> & RawRouteRPCMethod<T, K>;
}
export type RouteMethod<T extends Route, K extends keyof T> = (body: UndefinedToVoid<Parameters<TypeOfClassMethod<T, K>>[0]>, options?: IRequestOptions) => Promise<void>;
export type ConvertRouteMethod<T extends Route> = {
  [K in keyof T]: RouteMethod<T, K>
}

export type EndpointStateUpdateHandler = (id: string, state: ListenerState, meta: IListenerMetaData) => Promise<void>;
export type EndpointEventHandler = (id: string, event: DiscoveryListenerEvent, meta: IListenerMetaData) => Promise<void>;

class ProviderManager {
  constructor(discovery: Discovery) {
    this.discovery_ = discovery;
    this.handlerId_ = 1;

    this.listenerCreateHandler_ = async (meta) => {
      this.listenerMetaData_.set(meta.id, meta);
      const handlers = this.endpointEventHandlerMap_.sureGet(meta.targetName);
      for (const handler of handlers) {
        if (handler.filter.isSatisfy(meta.labels)) {
          handler.handle(meta.id, DiscoveryListenerEvent.ListenerCreated, meta).catch((err: ExError) => {
            Runtime.frameLogger.error('provider-manager', err, {event: 'provider-endpoint-event-handler-error', error: Logger.errorMessage(err)});
          });
        }
      }
    };

    this.listenerStateUpdateHandler_ = async (id, state, pre, meta) => {
      this.listenerMetaData_.set(id, meta);
      const handlers = this.endpointStateHandlerMap_.sureGet(meta.targetName);
      for (const handler of handlers) {
        if (handler.filter.isSatisfy(meta.labels)) {
          handler.handle(id, state, meta).catch((err: ExError) => {
            Runtime.frameLogger.error('provider-manager', err, {event: 'provider-endpoint-state-handler-error', error: Logger.errorMessage(err)});
          });
        }
      }
    };

    this.listenerDeletedHandler_ = async (id) => {
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
    };
  }

  addEndpointUpateHandler(targetName: string, filter: LabelFilter, handler: EndpointStateUpdateHandler) {
    const handlerId = this.handlerId_ ++;
    this.endpointStateHandlerMap_.append(targetName, {id: handlerId, handle: handler, filter});
    for (const [id, meta] of this.listenerMetaData_) {
      if (meta.targetName === targetName && filter.isSatisfy(meta.labels))
        handler(id, meta.state, meta).catch((err: ExError) => {
          Runtime.frameLogger.error('provider-manager', err, {event: 'provider-endpoint-state-handler-error', error: Logger.errorMessage(err)});
        });
    }
    return handlerId;
  }

  addEndpointEventHandler(targetName: string, filter: LabelFilter, handler: EndpointEventHandler) {
    const handlerId = this.handlerId_ ++;

    this.endpointEventHandlerMap_.append(targetName, {id: handlerId, handle: handler, filter});

    for (const [id, meta] of this.listenerMetaData_) {
      if (meta.targetName === targetName && filter.isSatisfy(meta.labels))
        handler(id, DiscoveryListenerEvent.ListenerCreated, meta).catch((err: ExError) => {
          Runtime.frameLogger.error('provider-manager', err, {event: 'provider-endpoint-event-handler-error', error: Logger.errorMessage(err)});
        });
    }
    return handlerId;
  }

  removeEndpointUpdateHandler(targetName: string, id: number) {
    const array = this.endpointStateHandlerMap_.get(targetName);
    if (array) {
      const index = array.findIndex(item => item.id === id);
      if (index >= 0) {
        array.splice(index, 1);
      }
    }
  }

  removeEndpointEventHandler(targetName: string, id: number) {
    const array = this.endpointEventHandlerMap_.get(targetName);
    if (array) {
      const index = array.findIndex(item => item.id === id);
      if (index >= 0) {
        array.splice(index, 1);
      }
    }
  }

  async start(ctx: Context) {
    const endpoints = await ctx.await(this.discovery_.getAllEndpointList());
    for (const meta of endpoints) {
      this.listenerMetaData_.set(meta.id, meta);
    }

    this.discovery_.listenerEmitter.on(DiscoveryListenerEvent.ListenerCreated, this.listenerCreateHandler_);

    this.discovery_.listenerEmitter.on(DiscoveryListenerEvent.ListenerStateUpdate, this.listenerStateUpdateHandler_);

    this.discovery_.listenerEmitter.on(DiscoveryListenerEvent.ListenerDeleted, this.listenerDeletedHandler_);
  }

  async stop() {
    this.discovery_.listenerEmitter.off(DiscoveryListenerEvent.ListenerCreated, this.listenerCreateHandler_);

    this.discovery_.listenerEmitter.off(DiscoveryListenerEvent.ListenerStateUpdate, this.listenerStateUpdateHandler_);

    this.discovery_.listenerEmitter.off(DiscoveryListenerEvent.ListenerDeleted, this.listenerDeletedHandler_);
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

  async removeProvider(provider: Provider) {
    this.providerMap_.remove(provider.name, provider);
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

  private endpointStateHandlerMap_: ArrayMap<string /* service name */, {id: number; handle: EndpointStateUpdateHandler; filter: LabelFilter}> = new ArrayMap();
  private endpointEventHandlerMap_: ArrayMap<string /* service name */, {id: number; handle: EndpointEventHandler; filter: LabelFilter}> = new ArrayMap();
  private handlerId_: number;

  private listenerCreateHandler_: IDiscoveryListenerEvent[DiscoveryListenerEvent.ListenerCreated];
  private listenerStateUpdateHandler_: IDiscoveryListenerEvent[DiscoveryListenerEvent.ListenerStateUpdate];
  private listenerDeletedHandler_: IDiscoveryListenerEvent[DiscoveryListenerEvent.ListenerDeleted];
}

export {ProviderManager};
