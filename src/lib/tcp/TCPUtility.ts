import {IRawNetPacket, IRawReqPacket, IRawResPacket} from '../../interface/rpc';
import zlib = require('zlib')
import util = require('util')

class TCPUtility {
  static async  encodeMessage(packet: IRawNetPacket | IRawReqPacket | IRawResPacket) {
    const data = Buffer.from(JSON.stringify(packet));
    const deflated = await util.promisify(zlib.deflate)(data);
    const header = Buffer.alloc(4);
    header.writeInt32BE(deflated.length);
    return Buffer.concat([header, deflated]);
  }

  static async decodeMessage(buffer: Buffer) {
    const inflated = await util.promisify(zlib.inflate)(buffer);
    return JSON.parse(inflated.toString());
  }
}

export {TCPUtility}
