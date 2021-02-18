import {describe, it} from 'mocha';
import assert = require('assert');
import {LifeCycle} from '../../src/utility/LifeCycle';
import {LifeCycleEvent} from '../../src/Event';

enum TestState {
  STATE1,
  STATE2,
  STATE3
}

describe('LifeCycle', () => {
  describe('event emitter', () => {
    const lifeCycle = new LifeCycle<TestState>();
    let stateChangeEventCalled = false;

    lifeCycle.on(LifeCycleEvent.StateChange, (pre, current) => {
      assert.strictEqual(pre, undefined);
      assert.strictEqual(current, TestState.STATE1);
    });

    lifeCycle.on(LifeCycleEvent.StateChangeTo, (state) => {
      assert.strictEqual(state, TestState.STATE1);
    });

    lifeCycle.on(LifeCycle.stateChangeEvent(TestState.STATE1), () => { stateChangeEventCalled = true });

    it('setState', async () => {
      await lifeCycle.setState(TestState.STATE1);
      assert.strictEqual(stateChangeEventCalled, true);
    });
  });

  describe('handler', () => {
    const lifeCycle = new LifeCycle<TestState>();
    const eventArg = 'test';
    let handlerCalled = false;

    it('addHandler', () => {
      lifeCycle.addHandler(TestState.STATE1, async (arg: string) => {
        assert.strictEqual(arg, eventArg);
        handlerCalled = true;
      });
    });

    it('call handler', () => {
      lifeCycle.setState(TestState.STATE1, eventArg);
    });
  });
});
