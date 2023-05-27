import {TypeGuard} from '@sora-soft/type-guard';
import {RPCHeader} from '../../Const.js';
import {OPCode, ConnectorCommand, ConnectorState, ErrorLevel} from '../../Enum.js';
import {FrameworkErrorCode, RPCErrorCode} from '../../ErrorCode.js';
import {IConnectorOptions, IListenerInfo, IRawNetPacket, IRawOperationPacket, IRawReqPacket, IRawResPacket} from '../../interface/rpc.js';
import {AbortError} from '../../utility/AbortError.js';
import {Executor} from '../../utility/Executor.js';
import {ExError} from '../../utility/ExError.js';
import {LifeCycle} from '../../utility/LifeCycle.js';
import {TimeoutError} from '../../utility/TimeoutError.js';
import {NodeTime, Utility} from '../../utility/Utility.js';
import {Waiter} from '../../utility/Waiter.js';
import {Context} from '../Context.js';
import {FrameworkError} from '../FrameworkError.js';
import {Logger} from '../logger/Logger.js';
import {Runtime} from '../Runtime.js';
import {ListenerCallback} from './Listener.js';
import {Notify} from './Notify.js';
import {Request} from './Request.js';
import {RPCError, RPCResponseError} from './RPCError.js';
import {SubscriptionManager} from '../../utility/SubscriptionManager.js';

abstract class Connector {
  constructor(options: IConnectorOptions) {
    this.options_ = options;
    this.lifeCycle_ = new LifeCycle(ConnectorState.INIT, false);
    this.resWaiter_ = new Waiter();
    this.pongWaiter_ = new Waiter();
    this.executor_ = new Executor();
    this.pingInterval_ = null;
    this.startContext_ = null;
    this.executor_.start();
    this.subManager_ = new SubscriptionManager();

    this.subManager_.register(this.lifeCycle_.stateSubject.subscribe((state) => {
      switch(state) {
        case ConnectorState.READY:
          this.enablePingPong();
          break;
        case ConnectorState.STOPPING:
          this.disablePingPong();
        case ConnectorState.STOPPED:
          this.executor_.stop().catch(Utility.null);
          break;
        case ConnectorState.ERROR:
          this.disablePingPong();
          this.executor_.stop().catch(Utility.null);
          break;
      }
    }));
  }

  abstract isAvailable(): boolean;
  abstract get protocol(): string;

  protected abstract connect(target: IListenerInfo, context: Context): Promise<void>;
  public async start(target: IListenerInfo, context?: Context) {
    if (this.lifeCycle_.state > ConnectorState.INIT)
      return;
    this.startContext_ = new Context(context);

    this.target_ = target;
    this.lifeCycle_.setState(ConnectorState.CONNECTING);
    await this.connect(target, this.startContext_).catch((err: ExError) => {
      this.onError(err);
    });
    this.lifeCycle_.setState(ConnectorState.READY);
    this.startContext_.complete();
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
      this.lifeCycle_.setState(ConnectorState.STOPPING);
    await this.resWaiter_.waitForAll(10000);
    await this.executor_.stop();
    await this.disconnect().catch((err: ExError) => {
      this.onError(err);
    });
    if (this.state < ConnectorState.STOPPED)
      this.lifeCycle_.setState(ConnectorState.STOPPED);

    this.lifeCycle_.destory();
    this.subManager_.destory();
  }

  private onError(err: Error) {
    if (!(err instanceof AbortError)) {
      this.lifeCycle_.setState(ConnectorState.ERROR);
      Runtime.frameLogger.error('connector', err, {event: 'connector-error', error: Logger.errorMessage(err)});
    }
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
        throw new RPCError(RPCErrorCode.ERR_RPC_TIMEOUT, `ERR_RPC_TIMEOUT, method=${request.method}, endpoint=${this.target_?.endpoint || 'unknown'}`);
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
    if (TypeGuard.is<string>(rpcId)) {
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
        this.onPingError(err);
      });
    }, this.options_.ping.interval || NodeTime.second(10));
  }

  protected onPingError(err: ExError) {
    if (this.state !== ConnectorState.READY)
      return;
    const error = new ExError('ERR_CONNECTOR_PING', 'ConnectorError', 'ERR_CONNECTOR_PING', err, ErrorLevel.UNEXPECTED);
    this.onError(error);
  }

  protected disablePingPong() {
    if (this.pingInterval_) {
      clearInterval(this.pingInterval_);
      this.pongWaiter_.clear();
      this.pingInterval_ = null;
    }
  }

  protected async handleIncomeMessage(data: IRawNetPacket, session: string | undefined, connector: Connector) {
    return this.executor_.doJob(async () => {
      switch (data.opcode) {
        case OPCode.REQUEST:
          if (!this.routeCallback_) {
            Runtime.frameLogger.warn('connector', {event: 'connector-response-not-enabled', session: this.session});
            return;
          }

          const rpcId = data.headers[RPCHeader.RPC_ID_HEADER] as number | undefined;
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
                },
              } as IRawResPacket<null>;
            };

            if (!TypeGuard.is<IRawReqPacket>(data)) {
              response = createErrorResPacket(new RPCResponseError(RPCErrorCode.ERR_RPC_BODY_PARSE_FAILED, ErrorLevel.EXPECTED, 'ERR_RPC_BODY_PARSE_FAILED'));
              await this.send(response );
              return;
            }

            response = await this.routeCallback_(data, this.session, connector).catch((err: ExError) => {
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
          if (!TypeGuard.is<IRawReqPacket>(data)) {
            Runtime.frameLogger.warn('connector', {event: 'parse-body-failed', data});
            return;
          }
          await this.routeCallback_(data, session, this);
          break;
        case OPCode.RESPONSE:
          if (!TypeGuard.is<IRawResPacket>(data)) {
            Runtime.frameLogger.warn('connector', {event: 'parse-body-failed', data});
            return;
          }
          this.emitRPCResponse(data);
          break;
        case OPCode.OPERATION:
          if (!TypeGuard.is<IRawOperationPacket>(data)) {
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
        this.onError(error);
        break;
      case ConnectorCommand.OFF:
        this.off().catch((err: ExError) => {
          Runtime.frameLogger.error('connector', err, {event: 'cconnect-off-error', error: Logger.errorMessage(err)});
        });
        break;
      case ConnectorCommand.PING: {
        const data = args as {id: number};
        this.sendPong(data.id).catch((err: ExError) => {
          Runtime.frameLogger.error('connector', err, {event: 'send-pong-error', error: Logger.errorMessage(err), target: this.target_});
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

  get stateSubject() {
    return this.lifeCycle_.stateSubject;
  }

  get session() {
    return this.session_;
  }

  set session(value: string | undefined) {
    this.session_ = value;
  }

  protected lifeCycle_: LifeCycle<ConnectorState>;
  protected target_?: IListenerInfo;
  private routeCallback_?: ListenerCallback;
  private executor_: Executor;
  protected session_: string | undefined;
  private resWaiter_: Waiter<IRawResPacket>;
  private pongWaiter_: Waiter<void>;
  private pingInterval_: NodeJS.Timer | null;
  private options_: IConnectorOptions;
  private startContext_: Context | null;
  private subManager_: SubscriptionManager;
}

export {Connector};
