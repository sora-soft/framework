export interface ITCPListenerOptions {
  portRange?: number[];
  port?: number;
  host: string;
  exposeHost?: string;
}

export interface INodeOptions extends IServiceOptions {
  api: ITCPListenerOptions;
}

export interface ILabels {
  [key: string]: string;
}

export interface IServiceOptions {
  labels?: ILabels;
}

export interface IWorkerOptions {}

export interface IRuntimeOptions {
  scope: string;
}
