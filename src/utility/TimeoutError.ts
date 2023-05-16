import {ExError} from './ExError.js';

class TimeoutError extends ExError {
  constructor() {
    super('ERR_TIMEOUT', 'TimeoutError', 'ERR_TIMEOUT');
    Object.setPrototypeOf(this, TimeoutError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export {TimeoutError};
