import {INodeRunData} from '../../interface/node';
import {Route} from '../rpc/Route';

export interface INodeNotifyHandler extends Route {
  notifyNodeState(body: INodeRunData): Promise<void>;
}
