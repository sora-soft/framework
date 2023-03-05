import {ConnectorState, ErrorLevel, OPCode} from '../Enum';
import {ILabelData} from '../utility/LabelFilter';
import {ILabels} from './config';

export type IRawNetPacket<T = unknown> = IRawReqPacket<T> | IRawResPacket<unknown> | IRawOperationPacket;

export interface IListenerInfo {
  protocol: string;
  endpoint: string;
  labels: ILabels;
}

export interface IRawReqPacket<T = unknown> {
  opcode: OPCode.REQUEST | OPCode.NOTIFY;
  method: string;
  path: string;
  headers: {
    [key: string]: any;
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
    [key: string]: any;
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

export interface IConnectorPingOptions {
  enabled: true;
  timeout?: number;
  interval?: number;
}

export interface IConnectorNoPingOptions {
  enabled: false;
}

export type ConnectorPingOptions = IConnectorPingOptions | IConnectorNoPingOptions;

export interface IConnectorOptions {
  ping: ConnectorPingOptions;
}

export interface ISenderMetaData {
  id: string;
  state: ConnectorState;
  targetId: string;
  weight: number;
}

export interface IProviderMetaData {
  name: string;
  filter: ILabelData[];
  senders: ISenderMetaData[];
}
