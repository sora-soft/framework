export interface ITCPListenerOptions {
  readonly portRange?: number[];
  readonly port?: number;
  readonly host: string;
  readonly exposeHost?: string;
}

export interface INodeOptions extends IServiceOptions {
  readonly api: ITCPListenerOptions;
}

export interface ILabels {
  readonly [key: string]: string;
}

export interface IServiceOptions {
  readonly labels?: ILabels;
}

export interface IWorkerOptions {}

export interface IRuntimeOptions {
  readonly scope: string;
}
