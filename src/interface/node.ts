import {Service} from '../lib/Service.js';
import {Worker} from '../lib/Worker.js';
import {IComponentMetaData} from './component.js';
import {IServiceOptions, IWorkerOptions} from './config.js';
import {INodeMetaData, IServiceMetaData, IWorkerMetaData} from './discovery.js';
import {IProviderMetaData} from './rpc.js';

export interface INodeRunData {
  services: IServiceMetaData[];
  workers: IWorkerMetaData[];
  providers: IProviderMetaData[];
  node: INodeMetaData;
  components: IComponentMetaData[];
}

export type ServiceBuilder = (options: IServiceOptions) => Service;
export type WorkerBuilder = (options: IWorkerOptions) => Worker;
