import {ErrorLevel} from '../Enum';

class ExError extends Error {
  static fromError(err: Error | ExError) {
    if (err instanceof ExError) {
      return err;
    } else {
      return new ExError('ERR_UNKNOWN', 'ERR_UNKNOWN', err.message, ErrorLevel.UNEXPECTED);
    }
  }

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

  toJson() {
    return {
      code: this.code,
      name: this.name,
      level: this.level,
      message: this.message,
    };
  }

  private code_: string;
  private name_: string;
  private level_: ErrorLevel;
}

export {ExError}
