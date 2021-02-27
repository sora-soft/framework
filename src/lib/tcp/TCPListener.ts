import {Listener, ListenerCallback} from '../rpc/Listener';
import net =  require('net');
import {ListenerState} from '../../Enum';
import util = require('util');
import {TCPUtility} from './TCPUtility';
import {Executor} from '../../utility/Executor';
import {ITCPListenerOptions} from '../../interface/config';
import {v4 as uuid} from 'uuid';
import {ListenerEvent} from '../../Event';
import EventEmitter = require('events');
import {Runtime} from '../Runtime';
import {Logger} from '../logger/Logger';
import {ExError} from '../../utility/ExError';
import {Utility} from '../../utility/Utility';
import {TCPErrorCode} from '../../ErrorCode';
import {TCPError} from './TCPError';
import {Time} from '../../utility/Time';
import {IListenerInfo} from '../../interface/rpc';


class TCPListener extends Listener {
  constructor(options: ITCPListenerOptions, callback: ListenerCallback, executor: Executor) {
    super(callback, executor);
    this.options_ = options;

    this.connectionEmitter_ = new EventEmitter();
    this.server_ = net.createServer();
    this.server_.on('connection', this.onSocketConnect.bind(this));
  }

  get metaData() {
    return {
      id: this.id,
      protocol: 'tcp',
      endpoint: `${this.options_.host}:${this.usePort_}`,
      state: this.state
    }
  }

  getSocket(session: string) {
    return this.sockets_.get(session);
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

    return {
      id: this.id,
      protocol: 'tcp',
      endpoint: `${this.options_.host}:${this.usePort_}`,
      state: this.state
    }
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
          id: this.id,
          protocol: 'tcp',
          endpoint: `${this.options_.host}:${this.usePort_}`,
        });
      });

      this.server_.listen(this.usePort_, this.options_.host);
    })
  }

  protected async shutdown() {
    // 要等所有 socket 由对方关闭
    await util.promisify(this.server_.close.bind(this.server_))();
  }

  private onSocketDisconnect(session: string) {
    return () => {
      this.sockets_.delete(session);
    }
  }

  private onSocketConnect(socket: net.Socket) {
    if (this.state !== ListenerState.READY) {
      socket.destroy();
      return;
    }

    const session = uuid();
    this.sockets_.set(session, socket);
    socket.on('data', this.onSocketData(session, socket).bind(this));
    socket.on('close', this.onSocketDisconnect(session).bind(this));
    socket.on('error', this.onSocketDisconnect(session).bind(this));

    this.connectionEmitter_.emit(ListenerEvent.NewConnect, session, socket);
  }

  private onSocketData(session: string, socket: net.Socket) {
    let packetLength = 0;
    let cache = Buffer.alloc(0);

    return (data: Buffer) => {
      this.handleMessage(async (listenerDataCallback) => {
        cache = Buffer.concat([cache, data]);

        while (cache.length >= packetLength && cache.length) {
          if (!packetLength) {
            packetLength = cache.readInt32BE();
            cache = cache.slice(4);
          }

          if (cache.length < packetLength)
            break;

          const content = cache.slice(0, packetLength);
          cache = cache.slice(packetLength);
          packetLength = 0;

          try {
            const packet = JSON.parse(content.toString());

            const response = await listenerDataCallback(packet, session);
            if (response) {
              const resData = TCPUtility.encodeMessage(response);
              util.promisify<Buffer, void>(socket.write.bind(socket))(resData);
            }
          } catch (err) {
            Runtime.frameLogger.error('listener.tcp', err, { event: 'event-handle-rpc', error: Logger.errorMessage(err)});
          }
        }
      });
    }
  }

  private usePort_: number;
  private server_: net.Server;
  private options_: ITCPListenerOptions;
  private sockets_: Map<string, net.Socket> = new Map();
}

export {TCPListener};
