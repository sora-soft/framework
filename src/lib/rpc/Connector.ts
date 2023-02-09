import {is} from 'typescript-is';
import {RPCHeader} from '../../Const';
import {OPCode, ConnectorCommand, ConnectorState, ErrorLevel} from '../../Enum';
import {FrameworkErrorCode, RPCErrorCode} from '../../ErrorCode';
import {IConnectorOptions, IConnectorPingOptions as IConnectorPingOptions, IListenerInfo, IRawNetPacket, IRawOperationPacket, IRawReqPacket, IRawResPacket} from '../../interface/rpc';
import {Executor} from '../../utility/Executor';
import {ExError} from '../../utility/ExError';
import {LifeCycle} from '../../utility/LifeCycle'
import {TimeoutError} from '../../utility/TimeoutError';
import {NodeTime} from '../../utility/Utility';
import {Waiter} from '../../utility/Waiter';
import {FrameworkError} from '../FrameworkError';
import {Logger} from '../logger/Logger';
import {Runtime} from '../Runtime';
import {ListenerCallback} from './Listener';
import {Notify} from './Notify';
import {Request} from './Request';
import {RPCError, RPCResponseError} from './RPCError';

abstract class Connector {
  constructor(options: IConnectorOptions) {
    this.options_ = options;
    this.lifeCycle_ = new LifeCycle(ConnectorState.INIT);
    this.resWaiter_ = new Waiter();
    this.pongWaiter_ = new Waiter();
    this.executor_ = new Executor();

    this.lifeCycle_.addAllHandler(async (state) => {
      switch(state) {
        case ConnectorState.READY:
          this.executor_.start();
          this.enablePingPong();
          break;
        default:
          this.disablePingPong();
          break;
      }
    })
  }

  abstract isAvailable(): boolean;

  public async destory() {
    await this.off();
    this.lifeCycle_.destory();
  }

  protected abstract connect(target: IListenerInfo): Promise<void>;
  public async start(target: IListenerInfo) {
    if (this.lifeCycle_.state > ConnectorState.INIT)
      return;

    this.target_ = target;
    await this.connect(target).catch(this.onError.bind(this));
    this.lifeCycle_.setState(ConnectorState.READY);
  }

  protected abstract disconnect(): Promise<void>;
  public async off() {
    if (this.lifeCycle_.state >= ConnectorState.STOPPING)
      return;

    this.lifeCycle_.setState(ConnectorState.STOPPING);
    await this.resWaiter_.waitForAll(10000);
    await this.executor_.stop();
    await this.disconnect().catch(this.onError.bind(this));
    this.lifeCycle_.setState(ConnectorState.STOPPED);
  }

  private onError(err: Error) {
    this.lifeCycle_.setState(ConnectorState.ERROR, err);
    throw err;
  }

  public async restart() {
    await this.off();
    this.lifeCycle_.setState(ConnectorState.INIT);
    await this.start(this.target_);
  }

  protected abstract send<RequestPayload>(request: IRawNetPacket<RequestPayload>): Promise<void>;
  protected abstract sendRaw(request: Object): Promise<void>;

  public async sendRpc<ResponsePayload>(request: Request, fromId?: string | null, timeout = 10 * 1000): Promise<IRawResPacket<ResponsePayload>> {
    const wait = this.resWaiter_.wait(timeout);
    request.setHeader(RPCHeader.RPC_ID_HEADER, wait.id);
    if (fromId)
      request.setHeader(RPCHeader.RPC_FROM_ID_HEADER, fromId);
    await this.send(request.toPacket());
    return wait.promise.catch((err: Error) => {
      if (err instanceof TimeoutError)
        throw new RPCError(RPCErrorCode.ERR_RPC_TIMEOUT, `ERR_RPC_TIMEOUT, method=${request.method}, endpoint=${this.target_.endpoint}`);
      throw err;
    }) as Promise<IRawResPacket<ResponsePayload>>;
  }

  public async sendNotify(notify: Notify, fromId?: string | null): Promise<void> {
    if (fromId)
      notify.setHeader(RPCHeader.RPC_FROM_ID_HEADER, fromId);
    await this.send(notify.toPacket());
  }

  public async sendCommand(command: ConnectorCommand, args?: any) {
    await this.send({
      opcode: OPCode.OPERATION,
      command,
      args,
    });
  }

  protected async sendPing(id: number) {
    await this.sendCommand(ConnectorCommand.ping, {id});
  }

  protected async sendPong(id) {
    await this.sendCommand(ConnectorCommand.pong, {id});
  }

  protected emitRPCResponse<ResponsePayload>(packet: IRawResPacket<ResponsePayload>) {
    if (!packet.headers[RPCHeader.RPC_ID_HEADER])
      return;

    let rpcId = packet.headers[RPCHeader.RPC_ID_HEADER];
    if (is<string>(rpcId)) {
      rpcId = parseInt(rpcId, 10);
    }

    if (packet.payload.error) {
      const error = packet.payload.error;
      this.resWaiter_.emitError(rpcId, new RPCResponseError(error.code, error.level, error.message));
    } else {
      this.resWaiter_.emit(rpcId, packet);
    }
  }

  async enableResponse(callback: ListenerCallback) {
    if (this.routeCallback_)
      throw new FrameworkError(FrameworkErrorCode.ERR_CONNECTOR_DUPLICATE_ENABLE_RESPONSE, `ERR_CONNECTOR_DUPLICATE_ENABLE_RESPONSE`);

    this.routeCallback_ = callback;
  }

