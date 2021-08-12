import EventEmitter = require('events');
import {LifeCycleEvent} from '../Event';
import {IEventEmitter} from '../interface/event';

export type LifeCycleHandler = (...args: any) => Promise<void>;
export type LifeCycleAllHandler<T> = (state: T, ...args: any) => Promise<void>;

export interface ILifeCycleEvent<T> {
  [LifeCycleEvent.StateChange]: (preState: T, state: T, ...args) => void;
  [LifeCycleEvent.StateChangeTo]: (state: T, ...args) => void;
}

class LifeCycle<T> {
  // static stateChangeEvent(state: number) {
  //   return `state-change:${state}`;
  // }

  constructor(state: T) {
    this.state_ = state;
    this.emitter_ = new EventEmitter();
  }

  async setState(state: T, ...args: any[]) {
    const preState = this.state_;
    this.state_ = state;
    this.emitter_.emit(LifeCycleEvent.StateChange, preState, state, ...args);
    this.emitter_.emit(LifeCycleEvent.StateChangeTo, state, ...args);
    // this.emitter_.emit(LifeCycle.stateChangeEvent(state as any), ...args);
    for (const handler of this.allHandlers_) {
      await handler(state, ...args);
    }
    const handlers = this.handlers_.get(state) || [];
    for (const handler of handlers) {
      await handler(...args);
    }
  }

  addAllHandler(handler: LifeCycleAllHandler<T>) {
    this.allHandlers_.add(handler);
  }

  addHandler(state: T, handler: LifeCycleHandler) {
    const handlers = this.handlers_.get(state) || [];
    this.handlers_.set(state, handlers);
    handlers.push(handler);
  }

  get state() {
    return this.state_;
  }

  get emitter() {
    return this.emitter_;
  }

  private state_: T;
  private handlers_: Map<T, LifeCycleHandler[]> = new Map();
  private allHandlers_: Set<LifeCycleAllHandler<T>> = new Set();
  private emitter_: IEventEmitter<ILifeCycleEvent<T>>;
}

export {LifeCycle}
