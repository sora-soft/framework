class TimeoutError extends Error {
  constructor() {
    super('ERR_TIMEOUT');
    Object.setPrototypeOf(this, TimeoutError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export {TimeoutError};
