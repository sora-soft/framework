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
  STOPPING,
  STOPPED,
  ERROR = 100,
}

export enum OPCode {
  REQUEST = 1,
  RESPONSE = 2,
  NOTIFY = 3,
}

export enum SenderState {
  INIT = 1,
  READY,
  STOPPING,
  STOPPED,
  ERROR = 100,
}
