class Time {
  static timeout(timeMS: number) {
    let callback: ((value: void | PromiseLike<void>) => void) | null = null;

    const timer: NodeJS.Timeout = setTimeout(() => {
      if (callback) {
        callback();
      }
    }, timeMS);

    const promise = new Promise<void>((resolve) => {
      callback = resolve;
    });

    return {
      timer,
      promise,
    };
  }
}

export {Time}
