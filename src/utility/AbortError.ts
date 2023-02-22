import {AbortErrorCode} from '../ErrorCode';
import {ExError} from './ExError';

class AbortError extends ExError {
  constructor(message?: string) {
    super(AbortErrorCode.ERR_ABORT, 'AbortError', message || 'ERR_ABORT');
    Object.setPrototypeOf(this, AbortError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export {AbortError};
