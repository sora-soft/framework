import net = require('net');
import util = require('util');
import {IListenerInfo, IRawNetPacket} from '../../interface/rpc.js';
import {Connector} from '../rpc/Connector.js';
import {Utility} from '../../utility/Utility.js';
import {TCPUtility} from './TCPUtility.js';
import {RPCError} from '../rpc/RPCError.js';
import {RPCErrorCode} from '../../ErrorCode.js';
import {ConnectorState} from '../../Enum.js';
import {Retry} from '../../utility/Retry.js';
import {Runtime} from '../Runtime.js';
import {Logger} from '../logger/Logger.js';
import {RetryEvent} from '../../Event.js';
import {RPCSender} from '../rpc/RPCSender.js';
import {Context} from '../Context.js';
import {ExError} from '../../utility/ExError.js';
import {ProviderManager} from '../rpc/ProviderManager.js';
import {TypeGuard} from '@sora-soft/type-guard';
import {AbortError} from '../../index.js';

class TCPConnector extends Connector {
  static register(manager?: ProviderManager) {
    (manager || Runtime.pvdManager).registerSender('tcp', (listenerId: string, targetId: string, weight: number) => {
      return new RPCSender(listenerId, targetId, new TCPConnector(), weight);
    });
  }

  constructor(socket?: net.Socket) {
    super({
      ping: {
        enabled: true,
      },
    });
    this.cache_ = Buffer.alloc(0);
    this.currentPacketLength_ = 0;
    this.socket_ = null;
    if (socket) {
      this.socket_ = socket;
      this.bindSocketEvent(socket);
      this.lifeCycle_.setState(ConnectorState.READY);
      this.target_ = {
        protocol: 'tcp',
        endpoint: `${socket.remoteAddress || 'unkown'}:${socket.remotePort || 'unkown'}`,
        labels: {},
      };
      this.socket_.on('error', (err: ExError) => { this.onSocketError(socket)(err); });
      this.socket_.on('close', (err: ExError) => { this.onSocketError(socket)(err); });
    }
  }

  isAvailable() {
    return !!(this.socket_ && !this.socket_.destroyed);
  }

  protected async connect(listenInfo: IListenerInfo, context: Context) {
    if (this.socket_ && !this.socket_.destroyed)
      return;

    const retry = new Retry(async (ctx) => {
      return new Promise<boolean>((resolve, reject) => {
        Runtime.frameLogger.info('connector.tcp', {event: 'start-connect', endpoint: listenInfo.endpoint});
        ctx.abortObserver.subscribe(() => {
          reject(new AbortError());
        });

        const [ip, portStr] = listenInfo.endpoint.split(':');
        const port = Utility.parseInt(portStr);
        const socket = this.socket_ = new net.Socket();
        const handlerError = (err: Error) => {
          reject(err);
        };
        this.socket_.once('error', handlerError);
        this.bindSocketEvent(this.socket_);

        this.socket_.connect(port, ip, () => {
          if (this.socket_ === socket) {
            this.socket_.removeListener('error', handlerError);
            this.socket_.on('error', this.onSocketError(this.socket_));
            this.socket_.on('close', this.onSocketError(this.socket_));
          }
          Runtime.frameLogger.success('connector.tcp', {event: 'connect-success', endpoint: listenInfo.endpoint});
          resolve(true);
        });
      });
    }, {
      maxRetryTimes: 0,
      incrementInterval: true,
      maxRetryIntervalMS: 5000,
      minIntervalMS: 500,
    });

    retry.errorEmitter.on(RetryEvent.Error, (err, nextRetry) => {
      Runtime.frameLogger.error('connector.tcp', err, {event: 'connector-on-error', error: Logger.errorMessage(err), nextRetry});
    });

    await retry.doJob(context);
  }

  private bindSocketEvent(socket: net.Socket) {
    socket.on('data', (data: Buffer) => {
      if (this.socket_ !== socket)
        return;
      this.onSocketData(data).catch((err: ExError) => {
        Runtime.rpcLogger.error('connector.tcp', err, {event: 'on-data-error', error: Logger.errorMessage(err)});
      });
    });
  }

  private onSocketError(socket: net.Socket) {
    return (err: ExError) => {
      if (this.socket_ !== socket)
        return;

      if (this.socket_) {
        this.socket_.removeAllListeners();
      }

      this.socket_ = null;
      this.off().catch((offError: ExError) => {
        Runtime.rpcLogger.error('connector.tcp', offError, {event: 'connect-off-error', error: Logger.errorMessage(offError), reason: err.message});
      });
      return;
    };
  }

  protected async disconnect() {
    if (this.socket_) {
      this.socket_.removeAllListeners();
      this.socket_.destroy();
    }
    this.socket_ = null;
  }

  async send(request: IRawNetPacket) {
    return this.sendRaw(request);
  }

  async sendRaw(request: Object) {
    const data = await TCPUtility.encodeMessage(request);
    if (!this.isAvailable())
      throw new RPCError(RPCErrorCode.ERR_RPC_TUNNEL_NOT_AVAILABLE, `ERR_RPC_TUNNEL_NOT_AVAILABLE, endpoint=${this.target_?.endpoint || 'unknown'}`);
    if (!this.socket_)
      throw new RPCError(RPCErrorCode.ERR_RPC_TUNNEL_NOT_AVAILABLE, `ERR_RPC_TUNNEL_NOT_AVAILABLE, endpoint=${this.target_?.endpoint || 'unknown'}`);

    await util.promisify<Buffer, void>(this.socket_.write.bind(this.socket_) as (buf: Buffer) => void)(data).catch((err: Error) => {
      throw new RPCError(RPCErrorCode.ERR_RPC_SENDER_INNER, `ERR_RPC_SENDER_INNER, err=${err.message}`);
    });
  }

  private async onSocketData(data: Buffer) {
    this.cache_ = Buffer.concat([this.cache_, data], this.cache_.length + data.length);

    while (this.cache_.length >= this.currentPacketLength_ && this.cache_.length) {
      if (!this.currentPacketLength_) {
        this.currentPacketLength_ = this.cache_.readUInt32BE();
        this.cache_ = this.cache_.slice(4);
      }

      if (this.cache_.length < this.currentPacketLength_)
        break;

      const content = this.cache_.slice(0, this.currentPacketLength_);
      this.cache_ = this.cache_.slice(this.currentPacketLength_);
      this.currentPacketLength_ = 0;
      const packet: IRawNetPacket | null = await TCPUtility.decodeMessage<IRawNetPacket<unknown>>(content).catch((err: ExError) => {
        Runtime.frameLogger.error('connector.tcp', err, {event: 'connector-decode-message', error: Logger.errorMessage(err)});
        return null;
      });
      if (!packet) {
        return;
      }

      if (!TypeGuard.is<IRawNetPacket>(packet)) {
        const err = new RPCError(RPCErrorCode.ERR_RPC_BODY_PARSE_FAILED, 'ERR_RPC_BODY_PARSE_FAILED');
        Runtime.frameLogger.error('connector.websocket', err, {event: 'connector-body-invalid', packet});
      }

      await this.handleIncomeMessage(packet, this.session, this);
    }
  }

  get protocol() {
    return 'tcp';
  }

  private socket_: net.Socket | null;
  private cache_: Buffer;
  private currentPacketLength_: number;
}

export {TCPConnector};
