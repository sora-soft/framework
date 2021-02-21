import {Const} from '../../Const';
import {OPCode} from '../../Enum';
import {RPCErrorCode} from '../../ErrorCode';
import {IRawNetPacket} from '../../interface/rpc';
import {Service} from '../Service';
import {Notify} from './Notify';
import {Request} from './Request';
import {Response} from './Response';

export type RPCHandler<Req = unknown, Res = unknown> = (body: Req, req?: Request<Req>, response?: Response<Res>) => Promise<Res>;
export type NotifyHandler<Req = unknown> = (body: Req, req?: Notify<Req>) => Promise<void>;

class Route {
  protected static method(target: Route, key: string) {
    target.registerMethod(key, target[key]);
  }

  protected static notify(target: Route, key: string) {
    target.registerNotify(key, target[key]);
  }

  static callback(route: Route) {
    return async (packet: IRawNetPacket) => {
      switch (packet.opcode) {
        case OPCode.REQUEST:
          const request = new Request(packet);
          const response = new Response();
          const rpcId = request.getHeader(Const.RPC_ID_HEADER);
          const result = await route.callMethod(request.method, request, response).catch(err => {
            // TODO logging
            return {
              error: err.code || RPCErrorCode.ERR_RPC_UNKNOWN,
              message: err.message,
            }
          });
          response.setHeader(Const.RPC_ID_HEADER, rpcId);
          response.setHeader(Const.RPC_FROM_ID_HEADER, route.service_.id);
          response.payload = result;
          return response.toPacket();
        case OPCode.NOTIFY:
          // notify 不需要回复
          const notify = new Notify(packet);
          await route.callNotify(notify.method, notify).catch(err => {
            // TODO logging
          });
          return null;
        case OPCode.RESPONSE:
          // 不应该在路由处收到 rpc 回包消息
          return null;
      }
    }
  }

  constructor(service: Service) {
    this.service_ = service;
  }

  protected registerMethod(method: string, callback: RPCHandler) {
    if (!this.methodMap_)
      this.methodMap_ = new Map();

    this.methodMap_.set(method, callback.bind(this));
  }

  protected registerNotify(method: string, callback: NotifyHandler) {
    if (!this.notifyMap_)
      this.notifyMap_ = new Map();

    this.notifyMap_.set(method, callback.bind(this));
  }

  protected async callMethod(method: string, request: Request, response: Response) {
    if (this.methodMap_.has(method)) {
      const handler = this.methodMap_.get(method);
      return handler(request.payload, request, response);
    }
  }

  protected async callNotify(method: string, request: Notify) {
    if (this.notifyMap_.has(method)) {
      const handler = this.notifyMap_.get(method);
      return handler(request.payload, request);
    }
  }

  protected get service() {
    return this.service_;
  }

  private methodMap_: Map<string, RPCHandler>;
  private notifyMap_: Map<string, NotifyHandler>;
  private service_: Service;
}

export {Route}
