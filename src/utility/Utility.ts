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
}

export {Utility}
