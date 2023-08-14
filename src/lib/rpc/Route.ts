import {RPCHeader} from '../../Const.js';
import {ErrorLevel, OPCode} from '../../Enum.js';
import {RPCErrorCode} from '../../ErrorCode.js';
import {IRawResPacket, IResPayloadPacket} from '../../interface/rpc.js';
import {ExError} from '../../utility/ExError.js';
import {Logger} from '../logger/Logger.js';
import {Runtime} from '../Runtime.js';
import {Connector} from './Connector.js';
import {ListenerCallback} from './Listener.js';
import {Notify} from './Notify.js';
import {Request} from './Request.js';
import {Response} from './Response.js';
import {RPCError, RPCResponseError} from './RPCError.js';
import 'reflect-metadata';
import {TypeGuardError} from '@sora-soft/type-guard';

export type RPCHandler<Req=unknown, Res=unknown> = (body: Req, ...args) => Promise<Res>;
export type MethodPramBuilder<T=unknown, R extends Route = Route, Req=unknown, Res=unknown> = (route: R, body: Req, req: Request<Req> | Notify<Req>, response: Response<Res> | null, connector: Connector) => Promise<T>;
export interface IRPCHandlerParam<T=unknown, R extends Route = Route, Req=unknown, Res=unknown> {
  type: any;
  provider: MethodPramBuilder<T, R, Req, Res>;
}
export type IRPCMiddlewares<T extends Route = Route, Req = unknown, Res = unknown> = (route: T, body: Req, req: Request<Req> | Notify<Req>, response: Response<Res> | null, connector: Connector) => Promise<boolean>;
export interface IRPCHandler<Req=unknown, Res=unknown> {
  params: any[];
  handler: RPCHandler<Req, Res>;
}


export type NotifyHandler<Req = unknown> = (body: Req, ...args) => Promise<void>;
export interface INotifyHandler<Req=unknown> {
  params: any[];
  handler: NotifyHandler<Req>;
}

export enum MiddlewarePosition {
  Before = 'before',
  After = 'after',
}

const MethodMapSymbol = Symbol('sora:method');
const NotifyMapSymbol = Symbol('sora:notify');
const ProviderSymbol = Symbol('sora:provider');
const MiddlewareBeforeSymbol = Symbol('sora:middleware-before');
const MiddlewareAfterSymbol = Symbol('sora:middleware-after');

const symbolMap = {
  [MiddlewarePosition.After]: MiddlewareAfterSymbol,
  [MiddlewarePosition.Before]: MiddlewareBeforeSymbol,
};

class Route {
  protected static method(target: Route, key: string) {
    const types = Reflect.getMetadata('design:paramtypes', target, key) as unknown[];
    Route.registerMethod(target, key, target[key] as RPCHandler, types);
  }

  protected static notify(target: Route, key: string) {
    const types = Reflect.getMetadata('design:paramtypes', target, key) as unknown[];

    Route.registerNotify(target, key, target[key] as NotifyHandler, types);
  }

  protected static registerMethod(target: Route, method: string, callback: RPCHandler, types: any[]) {
    let map = Reflect.getMetadata(MethodMapSymbol, target) as Map<string, IRPCHandler> | undefined;
    if (!map) {
      map = new Map();
    }
    map.set(method, {
      params: types,
      handler: callback,
    });
    Reflect.defineMetadata(MethodMapSymbol, map, target);
  }

  protected static registerNotify(target: Route, method: string, callback: NotifyHandler, types: any[]) {
    let map = Reflect.getMetadata(NotifyMapSymbol, target) as Map<string, INotifyHandler> | undefined;
    if (!map) {
      map = new Map();
    }
    map.set(method, {
      params: types,
      handler: callback,
    });
    Reflect.defineMetadata(NotifyMapSymbol, map, target);
  }

  protected static registerProvider<T=unknown, R extends Route = Route>(target: R, method: string, type: unknown, provider: MethodPramBuilder<T, R>) {
    let providers = Reflect.getMetadata(ProviderSymbol, target, method) as IRPCHandlerParam[] | undefined;
    if (!providers) {
      providers = [];
    }

    providers.push({
      type,
      provider,
    });
    Reflect.defineMetadata(ProviderSymbol, providers, target, method);
  }

