import {Logger} from '../logger/Logger';

class RPCLogger extends Logger {
  constructor() {
    super({identify: 'rpc'});
  }
}

export {RPCLogger};
