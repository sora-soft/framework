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

  static hideKeys<T extends { [key: string] : any }>(obj: T, keys: (keyof T)[]) {
    const result: Partial<T> = {};
    Object.entries(obj).forEach(([key, value]: [keyof T, any]) => {
      if (!keys.includes(key))
        result[key] = value;
    });
    return result;
  }

  static formatLogTimeString(date: Date) {
    const timezoneOffsetMin = new Date().getTimezoneOffset();
    const offsetHrsNum = Math.abs( timezoneOffsetMin / 60 );
    const offsetMinNum = Math.abs(timezoneOffsetMin % 60);
    let offsetHrs = '';
    let offsetMin = '';
    let timezoneStandard = '';

    if(offsetHrsNum < 10)
      offsetHrs = '0' + offsetHrsNum;

    if(offsetMinNum < 10)
      offsetMin = '0' + offsetMinNum;

    // Add an opposite sign to the offset
    // If offset is 0, it means timezone is UTC
    if(timezoneOffsetMin < 0)
      timezoneStandard = '+' + offsetHrs + ':' + offsetMin;
    else if(timezoneOffsetMin > 0)
      timezoneStandard = '-' + offsetHrs + ':' + offsetMin;
    else if(timezoneOffsetMin == 0)
      timezoneStandard = 'Z';


    const dt = new Date();
    const currentDate = dt.getDate();
    const currentMonth = dt.getMonth() + 1;
    const currentYear = dt.getFullYear();
    const currentHrs = dt.getHours();
    const currentMins = dt.getMinutes();
    const currentSecs = dt.getSeconds();
    // const current_datetime;

    // Add 0 before date, month, hrs, mins or secs if they are less than 0
    const currentDateStr = currentDate < 10 ? '0' + currentDate : currentDate;
    const currentMonthStr = currentMonth < 10 ? '0' + currentMonth : currentMonth;
    const currentHrsStr = currentHrs < 10 ? '0' + currentHrs : currentHrs;
    const currentMinsStr = currentMins < 10 ? '0' + currentMins : currentMins;
    const currentSecsStr = currentSecs < 10 ? '0' + currentSecs : currentSecs;

    // Current datetime
    // String such as 2016-07-16T19:20:30
    const currentDateTime = currentYear + '-' + currentMonthStr + '-' + currentDateStr + 'T' + currentHrsStr + ':' + currentMinsStr + ':' + currentSecsStr;
    // Timezone difference in hours and minutes
    // String such as +5:30 or -6:00 or Z
    return currentDateTime + timezoneStandard;
  }
}

class UnixTime {
  static fromNodeTime(ms: number) {
    return Math.floor(ms / 1000);
  }

  static fromDate(date: Date) {
    return Math.floor(date.getTime() / 1000)
  }

  static now() {
    return this.fromDate(new Date());
  }

  static day(days: number) {
    return days * this.hour(24);
  }

  static hour(hours: number) {
    return hours * this.minute(60);
  }

  static minute(minutes: number) {
    return minutes * this.second(60);
  }

  static second(seconds: number) {
    return seconds;
  }
}

class NodeTime {
  static fromUnixTime(second: number) {
    return second * 1000;
  }

  static fromDate(date: Date) {
    return date.getTime();
  }

  static now() {
    return new Date().getTime();
  }

  static day(days: number) {
    return days * this.hour(24)// 60 * 60 * 24 * days * 1000;
  }

  static hour(hours: number) {
    return hours * this.minute(60);
  }

  static minute(minutes: number) {
    return minutes * this.second(60);
  }

  static second(seconds: number) {
    return seconds * 1000;
  }
}

export {Utility, NodeTime, UnixTime}
