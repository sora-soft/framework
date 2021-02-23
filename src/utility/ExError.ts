class ExError extends Error {

  constructor(code: string, message: string) {
    super(message);

    Object.setPrototypeOf(this, ExError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  get code() {
    return this.code_;
  }

  private code_: string;
}

export {ExError}
