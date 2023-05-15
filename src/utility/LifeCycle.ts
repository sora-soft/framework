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
  }

  setState(state: T, ...args: unknown[]) {
    const preState = this.state;
    if (preState > state && !this.backtrackable_) {
      throw new ExError('ERR_LIFE_CYCLE_CAN_NOT_BACKTACK', 'LifeCycleError', `ERR_LIFE_CYCLE_CAN_NOT_BACKTACK,pre=${preState},new=${state}`, null, ErrorLevel.UNEXPECTED, {preState, state});
    }
    if (preState === state)
      return;
    this.state_ = state;
    this.emitter_.emit(LifeCycleEvent.StateChange, preState, state, ...args);
    this.emitter_.emit(LifeCycleEvent.StateChangeTo, state, ...args);
  }

  destory() {
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
  private emitter_: IEventEmitter<ILifeCycleEvent<T>>;
  private backtrackable_: boolean;
}

export {LifeCycle};
