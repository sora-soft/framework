import EventEmitter = require('events');
import {LifeCycleEvent} from '../Event';

export type LifeCycleHandler = (...args: any) => Promise<void>;

class LifeCycle<T> extends EventEmitter {

  static stateChangeEvent(state: number) {
    return `state-change:${state}`;
  }

  async setState(state: T, ...args: any[]) {
    const preState = this.state_;
    this.state_ = state;
    this.emit(LifeCycleEvent.StateChange, preState, state, ...args);
    this.emit(LifeCycleEvent.StateChangeTo, state, ...args);
    this.emit(LifeCycle.stateChangeEvent(state as any), ...args);
    const handlers = this.handlers_.get(state) || [];
    for (const handler of handlers) {
      await handler(...args);
    }
  }

  addHandler(state: T, handler: LifeCycleHandler) {
    const handlers = this.handlers_.get(state) || [];
    this.handlers_.set(state, handlers);
    handlers.push(handler);
  }

  get state() {
    return this.state_;
  }

  private state_: T;
  private handlers_: Map<T, LifeCycleHandler[]> = new Map();
}

export {LifeCycle}
