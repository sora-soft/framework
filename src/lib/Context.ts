import {AbortErrorCode} from '../ErrorCode';
import {AsyncReject} from '../interface/util';
import {AbortError} from '../utility/AbortError';

export interface IRunningUnit<T = unknown> {
  promise: Promise<T>;
  reject: AsyncReject;
}

class Context {
  constructor(parent?: Context) {
    this.controller_ = new AbortController();
    this.stopped_ = false;

    if (parent) {
      parent.signal.addEventListener('abort', () => {
        this.abort();
      }, {once: true});
    }
  }

  async run<T = void>(executor: (content: Context) => Promise<T>): Promise<T> {
    if (this.stopped_)
      throw new AbortError(AbortErrorCode.ERR_ABORT);
    const resultPromise = executor(this);
    return this.await(resultPromise);
  }

  async await<T = void>(promise: Promise<T>): Promise<T> {
    if (this.stopped_)
      throw new AbortError(AbortErrorCode.ERR_ABORT);
    const abortPromise = new Promise<T>((_, reject) => {
      this.controller_.signal.addEventListener('abort', () => {
        reject(new AbortError());
      }, {once: true});
    });
    return Promise.race([promise, abortPromise]);
  }

  abort() {
    this.stopped_ = true;
    this.controller_.abort();
  }

  get signal() {
    return this.controller_.signal;
  }

  private controller_: AbortController;
  private stopped_: boolean;
}

export {Context}
