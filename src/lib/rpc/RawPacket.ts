import {OPCode} from '../../Enum';
import {RPCErrorCode} from '../../ErrorCode';
import {IRawNetPacket, IResPayloadPacket} from '../../interface/rpc';
import {Utility} from '../../utility/Utility';
import {RPCError} from './RPCError';

class RawPacket<T> {
  constructor(opCode: OPCode) {
    this.headers_ = new Map();
    this.opCode_ = opCode;
  }

  getHeader<H>(header: string): H | undefined {
    return this.headers_.get(header) as H | undefined;
  }

  loadHeaders(headers: {
    [key: string]: any;
  }) {
    for (const key of Object.keys(headers)) {
      this.headers_.set(key, headers[key]);
    }
  }

  setHeader(header: string, value: any) {
    this.headers_.set(header, value);
  }

  toPacket(): IRawNetPacket<T> {
    switch (this.opCode_) {
      case OPCode.REQUEST:
      case OPCode.NOTIFY:
        return {
          opcode: this.opCode_,
          method: this.method_,
          path: this.path_,
          headers: Utility.mapToJSON(this.headers_),
          payload: this.payload_,
        };
      case OPCode.RESPONSE:
        return {
          opcode: this.opCode_,
          headers: Utility.mapToJSON(this.headers_),
          payload: this.payload_ as unknown as IResPayloadPacket<unknown>,
        };
      case OPCode.OPERATION:
        throw new RPCError(RPCErrorCode.ERR_RPC_NOT_SUPPORT_OPCODE, 'ERR_NOT_SUPPORT_OPCODE');
    }
  }

  get opCode() {
    return this.opCode_;
  }

  get method() {
    return this.method_;
  }

  set method(value: string) {
    this.method_ = value;
  }

  get path() {
    return this.path_;
  }

  set path(value: string) {
    this.path_ = value;
  }

  get payload() {
    return this.payload_;
  }

  set payload(value: T) {
    this.payload_ = value;
  }

  get headers() {
    return Utility.mapToJSON(this.headers_);
  }

  protected headers_: Map<string, any>;
  private opCode_: OPCode;
  private method_: string;
  private path_: string;
  private payload_: T;
}

export {RawPacket};
