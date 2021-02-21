class Utility {
  static mapToJSON(map: Map<string, any>) {
    const result = new Object(null);

    for (const key of map.keys()) {
      result[key] = map.get(key);
    }

    return result;
  }

  static parseInt(value: string) {
    return Number.parseInt(value, 10) || 0;
  }

  static randomInt(begin: number, end: number) {
    if (begin >= end)
      return begin;

    return Math.floor(begin + (end - begin) * Math.random());
  }

  static randomOne<T>(array: T[]) {
    const index = this.randomInt(0, array.length);
    return array[index];
  }
}

export {Utility}
