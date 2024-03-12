import {ExError} from './ExError.js';
import {ErrorLevel} from '../Enum.js';
import {BehaviorSubject} from 'rxjs';

class LifeCycle<T extends number> {
  constructor(state: T, backTrackable = true) {
    this.state_ = state;
    this.backTrackable_ = backTrackable;
    this.stateSubject_ = new BehaviorSubject(state);
  }

  setState(state: T) {
    const preState = this.state;
    if (preState > state && !this.backTrackable_) {
      throw new ExError('ERR_LIFE_CYCLE_CAN_NOT_BACKTACK', 'LifeCycleError', `ERR_LIFE_CYCLE_CAN_NOT_BACKTACK,pre=${preState},new=${state}`, ErrorLevel.UNEXPECTED, null, {preState, state});
    }
    if (preState === state)
      return;
    this.state_ = state;
    this.stateSubject_.next(state);
  }

  destroy() {
    this.stateSubject_.complete();
  }

  get state() {
    if (this.state_ === null) {
      throw new ExError('ERR_LIFE_CYCLE_CAN_NOT_BACKTACK', 'LifeCycleError', 'ERR_LIFECYCLE_IS_DESTROYED');
    }
    return this.state_ ;
  }

  get stateSubject() {
    return this.stateSubject_;
  }

  private state_: T | null;
  private backTrackable_: boolean;
  private stateSubject_: BehaviorSubject<T>;
}

export {LifeCycle};
