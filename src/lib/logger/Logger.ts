import {LoggerOutput} from './LoggerOutput.js';
import ErrorStackParser from 'error-stack-parser';
import path = require('path');
import {Utility} from '../../utility/Utility.js';
import {ExError} from '../../utility/ExError.js';
import {ErrorLevel} from '../../Enum.js';

export interface ILoggerOptions {
  identify: string;
}

export interface ILoggerData {
  time: Date;
  timeString: string;
  identify: string;
  category: string;
  level: LogLevel;
  error?: Error | null;
  content: string;
  position: string;
  stack: ErrorStackParser.StackFrame[];
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
    return ErrorStackParser.parse(my)[depth];
  }

  private static getStack() {
    const my = new Error();
    Error.captureStackTrace(my);
    return ErrorStackParser.parse(my);
  }

  static errorMessage(e: ExError | Error) {
    const err = ExError.fromError(e);
    try {
      const stack = ErrorStackParser.parse(err).map(frame => {
        return `${frame.functionName || 'unknown'}(${frame.fileName ? frame.fileName.replace(/\\/g, '/') : 'anonymous'}:${frame.lineNumber ? frame.lineNumber : 'NA'})`;
      });
      let cause: unknown = err.cause;
      if (cause instanceof Error) {
        cause = `${cause.name}: ${cause.message}`;
      }
      return {code: err.code, name: err.name, message: err.message, stack, cause, args: err.args};
    } catch (parseError) {
      return e;
    }
  }

  constructor(options: ILoggerOptions) {
    this.options_ = options;
    this.output_ = [];
  }

  debug(category: string, ...args: unknown[]) {
    this.write(LogLevel.debug, category, null, ...args);
  }

  info(category: string, ...args: unknown[]) {
    this.write(LogLevel.info, category, null, ...args);
  }

  warn(category: string, ...args: unknown[]) {
    this.write(LogLevel.warn, category, null, ...args);
  }

  success(category: string, ...args: unknown[]) {
    this.write(LogLevel.success, category, null, ...args);
  }

  error(category: string, error: Error | ExError, ...args: unknown[]) {
    switch (error['level']) {
      case ErrorLevel.FATAL:
        this.fatal(category, error, ...args);
        return;
      case ErrorLevel.EXPECTED:
        this.debug(category, error, ...args);
        return;
      default:
        this.write(LogLevel.error, category, error, ...args);
        return;
    }
  }

  fatal(category: string, error: Error, ...args: unknown[]) {
    this.write(LogLevel.fatal, category, error, ...args);
  }

  pipe(output: LoggerOutput) {
    this.output_.push(output);
    return this;
  }

  async end() {
    await Promise.all(this.output_.map(async (output) => {
      await output.end();
    }));
  }

  private write(level: LogLevel, category: string, error: Error | null | undefined, ...args: unknown[]) {
    const now = new Date();
    let stack = Logger.getStackPosition(3);
    try {
      if (error)
        stack = ErrorStackParser.parse(error)[0];
    } catch(err) {}
    const timeString = Utility.formatLogTimeString();
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
        position: `${stack.fileName ? path.basename(stack.fileName) : 'unknown'}:${stack.lineNumber || '?'}:${stack.functionName || '?'}`,
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

export {Logger};
