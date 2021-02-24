import {Logger} from './logger/Logger';

class FrameworkLogger extends Logger {
  constructor() {
    super({identify: 'framework'});
  }
}

export {FrameworkLogger};
