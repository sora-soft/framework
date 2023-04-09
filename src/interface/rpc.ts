import {ConnectorState, ErrorLevel, OPCode} from '../Enum.js';
import {ILabelData} from '../utility/LabelFilter.js';
import {ILabels} from './config.js';

export type IRawNetPacket<T = unknown> = IRawReqPacket<T> | IRawResPacket<unknown> | IRawOperationPacket;

export interface IListenerInfo {
  protocol: string;
  endpoint: string;
  labels: ILabels;
}

export interface IRawReqPacket<T = unknown> {
  opcode: OPCode.REQUEST | OPCode.NOTIFY;
  method: string;
  service: string;
  headers: {
    [key: string]: unknown;
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
    [key: string]: unknown;
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
  readonly id: string;
  readonly state: ConnectorState;
  readonly listenerId: string;
  readonly targetId: string;
  readonly weight: number;
  readonly protocol: string;
}

export interface IProviderMetaData {
  readonly name: string;
  readonly filter: ILabelData[];
  readonly senders: ISenderMetaData[];
}
