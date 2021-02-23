import {ILoggerData, LogLevel} from './Logger';
import chalk = require('chalk');
import {ILoggerOutputOptions, LoggerOutput} from './LoggerOutput';

export interface IConsoleOutputOptions extends ILoggerOutputOptions {
  colors?: {
    [key in LogLevel]?: chalk.Chalk
  }
}

class ConsoleOutput extends LoggerOutput {
  constructor(options: IConsoleOutputOptions) {
    super(options);
    this.consoleOptions_ = options;
  }

  async output(data: ILoggerData) {
    let wrapper = chalk.white;
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

    // tslint:disable-next-line: no-console
    console.log(wrapper(`${data.timeString},${data.level},${data.identify},${data.category},${data.position},${data.content}`));
  }

  protected consoleOptions_: IConsoleOutputOptions;
}

export {ConsoleOutput}
