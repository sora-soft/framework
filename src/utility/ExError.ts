class ExError extends Error {

  constructor(code: string, name: string, message: string) {
    super(message);
    this.code_ = code;
    this.name_ = name;
    Object.setPrototypeOf(this, ExError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  get code() {
    return this.code_;
  }

  get name() {
    return this.name_;
  }

  private code_: string;
  private name_: string;
}

export {ExError}
