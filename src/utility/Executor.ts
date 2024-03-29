export type JobExecutor<T = unknown> = () => Promise<T>;

class Executor {
  public async doJob<T = unknown>(executor: JobExecutor<T>) {
    if (this.isStopped_)
      return;

    const promise = executor().then((result) => {
      this.workingPromises_.splice(this.workingPromises_.indexOf(promise), 1);
      return result;
    }).catch((err) => {
      this.workingPromises_.splice(this.workingPromises_.indexOf(promise), 1);
      throw err;
    });
    this.workingPromises_.push(promise);
    return promise;
  }

  public start() {
    this.isStopped_ = false;
  }

  public async stop() {
    if (this.workingPromises_.length)
      await Promise.all(this.workingPromises_);
    this.isStopped_ = true;
  }

  get isIdle() {
    return !this.workingPromises_.length;
  }

  protected isStopped_ = true;
  private workingPromises_: Promise<unknown>[] = [];
}

export {Executor};
