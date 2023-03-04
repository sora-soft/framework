class Timer {
  async timeout(timeMS: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        const index = this.timers_.indexOf(timer);
        if (index > -1)
          this.timers_.splice(index, 1);
        resolve();
      }, timeMS);
      this.timers_.push(timer);
    });
  }

  clearAll() {
    for(const timer of this.timers_) {
      clearTimeout(timer);
    }
    this.timers_.length = 0;
  }

  private timers_: NodeJS.Timer[] = [];
}

export {Timer};
