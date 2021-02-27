import {OPCode} from '../../Enum';
import {IRawNetPacket, IRawReqPacket} from '../../interface/rpc';
import {RawPacket} from './RawPacket';

class Request<T = unknown> extends RawPacket<T> {
  constructor(packet: IRawNetPacket<T> | IRawReqPacket<T>) {
    super(OPCode.REQUEST);
    this.method = packet.method;
    this.payload = packet.payload;
    this.path = packet.path;
    this.loadHeaders(packet.headers);
  }
}

export {Request}
