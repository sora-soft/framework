import {BehaviorSubject} from 'rxjs';
import {Context} from './Context';

abstract class Election<T> {
  constructor(name: string, id: T) {
    this.name_ = name;
    this.id_ = id;
  }

  abstract campaign(context?: Context): Promise<void>;
  abstract resign(): Promise<void>;
  abstract isLeader(): Promise<void>;
  abstract observer(): BehaviorSubject<T>;

  get name() {
    return this.name_;
  }

  get id() {
    return this.id_;
  }

  private name_: string;
  private id_: T;
}

export {Election};
