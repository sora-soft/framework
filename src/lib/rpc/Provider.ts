import {ListenerState, ConnectorState} from '../../Enum.js';
import {RPCErrorCode} from '../../ErrorCode.js';
import {IListenerMetaData} from '../../interface/discovery.js';
import {IListenerInfo, IProviderMetaData} from '../../interface/rpc.js';
import {AbortError} from '../../utility/AbortError.js';
import {ExError} from '../../utility/ExError.js';
import {LabelFilter} from '../../utility/LabelFilter.js';
import {Ref} from '../../utility/Ref.js';
import {Utility} from '../../utility/Utility.js';
import {Context} from '../Context.js';
import {Logger} from '../logger/Logger.js';
import {Runtime} from '../Runtime.js';
import {ListenerCallback} from './Listener.js';
import {Notify} from './Notify.js';
import {Request} from './Request.js';
import {Response} from './Response.js';
import {Route} from './Route.js';
import {RPCError} from './RPCError.js';
import {RPCSender} from './RPCSender.js';
import {ConvertRouteMethod, ConvertRPCRouteMethod, IRequestOptions, ProviderManager} from './ProviderManager.js';
import {ILabels} from '../../interface/config.js';
import {BehaviorSubject, map} from 'rxjs';
import {SubscriptionManager} from '../../utility/SubscriptionManager.js';

class Provider<T extends Route = Route> {
  constructor(name: string, filter: LabelFilter = new LabelFilter([]), manager: ProviderManager | null = null, callback?: ListenerCallback) {
    this.name_ = name;
    this.senders_ = new Map();
    this.filter_ = filter;
    this.routeCallback_ = callback;
    this.ref_ = new Ref();
    this.pvdManager_ = manager;
    this.subManager_ = new SubscriptionManager();
    this.senderSubject_ = new BehaviorSubject([]);
    this.startCtx_ = null;
  }

  async shutdown() {
    await this.ref_.minus(async () => {
      this.startCtx_?.abort();
      this.startCtx_ = null;

      this.subManager_.destory();
      await Promise.all([...this.senders_].map(async ([_, sender]) => {
        await sender.connector.off().catch((err: ExError) => {
          Runtime.frameLogger.error(`provider.${this.name_}`, err, {event: 'connector-off', error: Logger.errorMessage(err)});
        });
      }));

      this.pvdManager.removeProvider(this);
      this.senderSubject_.complete();
    }).catch((err: Error) => {
      if (err.message === 'ERR_REF_NEGATIVE')
        Runtime.frameLogger.warn(`provider.${this.name_}`, {event: 'duplicate-stop'});
    });
  }

  async startup(ctx?: Context) {
    await this.ref_.add(async () => {
      this.startCtx_ = new Context(ctx);

      this.pvdManager.addProvider(this);

      const sub = this.pvdManager.discovery.listenerSubject.pipe(
        map(listeners => listeners.filter((listener) => {
          return listener.targetName == this.name && this.filter_.isSatisfy(listener.labels);
        }))
      ).subscribe(async (listeners) => {
        for (const [id, sender] of this.senders_) {
          if (listeners.every(listener => listener.id !== sender.listenerId)) {
            this.removeSender(id).catch((err: ExError) => {
              Runtime.frameLogger.error(this.logCategory, err, {event: 'remove-sender-error', error: Logger.errorMessage(err), name: this.name_});
            });
          }
        }

        for (const listener of listeners) {
          const sender = this.senders_.get(listener.id);
          if (sender) {
            switch(listener.state) {
              case ListenerState.INIT:
              case ListenerState.PENDING:
                break;
              case ListenerState.READY:
                sender.weight = listener.weight;
                if (sender.connector.state === ConnectorState.INIT) {
                  await sender.connector.start(listener).catch((err: ExError) => {
                    if (err instanceof AbortError)
                      return;
                    Runtime.frameLogger.error(this.logCategory, err, {event: 'sender-started-error', error: Logger.errorMessage(err), name: this.name_});
                  });
                }
                break;
              case ListenerState.STOPPING:
              case ListenerState.STOPPED:
              case ListenerState.ERROR:
                this.removeSender(listener.id).catch((err: ExError) => {
                  Runtime.frameLogger.error(this.logCategory, err, {event: 'remove-sender-error', error: Logger.errorMessage(err), name: this.name_});
                });
                break;
            }
          } else {
            if (this.senders_.has(listener.id))
              continue;

            if (listener.state === ListenerState.READY) {
              this.createSender(listener);
            }
          }
        }
      });
      this.subManager_.register(sub);

      this.startCtx_.complete();
      this.startCtx_ = null;
    });
  }

