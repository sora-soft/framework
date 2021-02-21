abstract class Component {
  constructor(name: string) {
    this.name_ = name;
    this.init_ = false;
  }

  protected abstract connect(): Promise<void>;
  async start() {
    if (this.init_)
      return;

    await this.connect();
    this.init_ = true;
  }

  get ready() {
    return this.init_;
  }

  protected name_: string;
  private init_: boolean;
}

export {Component};
