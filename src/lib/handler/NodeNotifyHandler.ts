import {INodeRunData} from '../../interface/node.js';
import {Route} from '../rpc/Route.js';

export interface INodeNotifyHandler extends Route {
  notifyNodeState(body: INodeRunData): Promise<void>;
}
