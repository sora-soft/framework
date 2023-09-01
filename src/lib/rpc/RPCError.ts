import {ErrorLevel} from '../../Enum.js';
import {RPCErrorCode} from '../../ErrorCode.js';
import {ExError} from '../../utility/ExError.js';

class RPCError extends ExError {
  constructor(code: RPCErrorCode, message: string, ...args: unknown[]) {
    super(code, 'RPCError', message, ErrorLevel.NORMAL, undefined, ...args);
    Object.setPrototypeOf(this, RPCError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

class RPCResponseError extends ExError {
  constructor(code: string, level: ErrorLevel, message: string, ...args: unknown[]) {
    super(code, 'RPCResponseError', message, level, undefined, ...args);
    Object.setPrototypeOf(this, RPCResponseError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export {RPCError, RPCResponseError};
