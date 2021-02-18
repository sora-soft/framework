import {FrameWorkErrorCode} from '../ErrorCode';
import {ExError} from '../utility/ExError';

class FrameWorkError extends ExError {
  constructor(code: FrameWorkErrorCode, message: string) {
    super(code, message);
    Object.setPrototypeOf(this, FrameWorkError.prototype);
  }
}

export {FrameWorkError};
