export type RefCallback = () => Promise<void>;

class Ref {
  constructor() {
    this.count_ = 0;
  }

  async add(callback: RefCallback) {
    this.count_ ++;
    if (this.count_ > 1) {
      await this.startPromise_;
      return;
    }

    this.startPromise_ = callback();
    await this.startPromise_;
  }

  async minus(callback: RefCallback) {
    this.count_ --;
    if (this.count_ < 0)
      throw new Error('ERR_REF_NEGATIVE');

    if (this.count_ > 0) {
      await this.stopPromise_;
      return;
    }

    this.stopPromise_ = callback();
    await this.stopPromise_;
  }

  get count() {
    return this.count_;
  }

  private count_: number;
  private startPromise_: Promise<void>;
  private stopPromise_: Promise<void>;
}

export {Ref}
