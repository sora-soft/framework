import {IRawNetPacket, IRawReqPacket, IRawResPacket} from '../../interface/rpc';

class TCPUtility {
  static encodeMessage(packet: IRawNetPacket | IRawReqPacket | IRawResPacket) {
    const data = Buffer.from(JSON.stringify(packet));
    const header = Buffer.alloc(4);
    header.writeInt32BE(data.length);
    return Buffer.concat([header, data]);
  }
}

export {TCPUtility}
