import {OPCode} from '../../Enum';
import {IRawResPacket, IRawNetPacket, IResPayloadPacket} from '../../interface/rpc';
import {Utility} from '../../utility/Utility';
import {RawPacket} from './RawPacket';

class Response<T = unknown> extends RawPacket<IResPayloadPacket<T>> {
  constructor(packet?: IRawResPacket<T>) {
    super(OPCode.RESPONSE);
    if (packet) {
      this.payload = packet.payload;
      this.loadHeaders(packet.headers);
    }
  }

  toPacket(): IRawNetPacket<IResPayloadPacket<T>> {
    return {
      opcode: this.opCode,
      headers: Utility.mapToJSON(this.headers_),
      payload: this.payload,
    }
  }

  toResult() {
    if (this.payload && this.payload.result)
      return this.payload.result;
  }
}

export {Response}
