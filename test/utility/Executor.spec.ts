import {describe, it} from 'mocha';
import assert = require('assert');
import {Executor} from '../../src/utility/Executor';
import {Time} from '../../src/utility/Time';

describe('Executor', () => {
  const executor = new Executor();

  describe('start', () => {
    executor.start();

    it('state check', () => {
      // @ts-ignore
      assert.strictEqual(executor.isStopped_, false);
    });
  })

  describe('doJob', () => {
    let funcReturn = null;
    let funcCalled = false;
    it('call doJob', async () => {
      funcReturn = await executor.doJob(async () => {
        funcCalled = true;
        return 'test';
      });
    });

    it('job should be called', () => {
      assert.strictEqual(funcCalled, true);
    });

    it('func should return', () => {
      assert.strictEqual(funcReturn, 'test');
    });
  });

  describe('stop', () => {
    it('should wait all job end', async () => {
      let jobCalled = false;
      executor.doJob(async () => {
        await Time.timeout(100);
        jobCalled = true;
      });
      await executor.stop();
      assert.strictEqual(jobCalled, true);
    });

    it('state check', () => {
      // @ts-ignore
      assert.strictEqual(executor.isStopped_, true);
    });
  });
});
