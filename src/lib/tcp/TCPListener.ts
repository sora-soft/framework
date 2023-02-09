import {Listener, ListenerCallback} from '../rpc/Listener';
import net =  require('net');
import {ConnectorCommand, ConnectorState, ListenerState, OPCode} from '../../Enum';
import util = require('util');
import {Executor} from '../../utility/Executor';
import {ILabels, ITCPListenerOptions} from '../../interface/config';
import {v4 as uuid} from 'uuid';
import EventEmitter = require('events');
import {Runtime} from '../Runtime';
import {Logger} from '../logger/Logger';
import {ExError} from '../../utility/ExError';
import {Utility} from '../../utility/Utility';
import {TCPErrorCode} from '../../ErrorCode';
import {TCPError} from './TCPError';
import {Time} from '../../utility/Time';
import {IListenerInfo} from '../../interface/rpc';
import {TCPConnector} from './TCPConnector';

class TCPListener extends Listener {
  constructor(options: ITCPListenerOptions, callback: ListenerCallback, labels: ILabels = {}) {
    super(callback, labels);
    this.options_ = options;

    this.usePort_ = 0;

    this.connectionEmitter_ = new EventEmitter();
    this.server_ = net.createServer();
    this.server_.on('connection', this.onSocketConnect.bind(this));
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
      labels: this.labels
    }
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

    await util.promisify<number, string, void>(this.server_.listen.bind(this.server_))(this.usePort_, this.options_.host);

    this.server_.on('error', this.onServerError.bind(this));

    return this.metaData;
  }

  protected listenRange(min: number, max: number) {
    return new Promise<IListenerInfo>((resolve, reject) => {
      this.usePort_ = min + Utility.randomInt(0, 5);

      const onError = async (err: ExError) => {
        if (err.code === 'EADDRINUSE') {
          if (this.usePort_ + 5 > max) {
            reject(new TCPError(TCPErrorCode.ERR_NO_AVAILABLE_PORT, `ERR_NO_AVAILABLE_PORT`));
          }

          this.usePort_ = this.usePort_ + Utility.randomInt(0, 5);
          await Time.timeout(100);

          this.server_.listen(this.usePort_, this.options_.host);
        } else {
          throw err;
        }
      }

      this.server_.on('error', onError);

      this.server_.once('listening', () => {
        this.server_.removeListener('error', onError);

        this.server_.on('error', this.onServerError.bind(this));
        resolve({
          protocol: 'tcp',
          endpoint: `${this.options_.host}:${this.usePort_}`,
          labels: this.labels,
        });
      });

      this.server_.listen(this.usePort_, this.options_.host);
    })
  }

  get version() {
    return Runtime.version;
  }

  protected async shutdown() {
    for (const [_, connector] of this.connectors_.entries()) {
      await connector.sendCommand(ConnectorCommand.off, {reason: 'listener-shutdown'});
    }
    // 要等所有 socket 由对方关闭
    await util.promisify(this.server_.close.bind(this.server_))();
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
