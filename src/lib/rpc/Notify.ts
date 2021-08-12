import {OPCode} from '../../Enum';
import {IRawNetPacket, IRawReqPacket} from '../../interface/rpc';
import {RawPacket} from './RawPacket';

class Notify<T = unknown> extends RawPacket<T> {
  constructor(packet: Omit<IRawReqPacket<T>, 'opcode'>) {
    super(OPCode.NOTIFY);
    this.method = packet.method;
    this.payload = packet.payload;
    this.path = packet.path;
    this.loadHeaders(packet.headers);
  }

  setHeader(header: string, value: any) {
    this.headers_.set(header, value);
  }

  get path() {
    return super.path!;
  }

  set path(value: string) {
    super.path = value;
  }

  get method() {
    return super.method!;
  }

  set method(value: string) {
    super.method = value;
  }
}

export {Notify}
