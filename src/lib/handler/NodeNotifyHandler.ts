import {Route} from '../rpc/Route.js';
import jsondiffpatch from 'jsondiffpatch';

export interface INodeRunDataDiff {
  id: string;
  diff: jsondiffpatch.Delta;
}

export interface INodeNotifyHandler extends Route {
  notifyNodeState(body: INodeRunDataDiff): Promise<void>;
}