  get name() {
    return this.name_;
  }

  get senders() {
    return this.senders_;
  }

  get isStarted() {
    return this.ref_.count > 0;
  }

  get rpc() {
    return (fromId?: string | null, toId?: string | null) => {
      return new Proxy<ConvertRPCRouteMethod<T>>({} as ConvertRPCRouteMethod<T>, {
        get: (target, prop: string) => {
          if (!this.isStarted)
            throw new RPCError(
              RPCErrorCode.ERR_RPC_PROVIDER_NOT_AVAILABLE,
              'ERR_RPC_PROVIDER_NOT_AVAILABLE'
            );

          return async (
            body: unknown,
            options: IRequestOptions = {},
            raw = false
          ) => {
            const sender = Utility.randomOneByWeight([...this.senders_].map(([_, s]) => {
              return s;
            }).filter((s) => {
              return s.connector.state === ConnectorState.READY && (!toId || s.targetId === toId) && s.connector.isAvailable();
            }), (ele) => ele.weight);

            if (!sender)
              throw new RPCError(RPCErrorCode.ERR_RPC_SENDER_NOT_FOUND, `ERR_RPC_SENDER_NOT_FOUND, method=${prop}`);

            if (!options) options = {};

            const request = new Request({
              service: this.name_,
              method: prop,
              payload: body || {},
              headers: options.headers || {},
            });
            const res = await sender.connector.sendRpc(
              request,
              fromId,
              options.timeout
            );
            const response = new Response(res);
            if (raw) return response;
            return response.payload.result;
          };
        },
      });
    };
  }

  get notify() {
    return (fromId?: string | null, toId?: string | null) => {
      return new Proxy<ConvertRouteMethod<T>>({} as ConvertRPCRouteMethod<T>, {
        get: (target, prop: string) => {
          if (!this.isStarted)
            throw new RPCError(
              RPCErrorCode.ERR_RPC_PROVIDER_NOT_AVAILABLE,
              'ERR_RPC_PROVIDER_NOT_AVAILABLE'
            );

          return async (body: unknown, options: IRequestOptions = {}) => {
            const sender = Utility.randomOne(
              [...this.senders_]
                .map(([_, s]) => {
                  return s;
                })
                .filter((s) => {
                  return (
                    s.connector.state === ConnectorState.READY &&
                    (!toId || s.targetId === toId) &&
                    s.connector.isAvailable()
                  );
                })
            );

            if (!sender)
              throw new RPCError(
                RPCErrorCode.ERR_RPC_SENDER_NOT_FOUND,
                `ERR_RPC_SENDER_NOT_FOUND, method=${prop}`
              );

            if (!options) options = {};

            const notify = new Notify({
              service: this.name,
              method: prop,
              payload: body,
              headers: options.headers || {},
            });
            await sender.connector.sendNotify(notify, fromId);
          };
        },
      });
    };
  }

  get boradcast() {
    return (fromId?: string) => {
      return new Proxy<ConvertRouteMethod<T>>({} as ConvertRouteMethod<T>, {
        get: (target, prop: string) => {
          if (!this.isStarted)
            throw new RPCError(
              RPCErrorCode.ERR_RPC_PROVIDER_NOT_AVAILABLE,
              'ERR_RPC_PROVIDER_NOT_AVAILABLE'
            );

          return async (body: unknown, options?: IRequestOptions) => {
            const targetSet = new Set();
            const senders = [...this.senders_].map(([_, s]) => {
              return s;
            }).filter(s => {
              const available = s.connector.state === ConnectorState.READY && !targetSet.has(s.listenerId) && s.connector.isAvailable();
              if (available) {
                targetSet.add(s.listenerId);
              }
              return available;
            });

            await Promise.all(
              senders.map((s) => {
                if (!options) options = {};

                const notify = new Notify({
                  service: this.name,
                  method: prop,
                  payload: body,
                  headers: options.headers || {},
                });
                return s.connector.sendNotify(notify, fromId);
              })
            );
          };
        },
      });
    };
  }

