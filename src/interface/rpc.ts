import {ErrorLevel, OPCode} from '../Enum';
import {ILabels} from './config';

export interface IRawNetPacket<T = unknown> {
  opcode: OPCode,
  method?: string,
  path?: string,
  headers: {
    [key: string]: any
  },
  payload: T
}

export interface IListenerInfo {
  id: string;
  protocol: string;
  endpoint: string;
  labels: ILabels;
}

export interface IRawReqPacket<T = unknown> {
  method: string,
  path: string,
  headers: {
    [key: string]: any
  },
  payload: T
}

export interface IRawResPacket<T = unknown> {
  headers: {
    [key: string]: any
  },
  payload: IResPayloadPacket<T>
}

export interface IPayloadError {
  code: string;
  message: string;
  level: ErrorLevel;
  name: string;
}

export interface IResPayloadPacket<T> {
  error?: IPayloadError;
  result?: T;
}
