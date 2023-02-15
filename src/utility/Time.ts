class Time {
  static timeout(timeMS: number) {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, timeMS);
    });
  }
}

export {Time}
