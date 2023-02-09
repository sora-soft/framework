import {ListenerState, WorkerState} from '../Enum';
import {ILabels} from './config';
import {IListenerInfo} from './rpc';

export interface IWorkerMetaData {
  name: string;
  id: string;
  state: WorkerState;
  nodeId: string;
}

export interface IServiceMetaData extends IWorkerMetaData {
  labels: ILabels
}

export interface IServiceRunData extends IServiceMetaData {
  listeners: IListenerMetaData[];
}

export interface INodeMetaData {
  id: string;
  host: string;
  pid: number;
  state: WorkerState;
  endpoint: IListenerMetaData;
}

export interface IListenerMetaData extends IListenerInfo {
  id: string;
  state: ListenerState;
  targetId?: string;
  labels: ILabels;
}

export interface IListenerEventData extends IListenerMetaData {
  service: string;
  labels: ILabels;
}