  protected static registerMiddleware<T extends Route = Route>(target: T, method: string, position: MiddlewarePosition, middleware: IRPCMiddlewares<T>) {
    let middlewares = Reflect.getMetadata(symbolMap[position], target, method) as IRPCMiddlewares[] | undefined;
    if (!middlewares) {
      middlewares = [];
    }

    middlewares.push(middleware);
    Reflect.defineMetadata(symbolMap[position], middlewares, target, method);
  }

  protected static makeErrorRPCResponse(request: Request, response: Response, err: ExError) {
    response.payload = {
      error: {
        code: err.code || RPCErrorCode.ERR_RPC_UNKNOWN,
        level: err.level || ErrorLevel.UNEXPECTED,
        name: err.name,
        message: err.message,
      },
      result: null,
    };
    return response.toPacket();
  }

  static callback(route: Route): ListenerCallback {
    return async (packet, session, connector): Promise<IRawResPacket | null> => {
      const startTime = Date.now();
      switch (packet.opcode) {
        case OPCode.REQUEST: {
          const request = new Request(packet);
          const response = new Response<unknown>({
            headers: {},
            payload: {error: null, result: null},
          });
          try {
            const rpcId = request.getHeader<number>(RPCHeader.RPC_ID_HEADER);
            request.setHeader(RPCHeader.RPC_SESSION_HEADER, session);
            Runtime.rpcLogger.debug('route', {event: 'receive-rpc-request', method: request.method});

            response.setHeader(RPCHeader.RPC_ID_HEADER, rpcId);

            if (!route.hasMethod(request.method))
              throw new RPCResponseError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, ErrorLevel.EXPECTED, `ERR_RPC_METHOD_NOT_FOUND, method=${request.method}`);

            const result = await route.callMethod(request.method, request, response, connector).catch((err: ExError) => {
              if (err.level !== ErrorLevel.EXPECTED) {
                Runtime.rpcLogger.error('route', err, {event: 'rpc-handler-error', error: Logger.errorMessage(err), method: request.method, request: request.payload});
              }
              return {
                error: {
                  code: err.code || RPCErrorCode.ERR_RPC_UNKNOWN,
                  level: err.level || ErrorLevel.UNEXPECTED,
                  name: err.name,
                  message: err.message,
                },
                result: null,
              } as IResPayloadPacket<null>;
            });
            response.payload = result;
            Runtime.rpcLogger.debug('route', {event: 'response-rpc-request', method: request.method, duration: Date.now() - startTime});

            return response.toPacket();
          } catch (err) {
            const exError = ExError.fromError(err as Error);
            return this.makeErrorRPCResponse(request, response, exError);
          }
        }

        case OPCode.NOTIFY:
          // notify 不需要回复
          const notify = new Notify(packet);
          notify.setHeader(RPCHeader.RPC_SESSION_HEADER, session);
          Runtime.rpcLogger.debug('route', {event: 'receive-notify', method: notify.method});
          if (!route.hasNotify(notify.method))
            throw new RPCError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, `ERR_RPC_METHOD_NOT_FOUND, method=${notify.method}`);

          await route.callNotify(notify.method, notify, connector).catch((err: ExError) => {
            if (err.level !== ErrorLevel.EXPECTED) {
              Runtime.frameLogger.error('route', err, {event: 'notify-handler', error: Logger.errorMessage(err), method: notify.method, request: notify.payload});
            }
          });
          Runtime.rpcLogger.debug('route', {event: 'handled-notify', method: notify.method, duration: Date.now() - startTime});
          return null;
        default:
          // 不应该在路由处收到 rpc 回包消息
          return null;
      }
    };
  }

  constructor() {}

  protected async buildCallParams(method: string, paramTypes: any[], request: Request | Notify, response: Response | null, connector: Connector) {
    const params: unknown[] = await Promise.all(paramTypes.slice(1).map(async (type) => {
      switch(type) {
        case Connector:
          return connector;
        case Request:
          return request;
        case Response:
          return response;
        default:
          const prototype = Object.getPrototypeOf(this) as Object;
          const providers = Reflect.getMetadata(ProviderSymbol, prototype, method) as IRPCHandlerParam[] | undefined;
          if (!providers)
            return null;

          const provider = providers.find(p => p.type === type);
          if (!provider)
            return null;

          return provider.provider(this, request.payload, request, response, connector);
      }
    }));

    params.unshift(request.payload);

    return params;
  }

  protected async callMethod(method: string, request: Request, response: Response, connector: Connector) {
    const prototype = Object.getPrototypeOf(this) as Object;

    const map = Reflect.getMetadata(MethodMapSymbol, prototype) as Map<string, IRPCHandler> | undefined;
    if (map) {
      try {
        const handler = map.get(method);
        if (!handler) {
          throw new RPCResponseError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, ErrorLevel.EXPECTED, 'ERR_RPC_METHOD_NOT_FOUND');
        }

        const beforeMiddlewares = Reflect.getMetadata(MiddlewareBeforeSymbol, prototype, method) as IRPCMiddlewares[];
        if (beforeMiddlewares) {
          for (const middleware of beforeMiddlewares) {
            const next = await middleware(this, request.payload, request, null, connector);
            if (!next)
              break;
          }
        }

        const params = await this.buildCallParams(method, handler.params, request, response, connector);
        const result = await (this[method] as RPCHandler).apply(this, params) as unknown;

        const afterMiddlewares = Reflect.getMetadata(MiddlewareAfterSymbol, prototype, method) as IRPCMiddlewares[];
        if (afterMiddlewares) {
          for (const middleware of afterMiddlewares) {
            const next = await middleware(this, request.payload, request, response, connector);
            if (!next)
              break;
          }
        }
        return {
          error: null,
          result,
        };
      } catch(e) {
        if (e instanceof TypeGuardError) {
          throw new RPCResponseError(RPCErrorCode.ERR_RPC_PARAMETER_INVALID, ErrorLevel.EXPECTED, `ERR_RPC_PARAMETER_INVALID, ${e.message}}`);
        }
        const err = ExError.fromError(e as Error);
        throw err;
      }
    } else {
      throw new RPCResponseError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, ErrorLevel.EXPECTED, 'ERR_RPC_METHOD_NOT_FOUND');
    }
  }

  protected async callNotify(method: string, request: Notify, connector: Connector) {
    const prototype = Object.getPrototypeOf(this) as Object;

    const map = Reflect.getMetadata(NotifyMapSymbol, prototype) as Map<string, INotifyHandler> | undefined;
    if (map) {
      try {
        const handler = map.get(method);
        if (!handler) {
          throw new RPCResponseError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, ErrorLevel.EXPECTED, 'ERR_RPC_METHOD_NOT_FOUND');
        }

        const beforeMiddlewares = Reflect.getMetadata(MiddlewareBeforeSymbol, prototype) as IRPCMiddlewares[];
        if (beforeMiddlewares) {
          for (const middleware of beforeMiddlewares) {
            const next = await middleware(this, request.payload, request, null, connector);
            if (!next)
              break;
          }
        }

        const params = await this.buildCallParams(method, handler.params, request, null, connector);
        await (this[method] as NotifyHandler).apply(this, params);

        const afterMiddlewares = Reflect.getMetadata(MiddlewareAfterSymbol, prototype, method) as IRPCMiddlewares[];
        if (afterMiddlewares) {
          for (const middleware of afterMiddlewares) {
            const next = await middleware(this, request.payload, request, null, connector);
            if (!next)
              break;
          }
        }
      } catch (e) {
        if (e instanceof TypeGuardError) {
          throw new RPCResponseError(RPCErrorCode.ERR_RPC_PARAMETER_INVALID, ErrorLevel.EXPECTED, `ERR_RPC_PARAMETER_INVALID, ${e.message}}`);
        }
        const err = ExError.fromError(e as Error);
        throw err;
      }
    }
  }

  protected hasMethod(method: string) {
    const prototype = Object.getPrototypeOf(this) as Object;
    const map = Reflect.getMetadata(MethodMapSymbol, prototype) as Map<string, IRPCHandler> | undefined;
    return map?.has(method);
  }

  protected hasNotify(method: string) {
    const prototype = Object.getPrototypeOf(this) as Object;
    const map = Reflect.getMetadata(NotifyMapSymbol, prototype) as Map<string, INotifyHandler> | undefined;
    return map?.has(method);
  }
}

export {Route};
