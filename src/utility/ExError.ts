import {ErrorLevel} from '../Enum';

class ExError extends Error {

  constructor(code: string, name: string, message: string, level = ErrorLevel.NORMAL) {
    super(message);
    this.code_ = code;
    this.name_ = name;
    this.level_ = level;
    Object.setPrototypeOf(this, ExError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  get code() {
    return this.code_;
  }

  get name() {
    return this.name_;
  }

  get level() {
    return this.level_;
  }

  private code_: string;
  private name_: string;
  private level_: ErrorLevel;
}

export {ExError}
