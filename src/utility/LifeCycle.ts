import EventEmitter = require('events');
import {FrameworkErrorCode} from '../ErrorCode';
import {LifeCycleEvent} from '../Event';
import {IEventEmitter} from '../interface/event';
import {FrameworkError} from '../lib/FrameworkError';
import {ExError} from './ExError';

export type LifeCycleHandler = (...args: any) => Promise<void>;
export type LifeCycleAllHandler<T> = (state: T, ...args: any) => Promise<void>;

export interface ILifeCycleEvent<T> {
  [LifeCycleEvent.StateChange]: (preState: T, state: T, ...args) => void;
  [LifeCycleEvent.StateChangeTo]: (state: T, ...args) => void;
}

class LifeCycle<T extends number> {
  constructor(state: T, backtrackable = false) {
    this.state_ = state;
    this.backtrackable_ = backtrackable;
    this.emitter_ = new EventEmitter();
  }

  async setState(state: T, ...args: any[]) {
    const preState = this.state;
    if (preState > state && !this.backtrackable_) {
      throw new ExError('ERR_LIFE_CYCLE_CAN_NOT_BACKTACK', 'LifeCycleError', `ERR_LIFE_CYCLE_CAN_NOT_BACKTACK,pre=${preState},new=${state}`);
    }
    if (preState === state)
      return;
    this.state_ = state;
    for (const handler of this.allHandlers_) {
      await handler(state, ...args);
    }
    const handlers = this.handlers_.get(state) || [];
    for (const handler of handlers) {
      await handler(...args);
    }
    this.emitter_.emit(LifeCycleEvent.StateChange, preState, state, ...args);
    this.emitter_.emit(LifeCycleEvent.StateChangeTo, state, ...args);
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
      throw new FrameworkError(FrameworkErrorCode.ERR_LIFECYCLE_IS_DESTORYED, `ERR_LIFECYCLE_IS_DESTORYED`);
    }
    return this.state_ as T;
  }

  get emitter() {
    return this.emitter_;
  }

  private state_: T | null;
  private handlers_: Map<T, LifeCycleHandler[]> = new Map();
  private allHandlers_: Set<LifeCycleAllHandler<T>> = new Set();
  private emitter_: IEventEmitter<ILifeCycleEvent<T>>;
  private backtrackable_: boolean;
}

export {LifeCycle}
