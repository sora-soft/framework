import {Observable, Subscription, fromEvent} from 'rxjs';
import {AbortErrorCode} from '../ErrorCode.js';
import {AsyncReject} from '../interface/util.js';
import {AbortError} from '../utility/AbortError.js';
import {ErrorLevel, ExError} from '../index.js';

export interface IRunningUnit<T = unknown> {
  promise: Promise<T>;
  reject: AsyncReject;
}

class Context {
  constructor(parent?: Context) {
    this.controller_ = new AbortController();
    this.completed_ = false;
    this.abortObserver_ = fromEvent<ExError>(this.controller_.signal, 'abort');

    if (parent) {
      this.parentSubscription_ = parent.abortObserver.subscribe((err) => {
        this.abort(err);
      });
    }
  }

  async run<T = void>(executor: (content: Context) => Promise<T>): Promise<T> {
    if (this.aborted)
      throw new AbortError(AbortErrorCode.ERR_ABORT);

    if (this.completed)
      throw new ExError('ERR_CONTEXT_IS_COMPLETED', 'ContextError', 'ERR_CONTEXT_IS_COMPLETED', undefined, ErrorLevel.UNEXPECTED);

    const resultPromise = executor(this);
    return this.await(resultPromise);
  }

  async await<T = void>(promise: Promise<T>): Promise<T> {
    if (this.aborted)
      throw new AbortError(AbortErrorCode.ERR_ABORT);

    if (this.completed)
      throw new ExError('ERR_CONTEXT_IS_COMPLETED', 'ContextError', 'ERR_CONTEXT_IS_COMPLETED', undefined, ErrorLevel.UNEXPECTED);

    const abortPromise = new Promise<T>((_, reject) => {
      this.controller_.signal.addEventListener('abort', () => {
        reject(new AbortError());
      }, {once: true});
    });
    return Promise.race([promise, abortPromise]);
  }

  abort(err?: ExError) {
    if (this.completed)
      return;
    this.controller_.abort(err);
    this.finish();
  }

  complete() {
    if (this.aborted)
      throw new AbortError(AbortErrorCode.ERR_ABORT);
    this.finish();
  }

  private finish() {
    this.completed_ = true;
    this.parentSubscription_?.unsubscribe();
  }

  get abortObserver() {
    return this.abortObserver_;
  }

  get aborted() {
    return this.controller_.signal.aborted;
  }

  get completed() {
    return this.completed_;
  }

  get signal() {
    return this.controller_.signal;
  }

  private controller_: AbortController;
  private abortObserver_: Observable<ExError>;
  private parentSubscription_?: Subscription;
  private completed_: boolean;
}

export {Context};
