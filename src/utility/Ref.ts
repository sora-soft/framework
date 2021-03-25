export type RefCallback = () => Promise<void>;

class Ref {
  constructor() {
    this.count_ = 0;
  }

  async add(callback: RefCallback) {
    this.count_ ++;
    if (this.count_ > 1)
      return;

    await callback();
  }

  async minus(callback: RefCallback) {
    this.count_ --;
    if (this.count_ < 0)
      throw new Error('ERR_REF_NEGATIVE');

    if (this.count_ > 0)
      return;

    await callback();
  }

  get count() {
    return this.count_;
  }

  private count_: number;
}

export {Ref}
