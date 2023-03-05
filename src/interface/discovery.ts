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
  labels: ILabels;
}

export interface IServiceRunData extends IServiceMetaData {
  listeners: Omit<IListenerMetaData, 'targetName' | 'targetId'>[];
}

export interface INodeMetaData {
  id: string;
  host: string;
  pid: number;
  state: WorkerState;
  endpoint: Omit<IListenerMetaData, 'targetName' | 'targetId' | 'weight'>;
}

export interface IListenerMetaData extends IListenerInfo {
  id: string;
  state: ListenerState;
  targetId: string;
  targetName: string;
  labels: ILabels;
  weight: number;
}

export interface IListenerEventData extends IListenerMetaData {
  service: string;
  labels: ILabels;
}
