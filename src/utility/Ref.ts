import {ErrorLevel} from '../Enum.js';
import {ExError} from './ExError.js';

export type RefCallback<T> = () => Promise<T>;

class Ref<T = unknown> {
  constructor() {
    this.count_ = 0;
  }

  async add(callback: RefCallback<T>): Promise<T> {
    this.count_ ++;
    if (this.count_ > 1 && this.startPromise_) {
      return this.startPromise_;
    }

    this.startPromise_ = callback();
    return this.startPromise_;
  }

  async minus(callback: RefCallback<T>) {
    this.count_ --;
    if (this.count_ < 0)
      throw new ExError('ERR_REF_NEGATIVE', 'RefError', 'ERR_REF_NEGATIVE', ErrorLevel.UNEXPECTED);

    if (this.count_ > 0) {
      return this.stopPromise_;
    }

    this.stopPromise_ = callback();
    return this.stopPromise_;
  }

  get count() {
    return this.count_;
  }

  private count_: number;
  private startPromise_?: Promise<T>;
  private stopPromise_?: Promise<T>;
}

export {Ref};
