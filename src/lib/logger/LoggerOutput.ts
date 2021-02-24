import {QueueExecutor} from '../../utility/QueueExecutor';
import {ILoggerData, LogLevel} from './Logger';

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
      });
    }

    if (this.next_)
      this.next_.log(log);
  }

  pipe(next: LoggerOutput) {
    this.next_ = next;
    return this.next_;
  }

  private executor_: QueueExecutor;
  private next_: LoggerOutput;
  private options_: ILoggerOutputOptions;
}

export {LoggerOutput}
