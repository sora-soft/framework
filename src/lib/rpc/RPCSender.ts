import {ISenderMetaData} from '../../interface/rpc.js';
import {Connector} from './Connector.js';

class RPCSender {
  constructor(listenerId: string, targetId: string, connector: Connector, weight: number) {
    this.listenerId_ = listenerId;
    this.targetId_ = targetId;
    this.connector_ = connector;
    this.weight_ = weight;
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

  set weight(value: number) {
    this.weight_ = value;
  }

  get weight() {
    return this.weight_;
  }

  get metaData(): ISenderMetaData {
    return {
      id: this.listenerId_,
      listenerId: this.listenerId_,
      targetId: this.targetId_,
      weight: this.weight_,
      state: this.connector_.state,
      protocol: this.connector.protocol,
    };
  }

  private listenerId_: string;
  private targetId_: string;
  private connector_: Connector;
  private weight_: number;
}

export {RPCSender};
