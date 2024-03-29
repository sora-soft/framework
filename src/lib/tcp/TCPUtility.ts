import {IRawNetPacket, IRawReqPacket, IRawResPacket} from '../../interface/rpc.js';
import zlib = require('zlib')
import util = require('util')
import {RPCError} from '../rpc/RPCError.js';
import {RPCErrorCode} from '../../ErrorCode.js';

class TCPUtility {
  static async encodeMessage(packet: IRawNetPacket | IRawReqPacket | IRawResPacket | Object) {
    const data = Buffer.from(JSON.stringify(packet));
    const deflated = await util.promisify(zlib.deflate)(data);
    if (deflated.length >= 0xFFFFFFFF) {
      throw new RPCError(RPCErrorCode.ERR_RPC_PAYLOAD_TOO_LARGE, 'ERR_RPC_PAYLOAD_TOO_LARGE');
    }
    const header = Buffer.alloc(4);
    header.writeUInt32BE(deflated.length);
    return Buffer.concat([header, deflated]);
  }

  static async decodeMessage<T>(buffer: Buffer) {
    const inflated = await util.promisify(zlib.inflate)(buffer);
    return JSON.parse(inflated.toString()) as T;
  }
}

export {TCPUtility};
