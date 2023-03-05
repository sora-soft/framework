export enum LifeCycleEvent {
  StateChange = 'state-change',
  StateChangeTo = 'state-change-to'
}

export enum DiscoveryServiceEvent {
  ServiceCreated = 'service-created',
  ServiceUpdated = 'service-updated',
  ServiceDeleted = 'service-deleted',
  ServiceStateUpdate = 'service-state-update',
}

export enum DiscoveryListenerEvent {
  ListenerCreated = 'listener-created',
  ListenerUpdated = 'listener-updated',
  ListenerDeleted = 'listener-deleted',
  ListenerStateUpdate = 'listener-state-update',
}

export enum DiscoveryNodeEvent {
  NodeCreated = 'node-created',
  NodeUpdated = 'node-updated',
  NodeDeleted = 'node-deleted',
  NodeStateUpdate = 'node-state-update',
}

export enum ListenerEvent {
  NewConnect = 'new-connection',
  LostConnect = 'lost-connection',
}

export enum ListenerWeightEvent {
  WeightChange = 'weight-change',
}

export enum RetryEvent {
  Error = 'retry-error',
  MaxRetryTime = 'max-retry-time',
}

export enum DiscoveryEvent {
  DiscoveryReconnect = 'discovery-reconnect',
}
