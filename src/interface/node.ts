import {Service} from '../lib/Service';
import {Worker} from '../lib/Worker';
import {IServiceOptions, IWorkerOptions} from './config';
import {INodeMetaData, IServiceMetaData, IWorkerMetaData} from './discovery';
import {IProviderMetaData} from './rpc';

export interface INodeRunData {
  services: IServiceMetaData[];
  workers: IWorkerMetaData[];
  providers: IProviderMetaData[];
  node: INodeMetaData;
}

export type ServiceBuilder = (options: IServiceOptions) => Service;
export type WorkerBuilder = (options: IWorkerOptions) => Worker;
