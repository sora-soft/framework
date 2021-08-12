import {ErrorLevel, ListenerState, OPCode} from '../../Enum';
import {LifeCycle} from '../../utility/LifeCycle';
import {v4 as uuid} from 'uuid';
import {IListenerInfo, IRawNetPacket, IRawReqPacket, IRawResPacket} from '../../interface/rpc';
import {Executor} from '../../utility/Executor';
import {IEventEmitter} from '../../interface/event';
import {ListenerEvent} from '../../Event';
import {ILabels} from '../../interface/config';
import {EventEmitter} from 'events';
import {is} from 'typescript-is';
import {Runtime} from '../Runtime';
import {RPCErrorCode} from '../../ErrorCode';
import {ExError} from '../../utility/ExError';
import {RPCResponseError} from './RPCError';
import {RPCHeader} from '../../Const';

export interface IListenerEvent {
  [ListenerEvent.NewConnect]: (session: string, ...args: any[]) => void;
}

export type ListenerCallback = (data: IRawNetPacket, session: string) => Promise<IRawResPacket | null>;

abstract class Listener {
  constructor(callback: ListenerCallback, executor: Executor, labels: ILabels = {}) {
    this.lifeCycle_ = new LifeCycle(ListenerState.INIT);
    this.callback_ = callback;
    this.executor_ = executor;
    this.id_ = uuid();
    this.labels_ = labels;
    this.connectionEmitter_ = new EventEmitter();
  }

  protected abstract listen(): Promise<IListenerInfo>;
  public async startListen() {
    await this.lifeCycle_.setState(ListenerState.PENDING);
    this.info_ = await this.listen().catch(this.onError.bind(this)) as IListenerInfo;
    await this.lifeCycle_.setState(ListenerState.READY);
  }

  protected abstract shutdown(): Promise<void>;
  public async stopListen() {
    await this.lifeCycle_.setState(ListenerState.STOPPING);
    await this.shutdown();
    await this.lifeCycle_.setState(ListenerState.STOPPED);
  }

  // 只有通过 handleMessage 才能拿到 callback，保证所有处理都是在 executor 内进行的
  protected async handleMessage(handler: (callback: ListenerCallback) => Promise<void>) {
    return this.executor_.doJob(async () => {
      await handler(async (data: IRawNetPacket, session: string) => {
        if (!is<IRawNetPacket>(data)) {
          Runtime.frameLogger.warn('listener', { event: 'parse-body-failed', data });
          return null;
        }

        switch (data.opcode) {
          case OPCode.REQUEST: {
            const responseError = (err: ExError) => {
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
              } as IRawResPacket;
            }

            if (!is<IRawReqPacket>(data)) {
              return responseError(new RPCResponseError(RPCErrorCode.ERR_RPC_BODY_PARSE_FAILED, ErrorLevel.EXPECTED, `ERR_RPC_BODY_PARSE_FAILED`));
            }

            return this.callback_(data, session).catch(err => {
              const exError = ExError.fromError(err);
              return responseError(exError);
            });
          }
          case OPCode.NOTIFY:
            if (!is<IRawReqPacket>(data)) {
              Runtime.frameLogger.warn('listener', { event: 'parse-body-failed', data });
              return null;
            }
            await this.callback_(data, session);
            return null
          case OPCode.RESPONSE:
            return null;
        }
      });
    });
  }

  abstract get metaData(): IListenerInfo;

  private async onError(err: Error) {
    await this.lifeCycle_.setState(ListenerState.ERROR, err);
    throw err;
  }

  get info() {
    return this.info_;
  }

  get stateEventEmitter() {
    return this.lifeCycle_.emitter;
  }

  get state() {
    return this.lifeCycle_.state;
  }

  get id() {
    return this.id_;
  }

  get labels() {
    const protocol = this.info_ ? this.info_.protocol : null;
    if (protocol)
      return {
        protocol,
        ...this.labels_
      };
    else
      return this.labels_;
  }

  get connectionEmitter() {
    return this.connectionEmitter_;
  }

  abstract get version (): string;

  protected connectionEmitter_: IEventEmitter<IListenerEvent>;
  protected lifeCycle_: LifeCycle<ListenerState>;
  private callback_: ListenerCallback;
  private info_: IListenerInfo;
  private id_: string;
  private executor_: Executor;
  private labels_: ILabels;
}

export {Listener}
