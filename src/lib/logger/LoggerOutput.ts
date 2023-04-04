import {QueueExecutor} from '../../utility/QueueExecutor.js';
import {Utility} from '../../utility/Utility.js';
import {ILoggerData, LogLevel} from './Logger.js';

export interface ILoggerOutputOptions {
  levels?: LogLevel[];
}

abstract class LoggerOutput {
  constructor(options: ILoggerOutputOptions) {
    this.executor_ = new QueueExecutor();
    this.options_ = options;
    this.executor_.start();
  }

  protected abstract output(log: ILoggerData): Promise<void>;
  log(log: ILoggerData) {
    if (!this.options_.levels || this.options_.levels.includes(log.level)) {
      this.executor_.doJob(async () => {
        await this.output(log);
      }).catch(Utility.null);
    }

    if (this.next_)
      this.next_.log(log);
  }

  private executor_: QueueExecutor;
  private next_: LoggerOutput | undefined;
  private options_: ILoggerOutputOptions;
}

export {LoggerOutput};
