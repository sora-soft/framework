import {ErrorLevel} from '../../Enum';
import {RPCErrorCode} from '../../ErrorCode';
import {ExError} from '../../utility/ExError';

class RPCError extends ExError {
  constructor(code: RPCErrorCode, message: string) {
    super(code, 'RPCError', message);
    Object.setPrototypeOf(this, RPCError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

class RPCResponseError extends ExError {
  constructor(code: string, level: ErrorLevel, message: string) {
    super(code, 'RPCResponseError', message, level);
    Object.setPrototypeOf(this, RPCResponseError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export {RPCError, RPCResponseError}
