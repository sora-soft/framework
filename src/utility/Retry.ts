import EventEmitter = require('events');
import {RetryErrorCode} from '../ErrorCode';
import {RetryEvent} from '../Event';
import {IEventEmitter} from '../interface/event';
import {Context} from '../lib/Context';
import {AbortError} from './AbortError';
import {ExError} from './ExError';
import {Time} from './Time';

export class RetryError extends ExError {
  constructor(code: RetryErrorCode, message: string) {
    super(code, 'RetryError', message);
    Object.setPrototypeOf(this, RetryError.prototype);
  }
}

export type retryFunc<T> = (err: Error) => Promise<T>;
export type retryExecutor<T> = (context: Context) => Promise<T>;
interface IErrorEvent {
  [RetryEvent.Error]: (err: Error, nextRetry: number) => void;
  [RetryEvent.MaxRetryTime]: () => void;
}

export interface IRetryOptionsBase {
  maxRetryTimes: number;
}

export interface IRetryIncrementIntervalOptions extends IRetryOptionsBase {
  incrementInterval: true;
  maxRetryIntervalMS: number;
  minIntervalMS: number;
}

export interface IRetryFixedIntervalOptions extends IRetryOptionsBase {
  incrementInterval: false;
  intervalMS: number;
}

export type IRetryOptions = IRetryIncrementIntervalOptions | IRetryFixedIntervalOptions;
export const DefaultRetryOptions: IRetryOptions = {
  maxRetryTimes: 0,
  incrementInterval: false,
  intervalMS: 1000,
}

class Retry<T> {
  constructor(executor: retryExecutor<T>, options: IRetryOptions = DefaultRetryOptions) {
    this.maxRetryTimes_ = options.maxRetryTimes;
    this.incrementInterval_ = options.incrementInterval;
    if (options.incrementInterval) {
      this.maxRetryIntervalMS_ = options.maxRetryIntervalMS;
      this.currentInterval_ = options.minIntervalMS;
    } else {
      this.intervalMS_ = options.intervalMS;
      this.currentInterval_ = this.intervalMS_;
    }

    this.count_ = 0;
    this.errorEmitter_ = new EventEmitter();
    this.executor_ = executor;
  }

  async doJob(ctx?: Context): Promise<T> {
    const context = new Context(ctx);
    this.count_ = 0;

    const retry = async (err: Error) => {
      if (err instanceof AbortError)
        throw err;

      this.count_++;
      this.errorEmitter_.emit(RetryEvent.Error, err, this.currentInterval_);
      if (this.count_ < this.maxRetryTimes_ || !this.maxRetryTimes_) {
        await context.await(Time.timeout(this.currentInterval_, context.signal));
        if (this.incrementInterval_) {
          this.currentInterval_ = Math.min(this.maxRetryIntervalMS_, this.currentInterval_ * 2);
        }
        if (context.signal.aborted)
          throw new AbortError();

        return context.await(this.executor_(context)).catch((e: Error) => {
          if (e instanceof AbortError) {
            throw e;
          }
          return retry(e);
        });
      } else {
        this.errorEmitter_.emit(RetryEvent.MaxRetryTime);
        throw new RetryError(RetryErrorCode.ERR_RETRY_TOO_MANY_RETRY, `ERR_RETRY_TOO_MANY_RETRY`);
      }
    }

    return this.executor_(context).catch((err) => {
      return retry(err);
    });
  }

  get errorEmitter() {
    return this.errorEmitter_;
  }

  private maxRetryTimes_: number;
  private incrementInterval_: boolean;
  private intervalMS_: number;
  private maxRetryIntervalMS_: number;
  private currentInterval_: number;

  private count_: number;
  private errorEmitter_: IEventEmitter<IErrorEvent>;
  private executor_: retryExecutor<T>;
}

export {Retry}
