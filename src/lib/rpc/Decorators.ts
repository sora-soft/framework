import {Route} from './Route';

export function method(target: Route, key: string) {
  target.registerMethod(key, target[key]);
}

export function notify(target: Route, key: string) {
  target.registerNotify(key, target[key]);
}
