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
  OPERATION = 4,
}

export enum ConnectorState {
  INIT = 1,
  CONNECTING,
  READY,
  STOPPING,
  STOPPED,
  ERROR = 100,
}

export enum ErrorLevel {
  FATAL = 'fatal',
  UNEXPECTED = 'unexpected',
  NORMAL = 'normal',
  EXPECTED = 'expected',
}

export enum ConnectorCommand {
  OFF = 'off',
  ERROR = 'error',
  PING = 'ping',
  PONG = 'pong',
}

