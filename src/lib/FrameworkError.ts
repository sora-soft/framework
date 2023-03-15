import {FrameworkErrorCode} from '../ErrorCode.js';
import {ExError} from '../utility/ExError.js';

class FrameworkError extends ExError {
  constructor(code: FrameworkErrorCode, message: string) {
    super(code, 'FrameworkError', message);
    Object.setPrototypeOf(this, FrameworkError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export {FrameworkError};
