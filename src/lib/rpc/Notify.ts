import {OPCode} from '../../Enum';
import {IRawNetPacket, IRawReqPacket} from '../../interface/rpc';
import {RawPacket} from './RawPacket';

class Notify<T = unknown> extends RawPacket<T> {
  constructor(packet: IRawNetPacket<T> | IRawReqPacket<T>) {
    super(OPCode.NOTIFY);
    this.method = packet.method;
    this.payload = packet.payload;
    this.path = packet.path;
    this.loadHeaders(packet.headers);
  }

  setHeader(header: string, value: any) {
    this.headers_.set(header, value);
  }
}

export {Notify}
