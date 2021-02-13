export enum WorkerState {
  INIT = 1,
  PENDING,
  READY,
  STOPPING,
  STOPPED,
  ERROR = 100,
}

export enum WorkerStopReason {}

export enum ListenerState {
  INIT = 1,
  PENDING,
  READY,
  ERROR,
}
