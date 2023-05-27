import {ArrayMap} from '../../utility/Utility.js';
import {Discovery} from '../discovery/Discovery.js';
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

class ProviderManager {
  constructor(discovery: Discovery) {
    this.discovery_ = discovery;
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

  addProvider(provider: Provider) {
    this.providerMap_.append(provider.name, provider);
  }

  removeProvider(provider: Provider) {
    this.providerMap_.remove(provider.name, provider);
  }

  getAllProviders() {
    return [...this.providerMap_].map(([_, providers]) => providers).flat();
  }

  get discovery() {
    return this.discovery_;
  }

  private discovery_: Discovery;
  private senderBuilder_: Map<string, senderBuilder> = new Map();
  private providerMap_: ArrayMap<string /* service name */, Provider> = new ArrayMap();
}

export {ProviderManager};
