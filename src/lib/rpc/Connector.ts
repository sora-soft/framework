import {is} from 'typescript-is';
import {RPCHeader} from '../../Const';
import {OPCode, ConnectorCommand, ConnectorState, ErrorLevel} from '../../Enum';
import {FrameworkErrorCode, RPCErrorCode} from '../../ErrorCode';
import {IConnectorOptions, IListenerInfo, IRawNetPacket, IRawOperationPacket, IRawReqPacket, IRawResPacket} from '../../interface/rpc';
import {AbortError} from '../../utility/AbortError';
import {Executor} from '../../utility/Executor';
import {ExError} from '../../utility/ExError';
import {LifeCycle} from '../../utility/LifeCycle';
import {TimeoutError} from '../../utility/TimeoutError';
import {NodeTime, Utility} from '../../utility/Utility';
import {Waiter} from '../../utility/Waiter';
import {Context} from '../Context';
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
    this.lifeCycle_ = new LifeCycle(ConnectorState.INIT, false);
    this.resWaiter_ = new Waiter();
    this.pongWaiter_ = new Waiter();
    this.executor_ = new Executor();

    this.lifeCycle_.addAllHandler(async (context, state) => {
      switch(state) {
        case ConnectorState.READY:
          this.executor_.start();
          this.enablePingPong();
          break;
        default:
          this.disablePingPong();
          break;
      }
    });
  }

  abstract isAvailable(): boolean;

  protected abstract connect(target: IListenerInfo, context: Context): Promise<void>;
  public async start(target: IListenerInfo, context?: Context) {
    this.startContext_ = new Context(context);
    if (this.lifeCycle_.state > ConnectorState.INIT)
      return;

    this.target_ = target;
    await this.connect(target, this.startContext_).catch((err: ExError) => {
      this.onError(err);
    });
    await this.startContext_.await(this.lifeCycle_.setState(ConnectorState.READY));
    this.startContext_ = null;
  }

  protected abstract disconnect(): Promise<void>;
  public async off() {
    const invalidState = [ConnectorState.STOPPING, ConnectorState.STOPPED];
    if (invalidState.includes(this.state))
      return;

    this.startContext_?.abort();
    this.startContext_ = null;

    if (this.state < ConnectorState.STOPPING)
      await this.lifeCycle_.setState(ConnectorState.STOPPING);
    await this.resWaiter_.waitForAll(10000);
    await this.executor_.stop();
    await this.disconnect().catch((err: ExError) => {
      this.onError(err);
    });
    if (this.state < ConnectorState.STOPPED)
      await this.lifeCycle_.setState(ConnectorState.STOPPED);

    this.lifeCycle_.destory();
  }

  private onError(err: Error) {
    if (!(err instanceof AbortError))
      this.lifeCycle_.setState(ConnectorState.ERROR, err).catch(Utility.null);
    throw err;
  }

  abstract send<RequestPayload>(request: IRawNetPacket<RequestPayload>): Promise<void>;
  abstract sendRaw(request: Object): Promise<void>;

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

  public async sendCommand(command: ConnectorCommand, args?: unknown) {
    await this.send({
      opcode: OPCode.OPERATION,
      command,
      args,
    });
  }

  protected async sendPing(id: number) {
    await this.sendCommand(ConnectorCommand.PING, {id});
  }

  protected async sendPong(id: number) {
    await this.sendCommand(ConnectorCommand.PONG, {id});
  }

  protected emitRPCResponse<ResponsePayload>(packet: IRawResPacket<ResponsePayload>) {
    if (!packet.headers[RPCHeader.RPC_ID_HEADER])
      return;

    let rpcId = packet.headers[RPCHeader.RPC_ID_HEADER] as number | string | undefined;
    if (Utility.isUndefined(rpcId))
      throw new RPCError(RPCErrorCode.ERR_RPC_ID_NOT_FOUND, 'ERR_RPC_ID_NOT_FOUND');
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

  enableResponse(callback: ListenerCallback) {
    if (this.routeCallback_)
      throw new FrameworkError(FrameworkErrorCode.ERR_CONNECTOR_DUPLICATE_ENABLE_RESPONSE, 'ERR_CONNECTOR_DUPLICATE_ENABLE_RESPONSE');

    this.routeCallback_ = callback;
  }

  protected enablePingPong() {
    if (this.pingInterval_)
      return;

    if (!this.options_.ping.enabled)
      return;

    this.pingInterval_ = setInterval(async () => {
      if (!this.options_.ping.enabled)
        return;

      if (this.state !== ConnectorState.READY)
        return;

      const {id, promise} = this.pongWaiter_.wait(this.options_.ping.timeout || NodeTime.second(5));
      await this.sendPing(id).catch((err: ExError) => {
        this.pongWaiter_.emitError(id, err);
      });
      await promise.catch((err: ExError) => {
        if (err instanceof TimeoutError) {
          Runtime.frameLogger.warn('connector', {event: 'ping-timeout'});
        } else {
          Runtime.frameLogger.error('connector', err, {event: 'connector-ping-error', error: Logger.errorMessage(err)});
        }
        this.onPingError(err);
      });
    }, this.options_.ping.interval || NodeTime.second(10));
  }

  protected onPingError(err: ExError) {
    if (this.state !== ConnectorState.READY)
      return;

    this.lifeCycle_.setState(ConnectorState.ERROR, new ExError('ERR_CONNECTOR_PING', err.name, err.message, err.level)).catch(Utility.null);
  }

  protected disablePingPong() {
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

          const rpcId = data.headers[RPCHeader.RPC_ID_HEADER] as number | undefined;
          if (Utility.isUndefined(rpcId))
            throw new RPCError(RPCErrorCode.ERR_RPC_ID_NOT_FOUND, 'ERR_RPC_ID_NOT_FOUND');

          try {
            let response: IRawResPacket<unknown> | null = null;
            const createErrorResPacket = (err: ExError) => {
              return {
                opcode: OPCode.RESPONSE,
                headers: {
                  [RPCHeader.RPC_ID_HEADER]: rpcId,
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
            };

            if (!is<IRawReqPacket>(data)) {
              response = createErrorResPacket(new RPCResponseError(RPCErrorCode.ERR_RPC_BODY_PARSE_FAILED, ErrorLevel.EXPECTED, 'ERR_RPC_BODY_PARSE_FAILED'));
              await this.send(response );
              return;
            }

            response = await this.routeCallback_(data, this.session_, connector).catch((err: ExError) => {
              const exError = ExError.fromError(err);
              if (exError.name !== 'RPCResponseError') {
                Runtime.frameLogger.error('connector', err, {event: 'handle-error', error: Logger.errorMessage(err)});
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
          } catch (e) {
            const err = ExError.fromError(e as Error);
            Runtime.frameLogger.error('connector', err, {event: 'event-handle-data', error: Logger.errorMessage(err)});
          }
          break;
        case OPCode.NOTIFY:
          if (!this.routeCallback_) {
            Runtime.frameLogger.warn('connector', {event: 'connector-response-not-enabled', session: this.session});
            return;
          }
          if (!is<IRawReqPacket>(data)) {
            Runtime.frameLogger.warn('connector', {event: 'parse-body-failed', data});
            return;
          }
          await this.routeCallback_(data, session, this);
          break;
        case OPCode.RESPONSE:
          if (!is<IRawResPacket>(data)) {
            Runtime.frameLogger.warn('connector', {event: 'parse-body-failed', data});
            return;
          }
          this.emitRPCResponse(data);
          break;
        case OPCode.OPERATION:
          if (!is<IRawOperationPacket>(data)) {
            Runtime.frameLogger.warn('connector', {event: 'parse-body-failed', data});
            return;
          }
          this.handleCommand(data.command as ConnectorCommand, data.args).catch((err: ExError) => {
            Runtime.frameLogger.error('connector', err, {event: 'handle-command-error', error: Logger.errorMessage(err)});
          });
          break;
        default:
          const error = new RPCError(RPCErrorCode.ERR_RPC_NOT_SUPPORT_OPCODE, 'ERR_RPC_NOT_SUPPORT_OPCODE');
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          Runtime.frameLogger.error('connector', error, {event: 'opcode-not-support', opCode: (data as any).opcode});
          break;
      }
    });
  }

  protected async handleCommand(command: ConnectorCommand, args: unknown) {
    const logBlackList = [ConnectorCommand.PING, ConnectorCommand.PONG];
    if (!logBlackList.includes(command))
      Runtime.frameLogger.info('connector', {event: 'connector-command', command, args});
    switch(command) {
      case ConnectorCommand.ERROR:
        const error = args as ExError;
        this.lifeCycle_.setState(ConnectorState.ERROR, new ExError(error.code, error.name, error.message, error.level)).catch(Utility.null);
        break;
      case ConnectorCommand.OFF:
        this.off().catch((err: ExError) => {
          Runtime.frameLogger.error('connector', err, {event: 'cconnect-off-error', error: Logger.errorMessage(err)});
        });
        break;
      case ConnectorCommand.PING: {
        const data = args as {id: number};
        this.sendPong(data.id).catch((err: ExError) => {
          Runtime.frameLogger.error('connector', err, {event: 'send-pong-error', error: Logger.errorMessage(err)});
        });
        break;
      }
      case ConnectorCommand.PONG: {
        const data = args as {id: number};
        if (this.pongWaiter_)
          this.pongWaiter_.emit(data.id);
        break;
      }
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
  private startContext_: Context | null;
}

export {Connector};
