import {Connector} from './Connector';

class RPCSender {
  constructor(listenerId: string, targetId: string, connector: Connector) {
    this.listenerId_ = listenerId;
    this.targetId_ = targetId;
    this.isBusy_ = false;
    this.connector_ = connector;
  }

  get listenerId() {
    return this.listenerId_;
  }

  get targetId() {
    return this.targetId_;
  }

  get connector() {
    return this.connector_;
  }

  get isBusy() {
    return this.isBusy_;
  }

  set isBusy(value: boolean) {
    this.isBusy_ = value;
  }

  private listenerId_: string;
  private targetId_: string;
  private connector_: Connector;
  private isBusy_: boolean;
}

export {RPCSender};