  protected async enablePingPong() {
    if (this.pingInterval_)
      return;

    if (!this.options_.ping.enabled)
      return;

    this.pingInterval_ = setInterval(async () => {
      if (!this.options_.ping.enabled)
        return;

      const {id, promise} = this.pongWaiter_.wait(this.options_.ping.timeout || NodeTime.second(5));
      await this.sendPing(id).catch(err => {
        this.pongWaiter_.emitError(id, err);
      });
      await promise.catch(err => {
        if (err instanceof TimeoutError) {
          Runtime.frameLogger.warn('connector', {event: 'ping-timeout'});
        } else {
          Runtime.frameLogger.error('connector', err, {event: 'connector-ping-error', error: Logger.errorMessage(err)});
        }
        this.restart();
      });
    }, this.options_.ping.interval || NodeTime.second(10));
  }

  protected async disablePingPong() {
    if (this.pingInterval_) {
      clearInterval(this.pingInterval_);
      this.pongWaiter_.clear();
      this.pingInterval_ = null;
    }
  }

  protected async handleIncomeMessage(data: IRawNetPacket, session: string, connector: Connector) {
    return this.executor_.doJob(async () => {
      switch (data.opcode) {
        case OPCode.REQUEST:
          if (!this.routeCallback_) {
            Runtime.frameLogger.warn('connector', {event: 'connector-response-not-enabled', session: this.session});
            return;
          }
          try {
            let response: IRawResPacket<unknown> | null = null;
            const createErrorResPacket = (err: ExError) => {
              return {
                opcode: OPCode.RESPONSE,
                headers: {
                  [RPCHeader.RPC_ID_HEADER]: data.headers[RPCHeader.RPC_ID_HEADER]
                },
                payload: {
                  error: {
                    code: err.code || RPCErrorCode.ERR_RPC_UNKNOWN,
                    level: err.level || ErrorLevel.UNEXPECTED,
                    name: err.name,
                    message: err.message,
                  },
                  result: null,
                }
              } as IRawResPacket<null>;
            }

            if (!is<IRawReqPacket>(data)) {
              response = createErrorResPacket(new RPCResponseError(RPCErrorCode.ERR_RPC_BODY_PARSE_FAILED, ErrorLevel.EXPECTED, `ERR_RPC_BODY_PARSE_FAILED`));
              await this.send(response as IRawResPacket);
              return;
            }

            response = await this.routeCallback_(data, this.session_, connector).catch(err => {
              const exError = ExError.fromError(err);
              if (exError.name !== 'RPCResponseError') {
                Runtime.frameLogger.error('connector', err, { event: 'handle-error', error: Logger.errorMessage(err) });
              }
              return createErrorResPacket(exError);
            });

            if (response === null)
              return;

            if (response) {
              await this.send(response);
            } else {
              await this.send(createErrorResPacket(new RPCError(RPCErrorCode.ERR_RPC_EMPTY_RESPONSE, 'ERR_RPC_EMPTY_RESPONSE')));
            }
          } catch (err) {
            Runtime.frameLogger.error('connector', err, { event: 'event-handle-data', error: Logger.errorMessage(err)});
          }
          break;
        case OPCode.NOTIFY:
          if (!this.routeCallback_) {
            Runtime.frameLogger.warn('connector', {event: 'connector-response-not-enabled', session: this.session});
            return;
          }
          if (!is<IRawReqPacket>(data)) {
            Runtime.frameLogger.warn('connector', { event: 'parse-body-failed', data });
            return;
          }
          await this.routeCallback_(data, session, this);
          break;
        case OPCode.RESPONSE:
          if (!is<IRawResPacket>(data)) {
            Runtime.frameLogger.warn('connector', { event: 'parse-body-failed', data });
            return;
          }
          this.emitRPCResponse(data);
          break;
        case OPCode.OPERATION:
          if (!is<IRawOperationPacket>(data)) {
            Runtime.frameLogger.warn('connector', { event: 'parse-body-failed', data });
            return;
          }
          this.handleCommand(data.command as ConnectorCommand, data.args);
          break;
        default:
          const error = new RPCError(RPCErrorCode.ERR_RPC_NOT_SUPPORT_OPCODE, `ERR_RPC_NOT_SUPPORT_OPCODE`)
          Runtime.frameLogger.error('connector.tcp', error, {event: 'opcode-not-support', opCode: (data as any).opcode});
          break;
      }
    });
  }

  protected async handleCommand(command: ConnectorCommand, args: any) {
    const logBlackList = [ConnectorCommand.ping, ConnectorCommand.pong];
    if (!logBlackList.includes(command))
      Runtime.frameLogger.info('connector', {event: 'connector-command', command, args});
    switch(command) {
      case ConnectorCommand.error:
        this.lifeCycle_.setState(ConnectorState.ERROR, new ExError(args.code, args.name, args.message, args.level));
        break;
      case ConnectorCommand.off:
        this.off();
        break;
      case ConnectorCommand.restart:
        this.restart();
        break;
      case ConnectorCommand.ping:
        this.sendPong(args.id);
        break;
      case ConnectorCommand.pong:
        if (this.pongWaiter_)
          this.pongWaiter_.emit(args.id);
        break;
      default:
        break;
    }
  }

  get state() {
    return this.lifeCycle_.state;
  }

  get stateEmitter() {
    return this.lifeCycle_.emitter;
  }

  set session(value: string) {
    this.session_ = value;
  }

  get session() {
    return this.session_;
  }

  protected lifeCycle_: LifeCycle<ConnectorState>;
  protected target_: IListenerInfo;
  private routeCallback_: ListenerCallback | undefined;
  private executor_: Executor;
  protected session_: string;
  private resWaiter_: Waiter<IRawResPacket>;
  private pongWaiter_: Waiter<void>;
  private pingInterval_: NodeJS.Timer | null;
  private options_: IConnectorOptions;
}

export {Connector}
