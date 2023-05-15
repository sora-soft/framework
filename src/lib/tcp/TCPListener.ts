import {Listener, ListenerCallback} from '../rpc/Listener.js';
import net =  require('net');
import {ListenerState} from '../../Enum.js';
import util = require('util');
import {ILabels, ITCPListenerOptions} from '../../interface/config.js';
import {v4 as uuid} from 'uuid';
import EventEmitter = require('events');
import {Runtime} from '../Runtime.js';
import {Logger} from '../logger/Logger.js';
import {ExError} from '../../utility/ExError.js';
import {Utility} from '../../utility/Utility.js';
import {TCPErrorCode} from '../../ErrorCode.js';
import {TCPError} from './TCPError.js';
import {Time} from '../../utility/Time.js';
import {IListenerInfo} from '../../interface/rpc.js';
import {TCPConnector} from './TCPConnector.js';

class TCPListener extends Listener {
  constructor(options: ITCPListenerOptions, callback: ListenerCallback, labels: ILabels = {}) {
    super(callback, labels);
    this.options_ = options;

    this.usePort_ = 0;

    this.connectionEmitter_ = new EventEmitter();
    this.server_ = net.createServer();
    this.server_.on('connection', (socket) => {
      this.onSocketConnect(socket);
    });
  }

  get exposeHost() {
    return this.options_.exposeHost || this.options_.host;
  }

  get metaData() {
    return {
      id: this.id,
      protocol: 'tcp',
      endpoint: `${this.exposeHost}:${this.usePort_}`,
      state: this.state,
      labels: this.labels,
    };
  }

  private onServerError(err: Error) {
    this.lifeCycle_.setState(ListenerState.ERROR, err);
    Runtime.frameLogger.error('listener.tcp', err, {event: 'tcp-server-on-error', error: Logger.errorMessage(err)});
  }

  protected async listen() {
    if (this.options_.portRange)
      return this.listenRange(this.options_.portRange[0], this.options_.portRange[1]);

    if (this.options_.port)
      this.usePort_ = this.options_.port;

    await util.promisify<number, string>(this.server_.listen.bind(this.server_) as (port: number, host: string) => void)(this.usePort_, this.options_.host);

    this.server_.on('error', (err: ExError) => {this.onServerError(err);});

    return this.metaData;
  }

  protected listenRange(min: number, max: number) {
    this.usePort_ = min;
    return new Promise<IListenerInfo>((resolve, reject) => {
      const onError = async (err: ExError) => {
        if (err.code === 'EADDRINUSE') {
          this.usePort_ = this.usePort_ + Utility.randomInt(0, 5);
          if (this.usePort_ > max) {
            reject(new TCPError(TCPErrorCode.ERR_NO_AVAILABLE_PORT, 'ERR_NO_AVAILABLE_PORT'));
          }

          await Time.timeout(100);

          this.server_.listen(this.usePort_, this.options_.host);
        } else {
          throw err;
        }
      };

      this.server_.on('error', onError);

      this.server_.once('listening', () => {
        this.server_.removeListener('error', onError);

        this.server_.on('error', (err: ExError) => {this.onServerError(err);});
        resolve({
          protocol: 'tcp',
          endpoint: `${this.options_.host}:${this.usePort_}`,
          labels: this.labels,
        });
      });

      this.server_.listen(this.usePort_, this.options_.host);
    });
  }

  get version() {
    return Runtime.version;
  }

  protected async shutdown() {
    // 要等所有 socket 由对方关闭
    await util.promisify(this.server_.close.bind(this.server_) as () => void)();
  }

  private onSocketConnect(socket: net.Socket) {
    if (this.state !== ListenerState.READY) {
      socket.destroy();
      return;
    }

    const session = uuid();
    const connector = new TCPConnector(socket);
    this.newConnector(session, connector);
  }

  private usePort_: number;
  private server_: net.Server;
  private options_: ITCPListenerOptions;
}

export {TCPListener};
