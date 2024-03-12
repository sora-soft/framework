import {Subscription} from 'rxjs';

class SubscriptionManager {
  constructor() {
    this.subscriptions_ = new Set();
  }

  register(sub: Subscription) {
    this.subscriptions_.add(sub);
  }

  unregister(sub: Subscription) {
    this.subscriptions_.delete(sub);
  }

  destroy() {
    for (const sub of this.subscriptions_) {
      sub.unsubscribe();
    }
    this.subscriptions_.clear();
  }

  private subscriptions_: Set<Subscription>;
}

export {SubscriptionManager};
