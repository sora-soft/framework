import {RPCHeader} from '../../Const';
import {ErrorLevel, OPCode} from '../../Enum';
import {RPCErrorCode} from '../../ErrorCode';
import {IRawResPacket, IResPayloadPacket} from '../../interface/rpc';
import {ExError} from '../../utility/ExError';
import {ArrayMap} from '../../utility/Utility';
import {Logger} from '../logger/Logger';
import {Runtime} from '../Runtime';
import {Connector} from './Connector';
import {ListenerCallback} from './Listener';
import {Notify} from './Notify';
import {Request} from './Request';
import {Response} from './Response';
import {RPCError, RPCResponseError} from './RPCError';

export type RPCHandler<Req=unknown, Res=unknown> = (body: Req, ...args) => Promise<Res>;
export type MethodPramBuilder<T=unknown, R extends Route = Route, Req=unknown, Res=unknown> = (route: R, body: Req, req: Request<Req>, response: Response<Res> | null, connector: Connector) => Promise<T>;
export interface IRPCHandlerParam<T=unknown, R extends Route = Route, Req=unknown, Res=unknown> {
  type: any;
  provider: MethodPramBuilder<T, R, Req, Res>
}
export type IRPCMiddlewares<T extends Route = Route, Req = unknown, Res = unknown> = (route: T, body: Req, req: Request<Req>, response: Response<Res> | null, connector: Connector) => Promise<boolean>;
export interface IRPCHandler<Req=unknown, Res=unknown> {
  params: any[];
  handler: RPCHandler<Req, Res>;
}


export type NotifyHandler<Req = unknown> = (body: Req, ...args) => Promise<void>;
export interface INotifyHandler<Req=unknown> {
  params: any[];
  handler: NotifyHandler<Req>;
}

class Route {
  protected static method(target: Route, key: string) {
    const types = Reflect.getMetadata('design:paramtypes', target, key);

    target.registerMethod(key, target[key], types);
  }

  protected static hook(target: Route, key: string) {
    const types = Reflect.getMetadata('design:paramtypes', target, key);

    target.registerHookedMethod(key, target[key], types);
  }

  protected static notify(target: Route, key: string) {
    const types = Reflect.getMetadata('design:paramtypes', target, key);

    target.registerNotify(key, target[key], types);
  }

  protected static makeErrorRPCResponse(request: Request, response: Response, err: ExError) {
    response.payload = {
      error: {
          code: err.code || RPCErrorCode.ERR_RPC_UNKNOWN,
          level: err.level || ErrorLevel.UNEXPECTED,
          name: err.name,
          message: err.message,
        },
        result: null
    };
    return response.toPacket();
  }

  static hasMethod(route: Route, method: string) {
    return route.hasMethod(method);
  }

  static hasNotify(route: Route, notify: string) {
    return route.hasNotify(notify);
  }

