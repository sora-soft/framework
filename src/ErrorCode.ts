export enum FrameworkErrorCode {
  ERR_FRAMEWORK_UNKNOWN = 'ERR_FRAMEWORK_UNKNOWN',
  ERR_SERVICE_NOT_FOUND = 'ERR_SERVICE_NOT_FOUND',
  ERR_WORKER_NOT_FOUND = 'ERR_WORKER_NOT_FOUND',
  ERR_NODE_SERVICE_CANNOT_BE_CLOSED = 'ERR_NODE_SERVICE_CANNOT_BE_CLOSED',
  ERR_NODE_SERVICE_CANNOT_BE_CREATED = 'ERR_NODE_SERVICE_CANNOT_BE_CREATED',
  ERR_COMPONENT_OPTIONS_NOT_SET = 'ERR_COMPONENT_OPTIONS_NOT_SET',
  ERR_DUPLICATED_COMPONENT = 'ERR_DUPLICATED_COMPONENT',
}

export enum RPCErrorCode {
  ERR_RPC_UNKNOWN = 'ERR_RPC_UNKNOWN',
  ERR_RPC_TIMEOUT = 'ERR_RPC_TIMEOUT',
  ERR_RPC_TUNNEL_NOT_AVAILABLE = 'ERR_RPC_TUNNEL_NOT_AVAILABLE',
  ERR_RPC_SENDER_NOT_FOUND = 'ERR_RPC_SENDER_NOT_FOUND',
  ERR_RPC_SENDER_CAN_NOT_CONNECT = 'ERR_RPC_SENDER_CAN_NOT_CONNECT',
  ERR_RPC_SENDER_INNER = 'ERR_RPC_SENDER_INNER',
  ERR_RPC_PROVIDER_NOT_AVAILABLE = 'ERR_RPC_PROVIDER_NOT_AVAILABLE',
  ERR_RPC_METHOD_NOT_FOUND = 'ERR_RPC_METHOD_NOT_FOUND',
  ERR_RPC_PARAMTER_INVALID = 'ERR_RPC_PARAMTER_INVALID',
}

export enum RetryErrorCode {
  ERR_RETRY_TOO_MANY_RETRY = 'ERR_RETRY_TOO_MANY_RETRY',
}

export enum TCPErrorCode {
  ERR_NO_AVAILABLE_PORT = 'ERR_NO_AVAILABLE_PORT',
}
