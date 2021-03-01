import EventEmitter = require('events');
import {RetryErrorCode} from '../ErrorCode';
import {RetryEvent} from '../Event';
import {IEventEmitter} from '../interface/event';
import {ExError} from './ExError';
import {Time} from './Time';

export class RetryError extends ExError {
  constructor(code: RetryErrorCode, message: string) {
    super(code, 'RetryError', message);
    Object.setPrototypeOf(this, RetryError.prototype);
  }
}

export type retryFunc<T> = (err: Error) => Promise<T>;
export type retryExecutor<T> = () => Promise<T>;
interface IErrorEvent {
  [RetryEvent.Error]: (err: Error) => void;
  [RetryEvent.MaxRetryTime]: () => void;
}

class Retry<T> {
  constructor(executor: retryExecutor<T>, maxRetryTimes: number) {
    this.maxRetryTimes_ = maxRetryTimes;
    this.count_ = 0;
    this.errorEmitter = new EventEmitter();
    this.executor_ = executor;
  }

  async doJob(): Promise<T> {
    this.count_ = 0;

    const retry = async (err: Error) => {
      this.count_++;
      this.errorEmitter.emit(RetryEvent.Error, err);
      if (this.count_ < this.maxRetryTimes_) {
        await Time.timeout(Math.min(Math.pow(4, this.count_), 1000));
        return this.executor_().catch(retry.bind(this));
      } else {
        this.errorEmitter.emit(RetryEvent.MaxRetryTime);
        throw new RetryError(RetryErrorCode.ERR_RETRY_TOO_MANY_RETRY, `ERR_RETRY_TOO_MANY_RETRY`);
      }
    }

    return this.executor_().catch(retry.bind(this));
  }

  private maxRetryTimes_: number;
  private count_: number;
  private errorEmitter: IEventEmitter<IErrorEvent>;
  private executor_: retryExecutor<T>
}

export {Retry}
