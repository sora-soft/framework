import {ErrorLevel, OPCode} from '../Enum';
import {ILabels} from './config';

// export interface IRawNetPacket<T = unknown> {
//   opcode: OPCode,
//   method: string,
//   path: string,
//   headers: {
//     [key: string]: any
//   },
//   payload: T
// }
export type IRawNetPacket<T = unknown> = IRawReqPacket<T> | IRawResPacket<unknown> | IRawOperationPacket;

export interface IListenerInfo {
  id: string;
  protocol: string;
  endpoint: string;
  labels: ILabels;
}

export interface IRawReqPacket<T = unknown> {
  opcode: OPCode.REQUEST | OPCode.NOTIFY;
  method: string;
  path: string;
  headers: {
    [key: string]: any
  };
  payload: T;
}

export interface IRawOperationPacket {
  opcode: OPCode.OPERATION;
  command: string;
  args: any;
}

export interface IRawResPacket<T = unknown> {
  opcode: OPCode.RESPONSE;
  headers: {
    [key: string]: any
  };
  payload: IResPayloadPacket<T>;
}

export interface IPayloadError {
  code: string;
  message: string;
  level: ErrorLevel;
  name: string;
}

export interface IResPayloadPacket<T = unknown> {
  error: IPayloadError | null;
  result: T | null;
}
