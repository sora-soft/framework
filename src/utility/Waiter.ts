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
  }

  emitError(id: number, error: Error) {
    if (this.pool_.has(id)) {
      const info = this.pool_.get(id);
      clearTimeout(info.timer);
      this.pool_.delete(id);
      info.reject(error);
    }
  }

  private pool_: Map<number, {resolve: (value: T) => void, reject: (error: Error) => void, timer: NodeJS.Timeout}>;
  private id_: number;
}

export {Waiter}
