import {FrameworkErrorCode} from '../ErrorCode';
import {FrameworkError} from './FrameworkError';
import {Logger} from './logger/Logger';
import {Runtime} from './Runtime';

export interface IComponentOptions {}

abstract class Component {
  constructor(name: string) {
    this.name_ = name;
    this.init_ = false;
    this.ref_ = 0;

    Runtime.registerComponent(this.name_, this);
  }

  protected abstract setOptions(options: IComponentOptions): void;
  loadOptions(options: IComponentOptions) {
    this.options_ = options;
    this.setOptions(options);
  }

  protected abstract connect(): Promise<void>;
  async start() {
    if (!this.options_)
      throw new FrameworkError(FrameworkErrorCode.ERR_COMPONENT_OPTIONS_NOT_SET, `ERR_COMPONENT_OPTIONS_NOT_SET, name=${this.name_}`);

    this.ref_ ++;
    if (this.ref_ > 1)
      return;

    await this.connect().catch(err => {
      Runtime.frameLogger.error(`component.${this.name_}`, err, { event: 'connect-component', error: Logger.errorMessage(err) });
    });
    Runtime.frameLogger.success(`component.${this.name_}`, { event: 'success-connect', options: this.options_ });
    this.init_ = true;
  }

  protected abstract disconnect(): Promise<void>;
  async stop() {
    if (this.ref_ <= 0) {
      Runtime.frameLogger.warn(`component.${this.name_}`, { event: 'duplicate-stop' });
      return;
    }

    this.ref_ --;
    if (this.ref_ <= 0) {
      await this.disconnect().catch(err => {
        Runtime.frameLogger.error(`component.${this.name_}`, err, { event: 'disconnect-component', error: Logger.errorMessage(err) });
      });
      Runtime.frameLogger.success(`component.${this.name_}`, { event: 'success-disconnect' });
    }
  }

  get ready() {
    return this.init_;
  }

  protected name_: string;
  protected options_: IComponentOptions;
  private init_: boolean;
  private ref_: number;
}

export {Component};
