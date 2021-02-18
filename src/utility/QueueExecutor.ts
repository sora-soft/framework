import {Executor, JobExecutor} from './Executor';

class QueueExecutor extends Executor {
  public async doJob<T = unknown>(executor: JobExecutor<T>) {
    if (this.isStopped_)
      return;

    const promise = new Promise<T>((resolve, reject) => {
      this.executorQueue_.push({
        resolve,
        reject,
        executor,
      });
    });
    this.doJobInQueue();
    return promise;
  }

  public async stop() {
    this.isStopped_ = true;
    if (this.isDoingJob_) {
      const stopPromise = new Promise<void>((resolve) => { this.stopCallback_ = resolve});
      await stopPromise;
    }
  }

  private async doJobInQueue() {
    if (this.isDoingJob_)
      return;

    this.isDoingJob_ = true;
    while(this.executorQueue_.length) {
      const info = this.executorQueue_.shift();
      let hasError = false;
      const result = await info.executor().catch(err => {
        info.reject(err);
        hasError = true;
      });
      if (!hasError) {
        info.resolve(result);
      }
    }

    if (this.stopCallback_)
      this.stopCallback_();

    this.isDoingJob_ = false;
  }

  get isIdle() {
    return !this.isDoingJob_;
  }

  private executorQueue_: {resolve: (value: unknown) => void, reject: (err: Error) => void, executor: JobExecutor}[] = [];
  private stopCallback_: () => void;
  private isDoingJob_ = false;
}

export {QueueExecutor};
