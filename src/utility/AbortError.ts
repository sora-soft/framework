import {AbortErrorCode} from '../ErrorCode.js';
import {ExError} from './ExError.js';

class AbortError extends ExError {
  constructor(message?: string) {
    super(AbortErrorCode.ERR_ABORT, 'AbortError', message || 'ERR_ABORT');
    Object.setPrototypeOf(this, AbortError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export {AbortError};
