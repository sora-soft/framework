export interface IEventEmitter<T extends {[key: string]: any}> {
  on<U extends keyof T>(
    event: U, listener: T[U]
  ): this;

  emit<U extends keyof T>(
    event: U, ...args: Parameters<T[U]>
  ): boolean;
}
