import {ErrorLevel} from '../Enum.js';

class ExError extends Error {
  static fromError(err: Error | ExError) {
    if (err instanceof ExError) {
      return err;
    } else {
      const exError = new ExError('ERR_UNKNOWN', 'ERR_UNKNOWN', err.message, err.cause, ErrorLevel.UNEXPECTED);
      exError.stack = err.stack;
      return exError;
    }
  }

  constructor(code: string, name: string, message: string, cause?: unknown, level = ErrorLevel.NORMAL, ...args: unknown[]) {
    super(message, {cause});
    this.code_ = code;
    this.name_ = name;
    this.level_ = level;
    this.args_ = args;
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

  get args() {
    return this.args_;
  }

  toJson() {
    return {
      code: this.code,
      name: this.name,
      level: this.level,
      message: this.message,
      args: this.args_,
      cause: this.cause,
    };
  }

  private code_: string;
  private name_: string;
  private level_: ErrorLevel;
  private args_: unknown[];
}

export {ExError};
