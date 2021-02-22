import {Const} from '../../Const';
import {SenderState} from '../../Enum';
import {RPCErrorCode} from '../../ErrorCode';
import {IListenerInfo, IRawNetPacket, IRawResPacket} from '../../interface/rpc';
import {LifeCycle} from '../../utility/LifeCycle'
import {TimeoutError} from '../../utility/TimeoutError';
import {Waiter} from '../../utility/Waiter';
import {Notify} from './Notify';
import {Request} from './Request';
import {RPCError} from './RPCError';

abstract class Sender {
  constructor(listenerId: string, targetId: string) {
    this.lifeCycle_ = new LifeCycle(SenderState.INIT);
    this.waiter_ = new Waiter();
    this.listenerId_ = listenerId;
    this.targetId_ = targetId;
  }

  protected abstract connect(listenInfo: IListenerInfo): Promise<void>;
  public async start(listenInfo: IListenerInfo) {
    if (this.lifeCycle_.state > SenderState.INIT)
      return;

    this.listenInfo_ = listenInfo;
    await this.connect(listenInfo).catch(this.onError.bind(this));
    this.lifeCycle_.setState(SenderState.READY);
  }

  protected abstract disconnect(): Promise<void>;
  public async off() {
    if (this.lifeCycle_.state >= SenderState.STOPPING)
      return;

    this.lifeCycle_.setState(SenderState.STOPPING);
    await this.waiter_.waitForAll(10000);
    await this.disconnect().catch(this.onError.bind(this));
    this.lifeCycle_.setState(SenderState.STOPPED);
  }

  private onError(err: Error) {
    this.lifeCycle_.setState(SenderState.ERROR, err);
    throw err;
  }

  protected abstract send<RequestPayload>(request: IRawNetPacket<RequestPayload>): Promise<void>;
  public async sendRpc<ResponsePayload>(request: Request, fromId?: string): Promise<IRawResPacket<ResponsePayload>> {
    const wait = this.waiter_.wait(10000);
    request.setHeader(Const.RPC_ID_HEADER, wait.id);
    if (fromId)
      request.setHeader(Const.RPC_FROM_ID_HEADER, fromId);
    await this.send(request.toPacket());
    return wait.promise.catch((err: Error) => {
      if (err instanceof TimeoutError)
        throw new RPCError(RPCErrorCode.ERR_RPC_TIMEOUT, `ERR_RPC_TIMEOUT, method=${request.method}, endpoint=${this.listenInfo_.endpoint}`);
      throw err;
    }) as Promise<IRawResPacket<ResponsePayload>>;
  }
  public async sendNotify(notify: Notify, fromId?: string): Promise<void> {
    if (fromId)
      notify.setHeader(Const.RPC_FROM_ID_HEADER, fromId);
    await this.send(notify.toPacket());
  }

  protected emitRPCResponse<ResponsePayload extends { error?: RPCErrorCode, message?: string }>(packet: IRawResPacket<ResponsePayload>) {
    if (!packet.headers[Const.RPC_ID_HEADER])
      return;

    if (packet.payload.error) {
      this.waiter_.emitError(packet.headers[Const.RPC_ID_HEADER], new RPCError(packet.payload.error, packet.payload.message));
    } else {
      this.waiter_.emit(packet.headers[Const.RPC_ID_HEADER], packet);
    }
  }

  get state() {
    return this.lifeCycle_.state;
  }

  get listenerId() {
    return this.listenerId_;
  }

  get targetId() {
    return this.targetId_;
  }

  protected lifeCycle_: LifeCycle<SenderState>;
  protected listenInfo_: IListenerInfo;
  private waiter_: Waiter<IRawResPacket>;
  private listenerId_: string;
  private targetId_: string;
}

export {Sender}
