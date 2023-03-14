import {IServiceOptions} from '../interface/config';
import {ExError} from '../utility/ExError';
import {Context} from './Context';
import {Election} from './Election';
import {Logger} from './logger/Logger';
import {Runtime} from './Runtime';
import {Service} from './Service';

abstract class SingletonService extends Service {
  constructor(name: string,  options: IServiceOptions) {
    super(name, options);
    this.election_ = Runtime.discovery.createElection(this.name);
  }

  async start(context?: Context) {
    await this.election_.campaign(context);
    return super.start(context);
  }

  async stop(reason: string) {
    this.election_.resign().catch((e: ExError) => {
      Runtime.frameLogger.error(this.logCategory, e, {event: 'resign-error', err: Logger.errorMessage(e)});
    });
    return super.stop(reason);
  }

  protected onError(err: Error) {
    this.election_.resign().catch((e: ExError) => {
      Runtime.frameLogger.error(this.logCategory, e, {event: 'resign-error', err: Logger.errorMessage(e)});
    });
    return super.onError(err);
  }

  private election_: Election<string>;
}

export {SingletonService};
