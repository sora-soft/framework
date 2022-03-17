import {IRawNetPacket, IRawReqPacket, IRawResPacket} from '../../interface/rpc';
import zlib = require('zlib')
import util = require('util')
import {RPCError} from '../rpc/RPCError';
import {RPCErrorCode} from '../../ErrorCode';

class TCPUtility {
  static async encodeMessage(packet: IRawNetPacket | IRawReqPacket | IRawResPacket) {
    const data = Buffer.from(JSON.stringify(packet));
    const deflated = await util.promisify(zlib.deflate)(data);
    if (deflated.length >= Number.MAX_SAFE_INTEGER) {
      throw new RPCError(RPCErrorCode.ERR_RPC_PAYLOAD_TOO_LARGE, `ERR_RPC_PAYLOAD_TOO_LARGE`);
    }
    const header = Buffer.alloc(4);
    header.writeUInt32BE(deflated.length);
    return Buffer.concat([header, deflated]);
  }

  static async decodeMessage(buffer: Buffer) {
    const inflated = await util.promisify(zlib.inflate)(buffer);
    return JSON.parse(inflated.toString());
  }
}

export {TCPUtility}
