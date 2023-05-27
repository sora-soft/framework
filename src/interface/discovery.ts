import {ListenerState, WorkerState} from '../Enum.js';
import {ILabels} from './config.js';
import {IListenerInfo} from './rpc.js';

export interface IWorkerMetaData {
  readonly name: string;
  readonly id: string;
  readonly alias?: string;
  readonly state: WorkerState;
  readonly nodeId: string;
  readonly startTime: number;
}

export interface IServiceMetaData extends IWorkerMetaData {
  readonly labels: ILabels;
}

export interface IServiceRunData extends IServiceMetaData {
  readonly listeners: Omit<IListenerMetaData, 'targetName' | 'targetId'>[];
}

export interface INodeMetaData {
  readonly id: string;
  readonly alias?: string;
  readonly host: string;
  readonly pid: number;
  readonly state: WorkerState;
  readonly endpoint: Omit<IListenerMetaData, 'targetName' | 'targetId' | 'weight'>;
  readonly startTime: number;
  readonly versions: {
    readonly framework: string;
    readonly app: string;
  };
}

export interface IListenerMetaData extends IListenerInfo {
  readonly id: string;
  readonly state: ListenerState;
  readonly targetId: string;
  readonly targetName: string;
  readonly labels: ILabels;
  readonly weight: number;
}
