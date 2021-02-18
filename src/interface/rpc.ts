import {OPCode} from '../Enum';

export interface IRawNetPacket<T = unknown> {
  opcode: OPCode,
  method?: string,
  headers: {
    [key: string]: any
  },
  payload: T
}

export interface IListenerInfo {
  protocol: string;
  endpoint: string;
  labels: string[];
}

export interface IRawReqPacket<T = unknown> {
  method: string,
  headers: {
    [key: string]: any
  },
  payload: T
}

export interface IRawResPacket<T extends { error?: string, message?: string } = unknown> {
  headers: {
    [key: string]: any
  },
  payload: T
}
