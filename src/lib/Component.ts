import {FrameworkErrorCode} from '../ErrorCode';
import {Ref} from '../utility/Ref';
import {FrameworkError} from './FrameworkError';
import {Logger} from './logger/Logger';
import {Runtime} from './Runtime';

export interface IComponentOptions {}

abstract class Component {
  constructor(name: string) {
    this.name_ = name;
    this.init_ = false;
    this.ref_ = new Ref();

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

    await this.ref_.add(async () => {
      await this.connect().catch(err => {
        Runtime.frameLogger.error(`component.${this.name_}`, err, { event: 'connect-component', error: Logger.errorMessage(err) });
        throw err;
      });
      Runtime.frameLogger.success(`component.${this.name_}`, { event: 'success-connect', options: this.logOptions(), version: this.version });
      this.init_ = true;
    });
  }

  protected abstract disconnect(): Promise<void>;
  async stop() {
    await this.ref_.minus(async () => {
      await this.disconnect().catch(err => {
        Runtime.frameLogger.error(`component.${this.name_}`, err, { event: 'disconnect-component', error: Logger.errorMessage(err) });
      }).then(() => {
        Runtime.frameLogger.success(`component.${this.name_}`, { event: 'success-disconnect' });
      });
    }).catch((err: Error) => {
      if (err.message === 'ERR_REF_NEGATIVE')
        Runtime.frameLogger.warn(`component.${this.name_}`, { event: 'duplicate-stop' });
      else
        throw err;
    });
  }

  abstract get version(): string;

  get name() {
    return this.name_;
  }

  get ready() {
    return this.init_;
  }

  get options() {
    return this.options_;
  }

  logOptions() {
    return this.options_;
  }

  protected name_: string;
  protected options_: IComponentOptions;
  protected ref_: Ref;
  private init_: boolean;
  // private ref_: number;
}

export {Component};
