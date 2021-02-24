import {Sender} from './Sender'
import {Route} from './Route';
import {ConvertRouteMethod, IRequestOptions} from './Provider';
import {Notify} from './Notify';
import {LifeCycleEvent} from '../../Event';
import {SenderState} from '../../Enum';
import {Runtime} from '../Runtime';
import {Logger} from '../logger/Logger';

class Broadcaster<T extends Route> {
  constructor() {
    this.senders_ = new Map();
  }

  registerSender(method: keyof T, sender: Sender) {
    let handler = this.senders_.get(sender.session);
    if (!handler) {
      handler = {
        sender,
        methods: new Set()
      };
    }

    handler.methods.add(method as string);
    this.senders_.set(sender.session, handler);

    sender.stateEmitter.on(LifeCycleEvent.StateChangeTo, (state) => {
      switch (state) {
        case SenderState.ERROR:
        case SenderState.STOPPING:
        case SenderState.STOPPED:
          this.unregisterSender(sender.session);
          break;
      }
    });
  }

  unregisterSender(session: string) {
    this.senders_.delete(session);
  }

  notify(fromId: string): ConvertRouteMethod<T> {
    return new Proxy<ConvertRouteMethod<T>>({} as any, {
      get: (target, prop: string, receiver) => {
        return async (body: unknown, options: IRequestOptions = {}) => {
          for (const [session, handler] of this.senders_) {
            if (!handler.methods.has(prop))
              continue;

            if (!options)
              options = {};

            const notify = new Notify({
              method: prop,
              payload: body,
              headers: options.headers || {},
            });
            await handler.sender.sendNotify(notify, fromId).catch(err => {
              Runtime.frameLogger.error('broadcaster', err, {event: 'broadcast-sender-notify-error', error: Logger.errorMessage(err)});
            });
          }
        };
      }
    })
  }


  private senders_: Map<string, {
    sender: Sender,
    methods: Set<string>;
  }>;
}

export {Broadcaster}
