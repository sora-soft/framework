import {ILoggerData, LogLevel} from './Logger.js';
import chalk = require('chalk');
import {ILoggerOutputOptions, LoggerOutput} from './LoggerOutput.js';

export interface IConsoleOutputOptions extends ILoggerOutputOptions {
  colors?: {
    [key in LogLevel]?: chalk.Chalk
  };
}

class ConsoleOutput extends LoggerOutput {
  constructor(options: IConsoleOutputOptions) {
    super(options);
    this.consoleOptions_ = options;
  }

  async output(data: ILoggerData) {
    let wrapper: chalk.Chalk | undefined = chalk.white;
    if (this.consoleOptions_.colors && this.consoleOptions_.colors[data.level]) {
      wrapper = this.consoleOptions_.colors[data.level];
    } else {
      switch(data.level) {
        case LogLevel.debug:
          wrapper = chalk.grey;
          break;
        case LogLevel.warn:
          wrapper = chalk.yellow;
          break;
        case LogLevel.info:
          wrapper = chalk.cyan;
          break;
        case LogLevel.success:
          wrapper = chalk.green;
          break;
        case LogLevel.error:
          wrapper = chalk.red;
          break;
        case LogLevel.fatal:
          wrapper = chalk.bgRed;
          break;
      }
    }

    if (!wrapper) {
      wrapper = chalk.white;
    }

    // eslint-disable-next-line no-console
    console.log(wrapper(`${data.timeString},${data.level},${data.identify},${data.category},${data.position},${data.content}`));
  }

  async end() {}

  protected consoleOptions_: IConsoleOutputOptions;
}

export {ConsoleOutput};
