import {ErrorLevel} from '../Enum.js';
import {FrameworkErrorCode} from '../ErrorCode.js';
import {ExError} from '../utility/ExError.js';

class FrameworkError extends ExError {
  constructor(code: FrameworkErrorCode, message: string, cause?: unknown, ...args: unknown[]) {
    super(code, 'FrameworkError', message, ErrorLevel.UNEXPECTED, cause, ...args);
    Object.setPrototypeOf(this, FrameworkError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export {FrameworkError};
