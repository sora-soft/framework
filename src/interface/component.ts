export interface IComponentOptions {
  [k: string]: unknown;
}

export interface IComponentMetaData {
  name: string;
  ready: boolean;
  version: string;
  options: IComponentOptions;
}
