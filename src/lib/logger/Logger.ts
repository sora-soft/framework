import {LoggerOutput} from './LoggerOutput';
import {parse, StackFrame} from 'error-stack-parser';
import path = require('path');
import {Utility} from '../../utility/Utility';

export interface ILoggerOptions {
  identify: string;
}

export interface ILoggerData {
  time: Date,
  timeString: string;
  identify: string;
  category: string;
  level: LogLevel;
  error?: Error;
  content: string;
  position: string;
  stack: StackFrame[];
  raw: any[];
  pid: number;
}

export enum LogLevel {
  debug = 1,
  info,
  success,
  warn,
  error,
  fatal,
}

abstract class Logger {
  private static getStackPosition(depth: number) {
    const my = new Error();
    Error.captureStackTrace(my);
    return parse(my)[depth];
  }

  private static getStack() {
    const my = new Error();
    Error.captureStackTrace(my);
    return parse(my);
  }

  static errorMessage(e: Error) {
    return {code: e['code'], name: e.name, message: e.message};
  }

  constructor(options: ILoggerOptions) {
    this.options_ = options;
    this.output_ = [];
  }

  debug(category: string, ...args) {
    this.write(LogLevel.debug, category, null, ...args);
  }

  info(category: string, ...args) {
    this.write(LogLevel.info, category, null, ...args);
  }

  warn(category: string, ...args) {
    this.write(LogLevel.warn, category, null, ...args);
  }

  success(category: string, ...args) {
    this.write(LogLevel.success, category, null, ...args);
  }

  error(category: string, error: Error, ...args) {
    this.write(LogLevel.error, category, error, ...args);
  }

  fatal(category: string, error: Error, ...args) {
    this.write(LogLevel.fatal, category, error, ...args);
  }

  pipe(output: LoggerOutput) {
    this.output_.push(output);
    return this;
  }

  private write(level: LogLevel, category: string, error: Error, ...args) {
    const now = new Date();
    const stack = error ? parse(error)[0] : Logger.getStackPosition(3);
    const timeString = Utility.formatLogTimeString(now);
    for (const output of this.output_) {
      output.log({
        time: now,
        identify: this.options_.identify,
        category,
        timeString,
        level,
        error,
        pid: process.pid,
        content: this.generateContent(...args),
        stack: Logger.getStack(),
        position: `${path.basename(stack.fileName)}:${stack.lineNumber}:${stack.functionName}`,
        raw: args,
      });
    }
  }

  private generateContent(...args: any[]) {
    return args.map((value) => {
      return JSON.stringify(value);
    }).join(',');
  }

  private options_: ILoggerOptions;
  private output_: LoggerOutput[];
}

export {Logger}
