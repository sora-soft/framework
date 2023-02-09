import net = require('net');
import util = require('util');
import {IListenerInfo, IRawNetPacket} from '../../interface/rpc';
import {Connector} from '../rpc/Connector';
import {Utility} from '../../utility/Utility';
import {TCPUtility} from './TCPUtility';
import {RPCError} from '../rpc/RPCError';
import {RPCErrorCode} from '../../ErrorCode';
import {Provider} from '../rpc/Provider';
import {ConnectorState} from '../../Enum';
import {Retry} from '../../utility/Retry';
import {Runtime} from '../Runtime';
import {Logger} from '../logger/Logger';
import {RetryEvent} from '../../Event';
import {RPCSender} from '../rpc/RPCSender';
import {is} from 'typescript-is';

class TCPConnector extends Connector {
  static register() {
    Provider.registerSender('tcp', (listenerId: string, targetId: string) => {
      return new RPCSender(listenerId, targetId, new TCPConnector());
    });
  }

  constructor(socket?: net.Socket) {
    super({
      ping: {
        enabled: true,
      }
    });
    if (socket) {
      this.socket_ = socket;
      this.initiative_ = false;
      this.bindSocketEvent(socket);
      this.lifeCycle_.setState(ConnectorState.READY);
      this.target_ = {
        protocol: 'tcp',
        endpoint: `${socket.remoteAddress}:${socket.remotePort}`,
        labels: {},
      };
      this.connected_ = true;
    }
  }

  isAvailable() {
    return !!(this.socket_ && !this.socket_.destroyed && this.connected_);
  }

  protected async connect(listenInfo: IListenerInfo, reconnect = false) {
    if (this.socket_ && !this.socket_.destroyed)
      return;

    if (!this.initiative_) {
      this.off();
    }

    const retry = new Retry(async () => {
      return new Promise<void>((resolve, reject) => {
        Runtime.frameLogger.info('connector.tcp', {event: reconnect ? 'connector-reconnect' : 'connector-connect', endpoint: listenInfo.endpoint});
        const [ip, portStr] = listenInfo.endpoint.split(':');
        const port = Utility.parseInt(portStr);
        this.socket_ = new net.Socket();
        const handlerError = (err: Error) => {
          reject(err)
        }
        this.socket_.once('error', handlerError);
        this.bindSocketEvent(this.socket_);

        this.socket_.connect(port, ip, () => {
          this.connected_ = true;
          if (this.socket_) {
            this.socket_.removeListener('error', handlerError);
            this.socket_.on('error', this.onSocketError(this.socket_));
            this.socket_.on('close', this.onSocketError(this.socket_));
          }
          Runtime.frameLogger.success('connector.tcp', {event: 'connect-success', endpoint: listenInfo.endpoint});
          resolve();
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

    this.reconnectJob_ = retry;
    await retry.doJob();
    this.reconnectJob_ = null;
  }

  private bindSocketEvent(socket: net.Socket) {
    socket.on('data', this.onSocketData(socket).bind(this));
  }

  private onSocketError(socket: net.Socket) {
    return (err: Error) => {
      if (this.socket_ !== socket)
        return;

      if (this.socket_) {
        this.socket_.removeAllListeners();

        if (!this.initiative_) {
          this.destory();
          return;
        }
      }

      this.socket_ = null;
      if (this.lifeCycle_.state === ConnectorState.READY) {
        this.lifeCycle_.setState(ConnectorState.RECONNECTING, err);
        this.reconnect_();
      }
      return;
    }
  }

  protected async disconnect() {
    if (this.reconnectJob_) {
      this.reconnectJob_.cancel();
    }
    if (this.socket_) {
      this.socket_.removeAllListeners();
      this.socket_.destroy();
    }
    this.socket_ = null;
  }

  private async reconnect_() {
    this.connected_ = false;
    await this.connect(this.target_, true).then(() => {
      this.lifeCycle_.setState(ConnectorState.READY);
    }).catch((err: Error) => {
      this.lifeCycle_.setState(ConnectorState.ERROR, err);
    });
  }

  protected async send(request: IRawNetPacket) {
    return this.sendRaw(request);
  }

  protected async sendRaw(request: Object) {
    const data = await TCPUtility.encodeMessage(request);
    if (!this.isAvailable())
      throw new RPCError(RPCErrorCode.ERR_RPC_TUNNEL_NOT_AVAILABLE, `ERR_RPC_TUNNEL_NOT_AVAILABLE, endpoint=${this.target_.endpoint}`);
    await util.promisify<Buffer, void>(this.socket_!.write.bind(this.socket_))(data).catch((err: Error) => {
      throw new RPCError(RPCErrorCode.ERR_RPC_SENDER_INNER, `ERR_RPC_SENDER_INNER, err=${err.message}`);
    });
  }

  private onSocketData(socket: net.Socket) {
    let packetLength = 0;
    let cache = Buffer.alloc(0);

    return async (data: Buffer) => {
      cache = Buffer.concat([cache, data]);

      while (cache.length >= packetLength && cache.length) {
        if (!packetLength) {
          packetLength = cache.readUInt32BE();
          cache = cache.slice(4);
        }

        if (cache.length < packetLength)
          break;

        const content = cache.slice(0, packetLength);
        cache = cache.slice(packetLength);
        packetLength = 0;
        const packet: IRawNetPacket = await TCPUtility.decodeMessage(content).catch(err => {
          Runtime.frameLogger.error('connector.tcp', err, {event: 'connector-decode-message', error: Logger.errorMessage(err)});
          return null;
        });

        if (!packet) {
          return;
        }

        if (!is<IRawNetPacket>(packet)) {
          const err = new RPCError(RPCErrorCode.ERR_RPC_BODY_PARSE_FAILED, `ERR_RPC_BODY_PARSE_FAILED`);
          Runtime.frameLogger.error('connector.websocket', err, {event: 'connector-body-invalid', packet});
        }

        await this.handleIncomeMessage(packet, this.session, this);
      }
    }
  }

  private socket_: net.Socket | null;
  private connected_ = false;
  private initiative_ = true;
  private reconnectJob_: Retry<void> | null;
}

export {TCPConnector}
