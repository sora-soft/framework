import {Worker} from '../../src/lib/Worker';
import {WorkerState} from '../../src/Enum';
import {describe, it} from 'mocha';
import assert = require('assert');
import {Time} from '../../src/utility/Time';

const TestWorkerName = 'test';

describe('Worker', () => {
  describe('constructor', () => {
    class TestWorker extends Worker {
    constructor(name: string) {
      super(name);
    }

    async startup() {
      this.startupCalled = true;
    }

    async afterStartup() {
      this.afterStartupCalled = true;
    }

    async shutdown(reason: string) {
      this.shutdownCalled = true;
      this.shutdownReason = reason;
    }

    public startupCalled = false;
    public afterStartupCalled = false;
    public shutdownCalled = false;
    public shutdownReason = null;
  };
  const worker = new TestWorker(TestWorkerName);
    it('should set name', () => {
      assert.strictEqual(worker.name, TestWorkerName);
    });

    it('should set state', () => {
      assert.strictEqual(worker.state, WorkerState.INIT);
    });

    // it('should set uuid', () => {
    //   assert.strictEqual(worker.uuid, TestWorkerUUID);
    // })
  });

  describe('life cycle', async () => {
    class StartTestWorker extends Worker {

        async startup() {
          this.startupCalled = true;

          assert.strictEqual(this.afterStartupCalled, false, 'startup should called before afterStartup');
          assert.strictEqual(this.state, WorkerState.PENDING);
        }

        async afterStartup() {
          this.afterStartupCalled = true;
          assert.strictEqual(this.state, WorkerState.READY);
        }

        async shutdown(reason: string) {
          this.shutdownCalled = true;
          this.shutdownReason = reason;

          assert.strictEqual(this.state, WorkerState.STOPPING);
        }

        public startupCalled = false;
        public afterStartupCalled = false;
        public shutdownCalled = false;
        public shutdownReason = null;
    }

    // const events = [];
    // function onEvent(event: WorkerEvent) {
    //   return () => {
    //     events.push(event);
    //   }
    // }

    const startTestWorker = new StartTestWorker(TestWorkerName);
    // startTestWorker.stateEventEmitter.on(WorkerEvent.STARTING, onEvent(WorkerEvent.STARTING));
    // startTestWorker.stateEventEmitter.on(WorkerEvent.READY, onEvent(WorkerEvent.READY));
    // startTestWorker.stateEventEmitter.on(WorkerEvent.STOPPING, onEvent(WorkerEvent.STOPPING));
    // startTestWorker.stateEventEmitter.on(WorkerEvent.STOPPED, onEvent(WorkerEvent.STOPPED));
    it('start check', async () => {
      return startTestWorker.start();
    })
    it('startup should be called', () => {
      assert.strictEqual(startTestWorker.startupCalled, true);
    });
    it('afterStartup should be called', () => {
      assert.strictEqual(startTestWorker.afterStartupCalled, true);
    });
    it('stop check', async () => {
      return startTestWorker.stop('test');
    });
    it('shutdown should be called', () => {
      assert.strictEqual(startTestWorker.shutdownCalled, true);
    });
    it('shutdown reason should be record', () => {
      assert.strictEqual(startTestWorker.shutdownReason, 'test');
    });
    it('state should be STOPPED', () => {
      assert.strictEqual(startTestWorker.state, WorkerState.STOPPED);
    });
    // it('event emitter should be called', () => {
    //   assert.deepStrictEqual(events, [WorkerEvent.STARTING, WorkerEvent.READY, WorkerEvent.STOPPING, WorkerEvent.STOPPED]);
    // });
  });

  describe('doJob', async () => {
    class JobWorker extends Worker {
      async startup() {};
      async afterStartup() {};
      async shutdown() {};

      async doTestJob(test: Function) {
        this.jobCounter++;
        await this.doJob(async () => {
          this.jobCalledCounter++;
          test();
          return true;
        });
      };

      async doLaterJob(test: Function) {
        this.jobCounter++;
        await this.doJob(async () => {
          await Time.timeout(1000);
          this.jobCalledCounter++;
          test();
        })
      }

      public jobCalledCounter = 0;
      public jobCounter = 0;
    }

    const jobWorker = new JobWorker(TestWorkerName);
    it ('start job', async () => {
      return jobWorker.start();
    })
    it('job should be called', async () => {
      return jobWorker.doTestJob(() => { assert.strictEqual(jobWorker.jobCalledCounter, 1); });
    });
    it('later job should be called in queue', () => {
      jobWorker.doLaterJob(() => { assert.strictEqual(jobWorker.jobCalledCounter, 2); });
      jobWorker.doTestJob(() => { assert.strictEqual(jobWorker.jobCalledCounter, 3); });
    });
    it('isIdle should return false while doing jobs', () => {
      assert.strictEqual(jobWorker.isIdle, false);
    });
    it('jobCounter should be equal jobCalledCounter', async () => {
      await jobWorker.stop('test');
      assert.strictEqual(jobWorker.jobCalledCounter, jobWorker.jobCounter);
    });
  })
})
