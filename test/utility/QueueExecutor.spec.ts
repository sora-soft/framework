import {describe, it} from 'mocha';
import assert = require('assert');
import {Time} from '../../src/utility/Time';
import {QueueExecutor} from '../../src/utility/QueueExecutor';

describe('QueueExecutor', () => {
  const executor = new QueueExecutor();
  executor.start();
  describe('doJob', () => {
    let callCounter = 0;
    it('should do job in queue', async () => {
      executor.doJob(async () => {
        await Time.timeout(100);
        callCounter++;
        assert.deepStrictEqual(callCounter, 1);
      });
      executor.doJob(async () => {
        callCounter++;
        assert.deepStrictEqual(callCounter, 2);
      });
      await executor.stop();
    });

    it('should called job', () => {
      assert.notDeepStrictEqual(callCounter, 0);
    });
  })
})
