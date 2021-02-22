import {TimeoutError} from './TimeoutError';

class Waiter<T> {
  constructor() {
    this.pool_ = new Map();
    this.id_ = 0;
  }

  wait(ttlMs = 1000) {
    const id = ++this.id_;
    const timer = setTimeout(() => {
      if (this.pool_.has(id)) {
        const info = this.pool_.get(id);
        info.reject(new TimeoutError());
      }
    }, ttlMs);
    return {
      id,
      promise: new Promise<T>((resolve, reject) => {
        this.pool_.set(id, { resolve, reject, timer });
      }),
    }
  }

  emit(id: number, result: T) {
    if (this.pool_.has(id)) {
      const info = this.pool_.get(id);
      clearTimeout(info.timer);
      this.pool_.delete(id);
      info.resolve(result);
    }
    if (!this.pool_.size && this.allStoppedCallback_) {
      clearTimeout(this.stopTimeoutTimer_);
      this.allStoppedCallback_();
    }
  }

  emitError(id: number, error: Error) {
    if (this.pool_.has(id)) {
      const info = this.pool_.get(id);
      clearTimeout(info.timer);
      this.pool_.delete(id);
      info.reject(error);
    }
  }

  async waitForAll(ttlMS: number) {
    if (!this.pool_.size)
      return;

    const promise = new Promise<void>((resolve) => {
      this.allStoppedCallback_ = resolve;
    });
    this.stopTimeoutTimer_ = setTimeout(() => {
      if (this.allStoppedCallback_)
        this.allStoppedCallback_();
    }, ttlMS);
    return promise;
  }

  private pool_: Map<number, {resolve: (value: T) => void, reject: (error: Error) => void, timer: NodeJS.Timeout}>;
  private allStoppedCallback_: () => void;
  private stopTimeoutTimer_: NodeJS.Timer;
  private id_: number;
}

export {Waiter}
