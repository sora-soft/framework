import net = require('net');
import util = require('util');
import {IListenerInfo, IRawNetPacket} from '../../interface/rpc';
import {Sender} from '../rpc/Sender';
import {Utility} from '../../utility/Utility';
import {TCPUtility} from './TCPUtility';
import {RPCError} from '../rpc/RPCError';
import {RPCErrorCode} from '../../ErrorCode';

class TCPSender extends Sender {
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
        const packet = JSON.parse(content.toString());

        this.emitRPCResponse(packet);
        packetLength = 0;
      }
    }
  }

  private socket_: net.Socket;
}

export {TCPSender}
