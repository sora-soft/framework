import {RPCErrorCode} from '../../ErrorCode';
import {ExError} from '../../utility/ExError';

class RPCError extends ExError {
  constructor(code: RPCErrorCode, message: string) {
    super(code, message);
    Object.setPrototypeOf(this, RPCError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}


export {RPCError}
