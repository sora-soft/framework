import {OPCode} from '../../Enum';
import {IRawNetPacket} from '../../interface/rpc';
import {Utility} from '../../utility/Utility';

class RawPacket<T> {
  constructor(opCode: OPCode) {
    this.headers_ = new Map();
    this.opCode_ = opCode;
  }

  getHeader(header: string) {
    return this.headers_.get(header);
  }

  loadHeaders(headers: {
    [key: string]: any,
  }) {
    for (const key of Object.keys(headers)) {
      this.headers_.set(key, headers[key]);
    }
  }

  setHeader(header: string, value: any) {
    this.headers_.set(header, value);
  }

  toPacket(): IRawNetPacket<T> {
    return {
      opcode: this.opCode_,
      method: this.method_,
      headers: Utility.mapToJSON(this.headers_),
      payload: this.payload_,
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

  protected headers_: Map<string, any>;
  private opCode_: OPCode;
  private method_: string;
  private path_: string;
  private payload_: T;
}

export {RawPacket}
