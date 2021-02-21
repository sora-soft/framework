import net = require('net');
import util = require('util');
import {IListenerInfo, IRawNetPacket} from '../../interface/rpc';
import {Sender} from '../rpc/Sender';
import {Utility} from '../../utility/Utility';
import {TCPUtility} from './TCPUtility';
import {RPCError} from '../rpc/RPCError';
import {RPCErrorCode} from '../../ErrorCode';
import {Provider} from '../rpc/Provider';
import {OPCode} from '../../Enum';

class TCPSender extends Sender {
  static register() {
    Provider.registerSender('tcp', (targetId) => {
      return new TCPSender(targetId);
    });
  }

  async connect(listenInfo: IListenerInfo) {
    if (this.socket_ && !this.socket_.destroyed)
      return;

    const [ip, portStr] = listenInfo.endpoint.split(':');
    const port = Utility.parseInt(portStr);
    this.socket_ = new net.Socket();
    this.socket_.on('data', this.onSocketData(this.socket_).bind(this));
    await util.promisify<number, string, void>(this.socket_.connect.bind(this.socket_))(port, ip);

  }

  async disconnect() {
    this.socket_.destroy();
  }

  async send(request: IRawNetPacket) {
    const data = TCPUtility.encodeMessage(request);
    if (this.socket_.destroyed)
      throw new RPCError(RPCErrorCode.ERR_RPC_TUNNEL_NOT_AVAILABLE, `ERR_RPC_TUNNEL_NOT_AVAILABLE, endpoint=${this.listenInfo_.endpoint}`);
    await util.promisify<Buffer, void>(this.socket_.write.bind(this.socket_))(data);
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
}

export {TCPSender}
