import net = require('net');
import util = require('util');
import {IListenerInfo, IRawNetPacket, IRawResPacket} from '../../interface/rpc';
import {Sender} from '../rpc/Sender';
import {Utility} from '../../utility/Utility';
import {TCPUtility} from './TCPUtility';
import {RPCError} from '../rpc/RPCError';
import {RPCErrorCode} from '../../ErrorCode';
import {Provider} from '../rpc/Provider';
import {OPCode, SenderState} from '../../Enum';
import {Retry} from '../../utility/Retry';
import {AsyncReject} from '../../interface/util';
import {Runtime} from '../Runtime';
import {Logger} from '../logger/Logger';

class TCPSender extends Sender {
  static register() {
    Provider.registerSender('tcp', (listenerId, targetId) => {
      return new TCPSender(listenerId, targetId);
    });
  }

  constructor(listenerId: string, targetId: string, socket?: net.Socket) {
    super(listenerId, targetId);
    if (socket) {
      this.socket_ = socket;
      this.canReconnect_ = false;
      this.bindSocketEvent(socket, (err: Error) => {
        Runtime.frameLogger.error('listener-sender', err, { event: 'listener-sender-on-error', error: Logger.errorMessage(err)});
      });
      this.lifeCycle_.setState(SenderState.READY);
      this.listenInfo_ = {
        id: listenerId,
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

  async connect(listenInfo: IListenerInfo, reconnect = false) {
    if (this.socket_ && !this.socket_.destroyed)
      return;

    const retry = new Retry(async () => {
      return new Promise<void>((resolve, reject) => {
        Runtime.frameLogger.info('sender', {event: reconnect ? 'tcp-sender-reconnect' : 'tcp-sender-connect', endpoint: listenInfo.endpoint});
        const [ip, portStr] = listenInfo.endpoint.split(':');
        const port = Utility.parseInt(portStr);
        this.socket_ = new net.Socket();
        this.bindSocketEvent(this.socket_, reject);

        this.socket_.connect(port, ip, () => {
          this.connected_ = true;
          resolve();
        });
      });
    }, 50);

    await retry.doJob();
  }

  bindSocketEvent(socket: net.Socket, reject: AsyncReject) {
    socket.on('data', this.onSocketData(socket).bind(this));
    socket.on('error', this.onRetry_('error', socket, reject).bind(this));
    socket.on('close', this.onRetry_('close', socket, reject).bind(this));
    socket.on('timeout', this.onRetry_('timeout', socket, reject).bind(this));
  }

  async disconnect() {
    // 由客户端主动断开tcp连接
    if (this.socket_)
      this.socket_.destroy();
    this.socket_ = null;
  }

  private async reconnect_() {
    this.connected_ = false;
    this.connect(this.listenInfo_, true).catch((err: Error) => {
      this.lifeCycle_.setState(SenderState.ERROR, err);
    });
  }

  private onRetry_(event: string, socket: net.Socket, reject: AsyncReject) {
    return (err: Error) => {
      if (this.socket_ !== socket)
        return;

      if (this.socket_) {
        this.socket_.removeAllListeners();
        if (!this.canReconnect_) {
          this.socket_.destroy();
          return;
        }
      }

      this.socket_ = null;
      if (this.lifeCycle_.state === SenderState.READY) {
        if (this.connected_) {
          this.reconnect_();
        } else {
          reject(err);
        }
      }
    }

  }

  async send(request: IRawNetPacket) {
    const data = await TCPUtility.encodeMessage(request);
    if (!this.isAvailable())
      throw new RPCError(RPCErrorCode.ERR_RPC_TUNNEL_NOT_AVAILABLE, `ERR_RPC_TUNNEL_NOT_AVAILABLE, endpoint=${this.listenInfo_.endpoint}`);
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
        const packet: IRawNetPacket = await TCPUtility.decodeMessage(content).catch(err => {
          Runtime.frameLogger.error('sender.tcp', err, {event: 'sender-decode-message', error: Logger.errorMessage(err)});
          return null;
        });

        if (!packet) {
          return;
        }

        switch (packet.opcode) {
          case OPCode.RESPONSE:
            this.emitRPCResponse(packet as IRawResPacket);
            break;
          case OPCode.NOTIFY:
            if (this.route_) {
              this.routeCallback_(packet, this.session_).catch(err => {
                Runtime.frameLogger.error('sender.tcp', err, { event: 'sender-notify-handler', error: Logger.errorMessage(err) });
              });
            }
          case OPCode.REQUEST:
            // 这里不应该接收到请求
            break;
        }
        packetLength = 0;
      }
    }
  }

  private socket_: net.Socket | null;
  private connected_ = false;
  private canReconnect_ = true;
}

export {TCPSender}
