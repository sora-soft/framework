import {RPCHeader} from '../../Const';
import {ErrorLevel, OPCode} from '../../Enum';
import {RPCErrorCode} from '../../ErrorCode';
import {IRawNetPacket, IResPayloadPacket} from '../../interface/rpc';
import {ExError} from '../../utility/ExError';
import {Logger} from '../logger/Logger';
import {Runtime} from '../Runtime';
import {Service} from '../Service';
import {ListenerCallback} from './Listener';
import {Notify} from './Notify';
import {Request} from './Request';
import {Response} from './Response';
import {RPCError} from './RPCError';

export type RPCHandler<Req = unknown, Res = unknown> = (body: Req, req?: Request<Req>, response?: Response<Res>) => Promise<Res>;
export type NotifyHandler<Req = unknown> = (body: Req, req?: Notify<Req>) => Promise<void>;

class Route<T extends Service = Service> {
  protected static method(target: Route, key: string) {
    target.registerMethod(key, target[key]);
  }

  protected static notify(target: Route, key: string) {
    target.registerNotify(key, target[key]);
  }

  static callback(route: Route): ListenerCallback {
    return async (packet: IRawNetPacket, session: string) => {
      const startTime = Date.now();
      switch (packet.opcode) {
        case OPCode.REQUEST:
          const request = new Request(packet);
          const response = new Response();
          const rpcId = request.getHeader(RPCHeader.RPC_ID_HEADER);
          request.setHeader(RPCHeader.RPC_SESSION_HEADER, session);
          Runtime.rpcLogger.debug('route', { method: request.method, request: request.payload });
          if (!route.hasMethod(request.method))
            throw new RPCError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, `ERR_RPC_METHOD_NOT_FOUND, service=${route.service.name}, method=${request.method}`);

          const result = await route.callMethod(request.method, request, response).catch((err: ExError) => {
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
          response.setHeader(RPCHeader.RPC_ID_HEADER, rpcId);
          response.setHeader(RPCHeader.RPC_FROM_ID_HEADER, route.service_.id);
          response.payload = result;
          Runtime.rpcLogger.debug('route', { method: request.method, request: request.payload, response: response.payload, duration: Date.now() - startTime });
          return response.toPacket();
        case OPCode.NOTIFY:
          // notify 不需要回复
          const notify = new Notify(packet);
          notify.setHeader(RPCHeader.RPC_SESSION_HEADER, session);
          Runtime.rpcLogger.debug('route', { method: notify.method, notify: notify.payload });
          if (!route.hasNotify(request.method))
            throw new RPCError(RPCErrorCode.ERR_RPC_METHOD_NOT_FOUND, `ERR_RPC_METHOD_NOT_FOUND, service=${route.service.name}, method=${request.method}`);

            await route.callNotify(notify.method, notify).catch(err => {
            Runtime.frameLogger.error('route', err, { event: 'notify-handler', error: Logger.errorMessage(err), method: notify.method, request: notify.payload })
          });
          Runtime.rpcLogger.debug('route', { method: notify.method, notify: notify.payload, duration: Date.now() - startTime });
          return null;
        case OPCode.RESPONSE:
          // 不应该在路由处收到 rpc 回包消息
          return null;
      }
    }
  }

  constructor(service: T) {
    this.service_ = service;
    if (!this.methodMap_)
      this.methodMap_ = new Map();

    if (!this.notifyMap_)
      this.notifyMap_ = new Map();
  }

  protected registerMethod(method: string, callback: RPCHandler) {
    if (!this.methodMap_)
      this.methodMap_ = new Map();

    this.methodMap_.set(method, callback);
  }

  protected registerNotify(method: string, callback: NotifyHandler) {
    if (!this.notifyMap_)
      this.notifyMap_ = new Map();

    this.notifyMap_.set(method, callback);
  }

  protected async callMethod(method: string, request: Request, response: Response) {
    if (this.methodMap_.has(method)) {
      try {
        const result = await (this[method] as RPCHandler)(request.payload, request, response);
        return {
          error: null,
          result,
        }
      } catch(err) {
        if (err.name === 'TypeGuardError') {
          throw new RPCError(RPCErrorCode.ERR_RPC_PARAMTER_INVALID, `ERR_RPC_PARAMTER_INVALID, ${err.message.split(',').slice(0, 1).join('')}`)
        }
        throw err;
      }
    }
  }

  protected async callNotify(method: string, request: Notify) {
    if (this.notifyMap_.has(method)) {
      return (this[method] as NotifyHandler)(request.payload, request).catch(err => {
        if (err.name === 'TypeGuardError') {
          throw new RPCError(RPCErrorCode.ERR_RPC_PARAMTER_INVALID, `ERR_RPC_PARAMTER_INVALID, ${err.message.split(',').slice(0, 1).join('')}`)
        }
        throw err;
      });
    }
  }

  protected hasMethod(method: string) {
    return this.methodMap_.has(method);
  }

  protected hasNotify(method: string) {
    return this.notifyMap_.has(method);
  }

  protected get service() {
    return this.service_;
  }

  private methodMap_: Map<string, RPCHandler>;
  private notifyMap_: Map<string, NotifyHandler>;
  private service_: T;
}

export {Route}
