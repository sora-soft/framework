export enum WorkerState {
  INIT = 1,
  PENDING,
  READY,
  BUSY,
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
  OPERATION = 4,
}

export enum ConnectorState {
  INIT = 1,
  READY,
  STOPPING,
  STOPPED,
  ERROR = 100,
  RECONNECTING,
}

export enum ErrorLevel {
  FATAL = -1,
  UNEXPECTED = 0,
  NORMAL = 1,
  EXPECTED = 2,
}

export enum ConnectorCommand {
  off = 'off',
  error = 'error',
  restart = 'restart',
  ping = 'ping',
  pong = 'pong',
}

