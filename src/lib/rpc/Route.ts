import {RPCHeader} from '../../Const';
import {ErrorLevel, OPCode} from '../../Enum';
import {RPCErrorCode} from '../../ErrorCode';
import {IRawResPacket, IResPayloadPacket} from '../../interface/rpc';
import {ExError} from '../../utility/ExError';
import {Logger} from '../logger/Logger';
import {Runtime} from '../Runtime';
import {Connector} from './Connector';
import {ListenerCallback} from './Listener';
import {Notify} from './Notify';
import {Request} from './Request';
import {Response} from './Response';
import {RPCError, RPCResponseError} from './RPCError';

export type RPCHandler<Req = unknown, Res = unknown> = (body: Req, req?: Request<Req>, response?: Response<Res>) => Promise<Res>;
export type NotifyHandler<Req = unknown> = (body: Req, req?: Notify<Req>) => Promise<void>;
export type MethodPramBuilder<T = unknown, Req = unknown, Res = unknown> = (body: Req, req: Request<Req>, response: Response<Res>, connector: Connector) => Promise<T>;
export interface IMethodParamProvider<T = unknown, Req = unknown, Res = unknown> {
  type: any;
  builder: MethodPramBuilder<T, Req, Res>;
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
    target.registerNotify(key, target[key]);
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
            Runtime.rpcLogger.debug('route', { method: request.method, request: request.payload });

            response.setHeader(RPCHeader.RPC_ID_HEADER, rpcId);
            // response.setHeader(RPCHeader.RPC_FROM_ID_HEADER, route.service_.id);

            if (!route.hasMethod(request.method))
              throw new RPCResponseError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, ErrorLevel.EXPECTED, `ERR_RPC_METHOD_NOT_FOUND, method=${request.method}`);

            const result = await route.callMethod(request.method, request, response, connector).catch((err: ExError) => {
              Runtime.frameLogger.error('route', err, { event: 'rpc-handler', error: Logger.errorMessage(err), method: request.method, request: request.payload });
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
            Runtime.rpcLogger.debug('route', { method: request.method, request: request.payload, response: response.payload, duration: Date.now() - startTime });

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
          Runtime.rpcLogger.debug('route', { method: notify.method, notify: notify.payload });
          if (!route.hasNotify(notify.method))
            throw new RPCError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, `ERR_RPC_METHOD_NOT_FOUND, method=${notify.method}`);

            await route.callNotify(notify.method, notify).catch(err => {
            Runtime.frameLogger.error('route', err, { event: 'notify-handler', error: Logger.errorMessage(err), method: notify.method, request: notify.payload })
          });
          Runtime.rpcLogger.debug('route', { method: notify.method, notify: notify.payload, duration: Date.now() - startTime });
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

    if (!this.methodParamsMap_)
      this.methodParamsMap_ = new Map();

    if (!this.methodParamsProviderMap_)
      this.methodParamsProviderMap_ = new Map();
  }

  protected registerMethod(method: string, callback: RPCHandler, types: any[]) {
    if (!this.methodMap_)
      this.methodMap_ = new Map();

    this.methodMap_.set(method, callback);

    if (!this.methodParamsMap_)
      this.methodParamsMap_ = new Map();

    this.methodParamsMap_.set(method, types);
  }

  protected registerHookedMethod(method: string, callback: RPCHandler, types: any[]) {
    this.registerMethod(method, callback, types);

    if (!this.hookedMethod_)
      this.hookedMethod_ = new Set();
    this.hookedMethod_.add(method);
  }

  protected registerNotify(method: string, callback: NotifyHandler) {
    if (!this.notifyMap_)
      this.notifyMap_ = new Map();

    this.notifyMap_.set(method, callback);
  }

  registerProvider(method: string, provider: IMethodParamProvider) {
    if (!this.methodParamsProviderMap_)
      this.methodParamsProviderMap_ = new Map();

    let pre = this.methodParamsProviderMap_.get(method);
    if (!pre)
      pre = [];
    pre.push(provider);

    this.methodParamsProviderMap_.set(method, pre);
  }

  protected findProvider(method: string, target: any): null | MethodPramBuilder {
    const providers = this.methodParamsProviderMap_.get(method);
    if (!providers)
      return null;
    for (const provider of providers) {
      if (provider.type === target)
        return provider.builder;
    }
    return null;
  }

  protected async callMethod(method: string, request: Request, response: Response, connector: Connector) {
    if (this.methodMap_.has(method)) {
      try {
        const paramsTypes = this.methodParamsMap_.get(method);
        if (!paramsTypes) {
          throw new RPCResponseError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, ErrorLevel.EXPECTED, `ERR_RPC_METHOD_NOT_FOUND`)
        }

        const params: any[] = await Promise.all(paramsTypes.slice(1).map(async (type) => {
          switch(type) {
            case Connector:
              return connector;
            case Request:
              return request;
            case Response:
              return response;
            default:
              const builder = this.findProvider(method, type);
              if (builder) {
                return builder(request.payload, request, response, connector);
              }
              return null;
          }
        }));

        params.unshift(request.payload);

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

  protected async callNotify(method: string, request: Notify) {
    if (this.notifyMap_.has(method)) {
      return (this[method] as NotifyHandler)(request.payload, request).catch(err => {
        if (err.name === 'TypeGuardError') {
          throw new RPCResponseError(RPCErrorCode.ERR_RPC_PARAMETER_INVALID, ErrorLevel.EXPECTED, `ERR_RPC_PARAMETER_INVALID, ${err.message.split(',').slice(0, 1).join('')}`)
        }
        throw err;
      });
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

  protected methodMap_: Map<string, RPCHandler>;
  protected methodParamsMap_: Map<string, any[]>;
  protected methodParamsProviderMap_: Map<string, IMethodParamProvider[]>;
  protected notifyMap_: Map<string, NotifyHandler>;
  protected hookedMethod_: Set<string>;
}

export {Route}
