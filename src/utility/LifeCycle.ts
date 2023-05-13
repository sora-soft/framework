import EventEmitter = require('events');
import {LifeCycleEvent} from '../Event.js';
import {IEventEmitter} from '../interface/event.js';
import {Context} from '../lib/Context.js';
import {ExError} from './ExError.js';
import {ErrorLevel} from '../Enum.js';

export type LifeCycleHandler = (context: Context, ...args: any) => Promise<void>;
export type LifeCycleAllHandler<T> = (context: Context, state: T, ...args: any) => Promise<void>;

export interface ILifeCycleEvent<T> {
  [LifeCycleEvent.StateChange]: (preState: T, state: T, ...args) => void;
  [LifeCycleEvent.StateChangeTo]: (state: T, ...args) => void;
}

class LifeCycle<T extends number> {
  constructor(state: T, backtrackable = true) {
    this.state_ = state;
    this.backtrackable_ = backtrackable;
    this.emitter_ = new EventEmitter();
    this.context_ = null;
  }

  async setState(state: T, ...args: unknown[]) {
    this.context_?.abort();

    this.context_ = new Context();
    return this.context_.run(async (context) => {
      const preState = this.state;
      if (preState > state && !this.backtrackable_) {
        throw new ExError('ERR_LIFE_CYCLE_CAN_NOT_BACKTACK', 'LifeCycleError', `ERR_LIFE_CYCLE_CAN_NOT_BACKTACK,pre=${preState},new=${state}`, null, ErrorLevel.UNEXPECTED, {preState, state});
      }
      if (preState === state)
        return;
      this.state_ = state;
      for (const handler of this.allHandlers_) {
        await context.await(handler(context, state, ...args));
      }
      const handlers = this.handlers_.get(state) || [];
      for (const handler of handlers) {
        await context.await(handler(context, ...args));
      }
      this.emitter_.emit(LifeCycleEvent.StateChange, preState, state, ...args);
      this.emitter_.emit(LifeCycleEvent.StateChangeTo, state, ...args);
    });
  }

  addAllHandler(handler: LifeCycleAllHandler<T>) {
    this.allHandlers_.add(handler);
  }

  addHandler(state: T, handler: LifeCycleHandler) {
    const handlers = this.handlers_.get(state) || [];
    this.handlers_.set(state, handlers);
    handlers.push(handler);
  }

  destory() {
    this.handlers_.clear();
    this.allHandlers_.clear();
    this.emitter_.removeAllListeners();
  }

  get state() {
    if (this.state_ === null) {
      throw new ExError('ERR_LIFE_CYCLE_CAN_NOT_BACKTACK', 'LifeCycleError', 'ERR_LIFECYCLE_IS_DESTORYED');
    }
    return this.state_ ;
  }

  get emitter() {
    return this.emitter_;
  }

  private state_: T | null;
  private handlers_: Map<T, LifeCycleHandler[]> = new Map();
  private allHandlers_: Set<LifeCycleAllHandler<T>> = new Set();
  private emitter_: IEventEmitter<ILifeCycleEvent<T>>;
  private backtrackable_: boolean;
  private context_: Context | null;
}

export {LifeCycle};
