import {IDiscoveryInfo} from '../index.js';
import {Service} from '../lib/Service.js';
import {Worker} from '../lib/Worker.js';
import {IComponentMetaData} from './component.js';
import {IServiceOptions, IWorkerOptions} from './config.js';
import {INodeMetaData} from './discovery.js';
import {IProviderMetaData} from './rpc.js';

export interface INodeRunData {
  providers: IProviderMetaData[];
  node: INodeMetaData;
  components: IComponentMetaData[];
  discovery: IDiscoveryInfo;
}

export type ServiceBuilder = (options: IServiceOptions) => Service;
export type WorkerBuilder = (options: IWorkerOptions) => Worker;