  createSender(endpoint: IListenerMetaData) {
    const existed = this.senders_.get(endpoint.id);
    if (existed) {
      Runtime.frameLogger.debug(this.logCategory, {
        event: 'remove-exited-sender',
        listener: this.formatLogListener(endpoint),
        targetId: existed.targetId,
        state: existed.connector.state,
        name: this.name_,
      });

      this.removeSender(endpoint.id).catch((err: ExError) => {
        Runtime.frameLogger.error(this.logCategory, err, {event: 'remove-sender-error', error: Logger.errorMessage(err), name: this.name_});
      });
    }

    if (!endpoint.targetId)
      return;

    const sender = this.pvdManager.senderFactory(endpoint.protocol, endpoint.id, endpoint.targetId, endpoint.weight);
    if (!sender)
      return;

    const sub = sender.connector.stateSubject.subscribe(async (state) => {
      Runtime.frameLogger.info(this.logCategory, {event: 'sender-state-change', listenerId: sender.listenerId, targetId: sender.targetId, state});
      switch(state) {
        case ConnectorState.STOPPED:
        case ConnectorState.ERROR:
          this.removeSender(sender.listenerId).catch((err: ExError) => {
            Runtime.frameLogger.error(this.logCategory, err, {event: 'remove-sender-error', error: Logger.errorMessage(err), name: this.name_});
          });
          const runningMeta = await this.pvdManager.discovery.getEndpointById(sender.listenerId);
          if (runningMeta && runningMeta.state === ListenerState.READY) {
            this.reconnect(runningMeta).catch((err: ExError) => {
              Runtime.frameLogger.error(this.logCategory, err, {event: 'reconnect-sender-error', error: Logger.errorMessage(err), name: this.name_});
            });
          }
          break;
      }
    });
    this.subManager_.register(sub);

    Runtime.frameLogger.success(this.logCategory, {
      event: 'sender-created',
      listener: this.formatLogListener(endpoint),
      targetId: sender.targetId,
      name: this.name_,
    });

    this.senders_.set(endpoint.id, sender);
    if (this.routeCallback_)
      sender.connector.enableResponse(this.routeCallback_);

    if (endpoint.state === ListenerState.READY) {
      sender.connector.start(endpoint).catch((err: Error) => {
        if (err instanceof AbortError) return;
        Runtime.frameLogger.error(this.logCategory, err, {event: 'sender-started-failed', error: Logger.errorMessage(err), name: this.name_});
      });
    }

    this.senderSubject_.next([...this.senders_].map(([_, s]) => s));

    return sender;
  }

  async removeSender(id: string) {
    const sender = this.senders_.get(id);
    if (!sender) return;

    Runtime.frameLogger.info(this.logCategory, {event: 'remove-sender', name: this.name_, id});
    this.senders_.delete(id);

    this.senderSubject_.next([...this.senders_].map(([_, s]) => s));

    await sender.connector.off().catch((err: ExError) => {
      Runtime.frameLogger.error(this.logCategory, err, {event: 'sender-stop-failed', error: Logger.errorMessage(err), name: this.name_});
    });
  }

  isSatisfy(labels: ILabels) {
    return this.filter_.isSatisfy(labels);
  }

  getSender(targetId: string) {
    for (const sender of this.senderList_) {
      if (sender.targetId === targetId)
        return sender;
    }
    return null;
  }

  get metaData(): IProviderMetaData {
    return Utility.deepCopy({
      name: this.name,
      filter: this.filter_.filter,
      senders: this.senderList_.map(sender => sender.metaData),
    });
  }

  get senderSubject() {
    return this.senderSubject_;
  }

  private get senderList_() {
    return [...this.senders_].map(([_, sender]) => sender);
  }

  private async reconnect(meta: IListenerMetaData) {
    Runtime.frameLogger.info(this.logCategory, {
      event: 'reconnect-sender',
      name: this.name,
      id: meta.id,
    });
    this.createSender(meta);
  }

  private get logCategory() {
    return `provider.${this.name_}`;
  }

  private formatLogListener(listener: IListenerInfo) {
    return {protocol: listener.protocol, endpoint: listener.endpoint};
  }

  private get pvdManager() {
    return this.pvdManager_ || Runtime.pvdManager;
  }

  private name_: string;
  private senders_: Map<string /* endpoint id*/, RPCSender>;
  private filter_: LabelFilter;
  private routeCallback_: ListenerCallback | undefined;
  private ref_: Ref<void>;
  private startCtx_: Context | null;
  private pvdManager_: ProviderManager | null;
  private subManager_: SubscriptionManager;
  protected senderSubject_: BehaviorSubject<RPCSender[]>;
}

export {Provider};
