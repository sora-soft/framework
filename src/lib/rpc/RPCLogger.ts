import {Logger} from '../logger/Logger.js';

class RPCLogger extends Logger {
  constructor() {
    super({identify: 'rpc'});
  }
}

export {RPCLogger};