  static callback(route: Route): ListenerCallback {
    return async (packet, session, connector): Promise<IRawResPacket | null> => {
      const startTime = Date.now();
      switch (packet.opcode) {
        case OPCode.REQUEST: {
          const request = new Request(packet);
          const response = new Response();
          try {
            const rpcId = request.getHeader<number>(RPCHeader.RPC_ID_HEADER);
            request.setHeader(RPCHeader.RPC_SESSION_HEADER, session);
            Runtime.rpcLogger.debug('route', { event: 'receive-rpc-request', method: request.method });

            response.setHeader(RPCHeader.RPC_ID_HEADER, rpcId);

            if (!route.hasMethod(request.method))
              throw new RPCResponseError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, ErrorLevel.EXPECTED, `ERR_RPC_METHOD_NOT_FOUND, method=${request.method}`);

            const result = await route.callMethod(request.method, request, response, connector).catch((err: ExError) => {
              if (err.level !== ErrorLevel.EXPECTED) {
                Runtime.rpcLogger.error('route', err, { event: 'rpc-handler-error', error: Logger.errorMessage(err), method: request.method, request: request.payload });
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
            Runtime.rpcLogger.debug('route', { event: 'response-rpc-request', method: request.method, duration: Date.now() - startTime });

            // hooked Method 自行通过connector返回
            if (route.isHookedMethod(request.method)) {
              return null;
            }
            return response.toPacket();
          } catch (err) {
            const exError = ExError.fromError(err);
            return this.makeErrorRPCResponse(request, response, exError);
          }
        }

        case OPCode.NOTIFY:
          // notify 不需要回复
          const notify = new Notify(packet);
          notify.setHeader(RPCHeader.RPC_SESSION_HEADER, session);
          Runtime.rpcLogger.debug('route', { event: 'receive-notify', method: notify.method });
          if (!route.hasNotify(notify.method))
            throw new RPCError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, `ERR_RPC_METHOD_NOT_FOUND, method=${notify.method}`);

            await route.callNotify(notify.method, notify, connector).catch((err: ExError) => {
              if (err.level !== ErrorLevel.EXPECTED) {
                Runtime.frameLogger.error('route', err, { event: 'notify-handler', error: Logger.errorMessage(err), method: notify.method, request: notify.payload })
              }
            });
          Runtime.rpcLogger.debug('route', { event: 'handled-notify', method: notify.method, duration: Date.now() - startTime });
          return null;
        default:
          // 不应该在路由处收到 rpc 回包消息
          return null;
      }
    }
  }

  constructor() {
    if (!this.methodMap_)
      this.methodMap_ = new Map();

    if (!this.notifyMap_)
      this.notifyMap_ = new Map();

    if (!this.hookedMethod_)
      this.hookedMethod_ = new Set();

    if (!this.middlewareMap_)
      this.middlewareMap_ = new ArrayMap();

    if (!this.providerMap_)
      this.providerMap_ = new ArrayMap();
  }

  protected registerMethod(method: string, callback: RPCHandler, types: any[]) {
    if (!this.methodMap_)
      this.methodMap_ = new Map();

    this.methodMap_.set(method, {
      params: types,
      handler: callback,
    });
  }

  protected registerHookedMethod(method: string, callback: RPCHandler, types: any[]) {
    this.registerMethod(method, callback, types);

    if (!this.hookedMethod_)
      this.hookedMethod_ = new Set();
    this.hookedMethod_.add(method);
  }

  protected registerNotify(method: string, callback: NotifyHandler, types: any[]) {
    if (!this.notifyMap_)
      this.notifyMap_ = new Map();

    this.notifyMap_.set(method, {
      params: types,
      handler: callback,
    });
  }

  protected registerProvider<T=unknown, R extends Route = Route>(method: string, type: any, provider: MethodPramBuilder<T, R>) {
    if (!this.providerMap_)
      this.providerMap_ = new ArrayMap();

    this.providerMap_.append(method, {
      type,
      provider,
    });
  }

  protected registerMiddleware<T extends Route = Route>(method: string, middleware: IRPCMiddlewares<T>) {
    if (!this.middlewareMap_)
      this.middlewareMap_ = new ArrayMap();
    this.middlewareMap_.append(method, middleware);
  }

  protected async buildCallParams<T extends Route>(route: T, method: string, paramTypes: any[], request: Request, response: Response | null, connector: Connector) {
    const params: any[] = await Promise.all(paramTypes.slice(1).map(async (type) => {
      switch(type) {
        case Connector:
          return connector;
        case Request:
          return request;
        case Response:
          return response;
        default:
          const providers = this.providerMap_.get(method);
          if (!providers)
            return null;

          const provider = providers.find(p => p.type === type);
          if (!provider)
            return null;

          return provider.provider(route, request.payload, request, response, connector);
      }
    }));

    params.unshift(request.payload);

    return params
  }

  protected async callMethod(method: string, request: Request, response: Response, connector: Connector) {
    if (this.methodMap_.has(method)) {
      try {
        const handler = this.methodMap_.get(method);
        if (!handler) {
          throw new RPCResponseError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, ErrorLevel.EXPECTED, `ERR_RPC_METHOD_NOT_FOUND`)
        }

        const middlewares = this.middlewareMap_.get(method);
        if (middlewares) {
          for (const middleware of middlewares.reverse()) {
            const next = await middleware(this, request.payload, request, response, connector);
            if (!next)
              break;
          }
        }

        const params = await this.buildCallParams(this, method, handler.params, request, response, connector);
        const result = await (this[method] as RPCHandler).apply(this, params);
        return {
          error: null,
          result,
        };
      } catch(err) {
        if (err.name === 'TypeGuardError') {
          throw new RPCResponseError(RPCErrorCode.ERR_RPC_PARAMETER_INVALID, ErrorLevel.EXPECTED, `ERR_RPC_PARAMETER_INVALID, ${err.message.split(',').slice(0, 1).join('')}`)
        }
        throw err;
      }
    } else {
      throw new RPCResponseError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, ErrorLevel.EXPECTED, `ERR_RPC_METHOD_NOT_FOUND`);
    }
  }

  protected async callNotify(method: string, request: Notify, connector: Connector) {
    if (this.notifyMap_.has(method)) {
      try {
        const handler = this.notifyMap_.get(method);
        if (!handler) {
          throw new RPCResponseError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, ErrorLevel.EXPECTED, `ERR_RPC_METHOD_NOT_FOUND`)
        }

        const middlewares = this.middlewareMap_.get(method);
        if (middlewares) {
          for (const middleware of middlewares) {
            const next = await middleware(this, request.payload, request, null, connector);
            if (!next)
              break;
          }
        }

        const params = await this.buildCallParams(this, method, handler.params, request, null, connector);
        await (this[method] as NotifyHandler).apply(this, params);
      } catch (err) {
        if (err.name === 'TypeGuardError') {
          throw new RPCResponseError(RPCErrorCode.ERR_RPC_PARAMETER_INVALID, ErrorLevel.EXPECTED, `ERR_RPC_PARAMETER_INVALID, ${err.message.split(',').slice(0, 1).join('')}`)
        }
        throw err;
      }
    }
  }

  protected hasMethod(method: string) {
    return this.methodMap_.has(method);
  }

  protected isHookedMethod(method: string) {
    return this.hookedMethod_.has(method);
  }

  protected hasNotify(method: string) {
    return this.notifyMap_.has(method);
  }

  protected methodMap_: Map<string, IRPCHandler>;
  protected notifyMap_: Map<string, INotifyHandler>;
  protected hookedMethod_: Set<string>;
  protected middlewareMap_: ArrayMap<string, IRPCMiddlewares>;
  protected providerMap_: ArrayMap<string, IRPCHandlerParam>;
}

export {Route}
