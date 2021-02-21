import {Listener, ListenerCallback} from '../rpc/Listener';
import net =  require('net');
import {ListenerState} from '../../Enum';
import util = require('util');
import {TCPUtility} from './TCPUtility';
import {Executor} from '../../utility/Executor';
import {ILabels, ITCPListenerOptions} from '../../interface/config';
import {Notify} from '../rpc/Notify';
import {v4 as uuid} from 'uuid';

class TCPListener extends Listener {
  constructor(options: ITCPListenerOptions, callback: ListenerCallback, executor: Executor) {
    super(callback, executor);
    this.options_ = options;

    this.server_ = net.createServer();
    this.server_.on('connection', this.onSocketConnect.bind(this));
  }

  get metaData() {
    return {
      id: this.id,
      protocol: 'tcp',
      endpoint: `${this.options_.host}:${this.options_.port}`,
      state: this.state
    }
  }

  async notify(session: string, notify: Notify) {
    const socket = this.sockets_.get(session);
    if (!socket || socket.destroyed)
      return;

    const packet = notify.toPacket();
    const data = TCPUtility.encodeMessage(packet);
    await util.promisify<Buffer, void>(socket.write.bind(socket))(data);
  }

  protected async listen() {
    await util.promisify<number, string, void>(this.server_.listen.bind(this.server_))(this.options_.port, this.options_.host);

    return {
      id: this.id,
      protocol: 'tcp',
      endpoint: `${this.options_.host}:${this.options_.port}`,
      state: this.state
    }
  }

  protected async shutdown() {
    // 要等所有 socket 由对方关闭
    if (this.sockets_.size)
      await new Promise<void>((resolve) => { this.waitForAllSocketCloseCallback_ = resolve });

    await util.promisify(this.server_.close.bind(this.server_))();
  }

  private onSocketDisconnect(session: string) {
    return () => {
      this.sockets_.delete(session);
      if (!this.sockets_.size && this.waitForAllSocketCloseCallback_)
        this.waitForAllSocketCloseCallback_();
    }
  }

  private onSocketConnect(socket: net.Socket) {
    if (this.state !== ListenerState.READY) {
      socket.destroy();
      return;
    }

    const session = uuid();
    this.sockets_.set(session, socket);
    socket.on('data', this.onSocketData(socket).bind(this));
    socket.on('close', this.onSocketDisconnect(session).bind(this));
  }

  private onSocketData(socket: net.Socket) {
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
          const packet = JSON.parse(content.toString());

          const response = await listenerDataCallback(packet);
          if (response) {
            const resData = TCPUtility.encodeMessage(response);
            util.promisify<Buffer, void>(socket.write.bind(socket))(resData);
          }
          packetLength = 0;
        }
      });
    }
  }

  private server_: net.Server;
  private options_: ITCPListenerOptions;
  private sockets_: Map<string, net.Socket> = new Map();
  private waitForAllSocketCloseCallback_: () => void;
}

export {TCPListener};
