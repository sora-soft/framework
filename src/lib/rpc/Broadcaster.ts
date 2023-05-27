import {Connector} from './Connector.js';
import {Route} from './Route.js';
import {ConvertRouteMethod, IRequestOptions} from './ProviderManager.js';
import {Notify} from './Notify.js';
import {ConnectorState} from '../../Enum.js';
import {Runtime} from '../Runtime.js';
import {Logger} from '../logger/Logger.js';
import {ExError} from '../../utility/ExError.js';
import {Subscription} from 'rxjs';

class Broadcaster<T extends Route> {
  constructor() {
    this.connectors_ = new Map();
    this.subscriptionMap_ = new WeakMap();
  }

  registerConnector(method: keyof T, connector: Connector) {
    if (!connector.session)
      return;

    let handler = this.connectors_.get(connector.session);
    if (!handler) {
      handler = {
        connector,
        methods: new Set(),
      };
    }

    handler.methods.add(method as string);
    this.connectors_.set(connector.session, handler);

    const sub = connector.stateSubject.subscribe((state) => {
      switch (state) {
        case ConnectorState.ERROR:
        case ConnectorState.STOPPING:
        case ConnectorState.STOPPED:
          if (connector.session) {
            this.removeConnector(connector.session);
          }
          break;
      }
    });
    this.subscriptionMap_.set(connector, sub);
  }

  removeConnector(session: string) {
    const unit = this.connectors_.get(session);
    if (!unit)
      return;
    const sub = this.subscriptionMap_.get(unit.connector);
    sub?.unsubscribe();
    this.connectors_.delete(session);
  }

  unregisterConnector(method: string, session: string) {
    const handler = this.connectors_.get(session);
    if (!handler) {
      return;
    }

    handler.methods.delete(method);

    if (!handler.methods.size)
      this.connectors_.delete(session);
  }

  notify(fromId?: string, toSession?: string[]): ConvertRouteMethod<T> {
    return new Proxy<ConvertRouteMethod<T>>({} as ConvertRouteMethod<T>, {
      get: (target, prop: string) => {
        return async (body: unknown, options: IRequestOptions = {}) => {
          for (const [session, handler] of this.connectors_) {
            if (toSession && !toSession.includes(session))
              continue;

            if (!handler.methods.has(prop))
              continue;

            if (!options)
              options = {};

            const notify = new Notify({
              service: '',
              method: prop,
              payload: body,
              headers: options.headers || {},
            });
            await handler.connector.sendNotify(notify, fromId).catch((err: ExError) => {
              Runtime.frameLogger.error('broadcaster', err, {event: 'broadcast-sender-notify', error: Logger.errorMessage(err)});
            });
          }
        };
      },
    });
  }


  private connectors_: Map<string, {
    connector: Connector;
    methods: Set<string>;
  }>;
  private subscriptionMap_: WeakMap<Connector, Subscription>;
}

export {Broadcaster};
