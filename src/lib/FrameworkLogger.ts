import {Logger} from './logger/Logger.js';

class FrameworkLogger extends Logger {
  constructor() {
    super({identify: 'framework'});
  }
}

export {FrameworkLogger};
