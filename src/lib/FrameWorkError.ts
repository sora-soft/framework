import {FrameworkErrorCode} from '../ErrorCode';
import {ExError} from '../utility/ExError';

class FrameworkError extends ExError {
  constructor(code: FrameworkErrorCode, message: string) {
    super(code, 'FrameworkError', message);
    Object.setPrototypeOf(this, FrameworkError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export {FrameworkError};
