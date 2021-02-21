import {ListenerState, WorkerState} from '../Enum';
import {ILabels} from './config';
import {IListenerInfo} from './rpc';

export interface IWorkerMetaData {
  name: string;
  id: string;
  state: WorkerState;
}

export interface IServiceMetaData {
  name: string;
  id: string;
  nodeId: string;
  state: WorkerState;
  labels: ILabels
}

export interface INodeMetaData {
  id: string;
  host: string;
  pid: number;
  state: WorkerState;
  endpoint: IListenerMetaData;
}

export interface IListenerMetaData extends IListenerInfo {
  state: ListenerState;
  targetId?: string;
}

export interface IListenerEventData extends IListenerMetaData {
  service: string;
  labels: ILabels;
}
