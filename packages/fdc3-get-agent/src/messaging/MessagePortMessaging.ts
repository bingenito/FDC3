import { AbstractMessaging, RegisterableListener } from '@kite9/fdc3-agent-proxy';
import { AppIdentifier, GetAgentParams, WebDesktopAgentType } from '@kite9/fdc3-standard';
import { v4 as uuidv4 } from 'uuid';
import {
  AppRequestMessage,
  WebConnectionProtocol3Handshake,
  WebConnectionProtocol6Goodbye,
} from '@kite9/fdc3-schema/generated/api/BrowserTypes';

/**
 * Details needed to set up the Messaging instance and Desktop AgentDetails record
 */
export type ConnectionDetails = {
  connectionAttemptUuid: string;
  handshake: WebConnectionProtocol3Handshake;
  messagePort: MessagePort;
  actualUrl: string;
  options: GetAgentParams;
  agentType: WebDesktopAgentType;
  agentUrl?: string;
};

const MESSAGE_EXCHANGE_TIMEOUT = 10016;
export class MessagePortMessaging extends AbstractMessaging {
  private readonly cd: ConnectionDetails;
  private readonly listeners: Map<string, RegisterableListener> = new Map();
  private messageExchangeTimeout: number;

  constructor(cd: ConnectionDetails, appIdentifier: AppIdentifier) {
    super(appIdentifier);
    this.cd = cd;

    /** We do not use the timeout specified as an argument to getAgent as
     *  that is for connection messaging, rather than message exchanges
     * post-connection. */
    this.messageExchangeTimeout = MESSAGE_EXCHANGE_TIMEOUT;

    this.cd.messagePort.addEventListener('message', m => {
      this.listeners.forEach(v => {
        if (v.filter(m.data)) {
          v.action(m.data);
        }
      });
    });
  }

  createUUID(): string {
    return uuidv4();
  }

  async post(message: AppRequestMessage | WebConnectionProtocol6Goodbye): Promise<void> {
    this.cd.messagePort.postMessage(message);
    return Promise.resolve();
  }

  register(l: RegisterableListener): void {
    this.listeners.set(l.id!, l);
  }

  unregister(id: string): void {
    this.listeners.delete(id);
  }

  createMeta(): AppRequestMessage['meta'] {
    return {
      requestUuid: this.createUUID(),
      timestamp: new Date(),
      source: super.getAppIdentifier(),
    };
  }

  getTimeoutMs(): number {
    return this.messageExchangeTimeout;
  }

  async disconnect(): Promise<void> {
    const bye: WebConnectionProtocol6Goodbye = {
      type: 'WCP6Goodbye',
      meta: {
        timestamp: new Date(),
      },
    };
    await this.post(bye);

    this.cd.messagePort.close();
  }
}
