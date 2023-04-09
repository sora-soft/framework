import {Route} from '../rpc/Route.js';
import {Delta} from 'jsondiffpatch';

export interface INodeRunDataDiff {
  id: string;
  diff: Delta;
}

export interface INodeNotifyHandler extends Route {
  notifyNodeState(body: INodeRunDataDiff): Promise<void>;
}
