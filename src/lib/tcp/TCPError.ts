import {TCPErrorCode} from '../../ErrorCode';
import {ExError} from '../../utility/ExError';

class TCPError extends ExError {
  constructor(code: TCPErrorCode, message: string) {
    super(code, 'TCPError', message);
    Object.setPrototypeOf(this, TCPError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export {TCPError};
