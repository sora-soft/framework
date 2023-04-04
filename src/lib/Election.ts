import {BehaviorSubject} from 'rxjs';
import {Context} from './Context.js';

abstract class Election {
  constructor(name: string) {
    this.name_ = name;
  }

  abstract campaign(id: string, context?: Context): Promise<void>;
  abstract resign(): Promise<void>;
  abstract leader(): Promise<string | undefined>;
  abstract observer(): BehaviorSubject<string | undefined>;

  get name() {
    return this.name_;
  }

  get id() {
    return this.id_;
  }

  private name_: string;
  private id_: string | undefined;
}

export {Election};
