import {FrameworkErrorCode} from '../ErrorCode.js';
import {ExError} from '../utility/ExError.js';
import {Ref} from '../utility/Ref.js';
import {Context} from './Context.js';
import {FrameworkError} from './FrameworkError.js';
import {Logger} from './logger/Logger.js';
import {Runtime} from './Runtime.js';
import {IComponentMetaData, IComponentOptions} from '../interface/component.js';
import {Utility} from '../index.js';

abstract class Component {
  constructor() {
    this.init_ = false;
    this.ref_ = new Ref();
  }

  protected abstract setOptions(options: IComponentOptions): void;
  loadOptions(options: IComponentOptions) {
    this.options_ = options;
    this.setOptions(options);
  }

  protected abstract connect(context: Context): Promise<void>;
  async start(context?: Context) {
    if (!this.options_)
      throw new FrameworkError(FrameworkErrorCode.ERR_COMPONENT_OPTIONS_NOT_SET, `ERR_COMPONENT_OPTIONS_NOT_SET, name=${this.name_}`);

    await this.ref_.add(async () => {
      this.startContext_ = new Context(context);
      await this.connect(this.startContext_).catch((err: ExError) => {
        Runtime.frameLogger.error(`component.${this.name_}`, err, {event: 'connect-component', error: Logger.errorMessage(err)});
        throw err;
      });
      Runtime.frameLogger.success(`component.${this.name_}`, {event: 'success-connect', options: this.options, version: this.version});
      this.init_ = true;
    });
  }

  protected abstract disconnect(): Promise<void>;
  async stop() {
    await this.ref_.minus(async () => {
      this.startContext_?.abort();
      this.startContext_ = null;
      await this.disconnect().catch((err: ExError) => {
        Runtime.frameLogger.error(`component.${this.name_}`, err, {event: 'disconnect-component', error: Logger.errorMessage(err)});
      }).then(() => {
        Runtime.frameLogger.success(`component.${this.name_}`, {event: 'success-disconnect'});
      });
    }).catch((err: Error) => {
      if (err.message === 'ERR_REF_NEGATIVE')
        Runtime.frameLogger.warn(`component.${this.name_}`, {event: 'duplicate-stop'});
      else
        throw err;
    });
  }

  abstract get version(): string;

  get name() {
    return this.name_;
  }

  set name(value: string) {
    this.name_ = value;
  }

  get ready() {
    return this.init_;
  }

  get options() {
    return this.options_;
  }

  get meta(): IComponentMetaData {
    return Utility.deepCopy({
      name: this.name_,
      ready: this.ready,
      version: this.version,
      options: this.options,
    });
  }

  protected name_: string;
  protected options_: IComponentOptions;
  protected ref_: Ref<void>;
  private init_: boolean;
  private startContext_: Context | null;
  // private ref_: number;
}

export {Component};
