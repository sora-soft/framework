import net = require('net');
import util = require('util');
import {IListenerInfo, IRawNetPacket} from '../../interface/rpc';
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

class TCPSender extends Sender {
  static register() {
    Provider.registerSender('tcp', (listenerId, targetId) => {
      return new TCPSender(listenerId, targetId);
    });
  }

  isAvailable() {
    return this.socket_ && !this.socket_.destroyed && this.connected_;
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
        this.socket_.on('data', this.onSocketData(this.socket_).bind(this));
        this.socket_.on('error', this.onRetry_('error', this.socket_, reject).bind(this));
        this.socket_.on('close', this.onRetry_('close', this.socket_, reject).bind(this));
        this.socket_.on('timeout', this.onRetry_('timeout', this.socket_, reject).bind(this));

        this.socket_.connect(port, ip, () => {
          this.connected_ = true;
          resolve();
        });
      });
    }, 50);

    await retry.doJob();
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

      if (this.socket_)
        this.socket_.removeAllListeners();

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
    const data = TCPUtility.encodeMessage(request);
    if (!this.isAvailable())
      throw new RPCError(RPCErrorCode.ERR_RPC_TUNNEL_NOT_AVAILABLE, `ERR_RPC_TUNNEL_NOT_AVAILABLE, endpoint=${this.listenInfo_.endpoint}`);
    await util.promisify<Buffer, void>(this.socket_.write.bind(this.socket_))(data).catch((err: Error) => {
      throw new RPCError(RPCErrorCode.ERR_RPC_SENDER_INNER, `ERR_RPC_SENDER_INNER, err=${err.message}`);
    });
  }

  private onSocketData(socket: net.Socket) {
    let packetLength = 0;
    let cache = Buffer.alloc(0);

    return (data: Buffer) => {
      cache = Buffer.concat([cache, data]);

      while (cache.length >= packetLength && cache.length) {
        if (!packetLength) {
          packetLength = cache.readInt32BE();
          cache = cache.slice(4);
        }

        if (cache.length < packetLength)
          break;

        const content = cache.slice(0, packetLength);
        cache = cache.slice(packetLength);
        const packet: IRawNetPacket = JSON.parse(content.toString());

        switch (packet.opcode) {
          case OPCode.RESPONSE:
            this.emitRPCResponse(packet);
            break;
          case OPCode.NOTIFY:
          case OPCode.REQUEST:
            // 这里不应该接收到请求
            break;
        }
        packetLength = 0;
      }
    }
  }

  private socket_: net.Socket;
  private connected_ = false;
}

export {TCPSender}
