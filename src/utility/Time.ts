import {AbortError} from './AbortError.js';

class Time {
  static timeout(timeMS: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const abort = () => {
        if (timer)
          clearTimeout(timer);
        reject(new AbortError());
      };
      if (signal) {
        signal.addEventListener('abort', abort, {once: true});
      }
      const timer = setTimeout(() => {
        if (signal) {
          signal.removeEventListener('abort', abort);
        }
        resolve();
      }, timeMS);
    });
  }
}

export {Time};
