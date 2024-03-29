import {IWorkerOptions} from '../index.js';
import {ExError} from '../utility/ExError.js';
import {Context} from './Context.js';
import {Election} from './Election.js';
import {Logger} from './logger/Logger.js';
import {Runtime} from './Runtime.js';
import {Worker} from './Worker.js';

abstract class SingletonWorker extends Worker {
  constructor(name: string, options: IWorkerOptions) {
    super(name, options);
    this.election_ = Runtime.discovery.createElection(`worker/${this.name}`);
  }

  async start(context?: Context) {
    await this.election_.campaign(this.id, context);
    return super.start(context);
  }

  async stop(reason: string) {
    await super.stop(reason);
    await this.election_.resign().catch((e: ExError) => {
      Runtime.frameLogger.error(this.logCategory, e, {event: 'resign-error', err: Logger.errorMessage(e)});
    });
  }

  protected onError(err: Error) {
    this.election_.resign().catch((e: ExError) => {
      Runtime.frameLogger.error(this.logCategory, e, {event: 'resign-error', err: Logger.errorMessage(e)});
    });
    return super.onError(err);
  }

  private election_: Election;
}

export {SingletonWorker};
