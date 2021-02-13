import {FrameWorkErrorCode} from '../ErrorCode';

class FrameWorkError extends Error {
  constructor(code: FrameWorkErrorCode, message: string) {
    super(message);
    this.code_ = code;
  }

  get code() {
    return this.code_;
  }

  private code_: FrameWorkErrorCode;
}

export {FrameWorkError as FrameError};
