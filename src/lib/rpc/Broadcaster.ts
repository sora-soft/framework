import {Connector} from './Connector'
import {Route} from './Route';
import {ConvertRouteMethod, IRequestOptions} from './Provider';
import {Notify} from './Notify';
import {LifeCycleEvent} from '../../Event';
import {ConnectorState} from '../../Enum';
import {Runtime} from '../Runtime';
import {Logger} from '../logger/Logger';

class Broadcaster<T extends Route> {
  constructor() {
    this.connectors_ = new Map();
  }

  registerConnector(method: keyof T, connector: Connector) {
    let handler = this.connectors_.get(connector.session);
    if (!handler) {
      handler = {
        connector,
        methods: new Set()
      };
    }

    handler.methods.add(method as string);
    this.connectors_.set(connector.session, handler);

    connector.stateEmitter.on(LifeCycleEvent.StateChangeTo, (state) => {
      switch (state) {
        case ConnectorState.ERROR:
        case ConnectorState.STOPPING:
        case ConnectorState.STOPPED:
          this.unregisterConnector(connector.session);
          break;
      }
    });
  }

  unregisterConnector(session: string) {
    this.connectors_.delete(session);
  }

  notify(fromId?: string, toSession?: string[]): ConvertRouteMethod<T> {
    return new Proxy<ConvertRouteMethod<T>>({} as any, {
      get: (target, prop: string, receiver) => {
        return async (body: unknown, options: IRequestOptions = {}) => {
          for (const [session, handler] of this.connectors_) {
            if (toSession && !toSession.includes(session))
              continue;

            if (!handler.methods.has(prop))
              continue;

            if (!options)
              options = {};

            const notify = new Notify({
              method: prop,
              payload: body,
              path: '',
              headers: options.headers || {},
            });
            await handler.connector.sendNotify(notify, fromId).catch(err => {
              Runtime.frameLogger.error('broadcaster', err, {event: 'broadcast-sender-notify', error: Logger.errorMessage(err)});
            });
          }
        };
      }
    })
  }


  private connectors_: Map<string, {
    connector: Connector,
    methods: Set<string>;
  }>;
}

export {Broadcaster}
