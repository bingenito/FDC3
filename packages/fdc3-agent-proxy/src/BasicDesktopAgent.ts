import {
  AppIdentifier,
  AppMetadata,
  ContextHandler,
  DesktopAgent,
  EventHandler,
  FDC3EventTypes,
  ImplementationMetadata,
  IntentHandler,
  IntentResolution,
  Listener,
} from '@kite9/fdc3-standard';
import { ChannelSupport } from './channels/ChannelSupport';
import { AppSupport } from './apps/AppSupport';
import { IntentSupport } from './intents/IntentSupport';
import { Connectable } from '@kite9/fdc3-standard';
import { Context } from '@kite9/fdc3-context';
import { HeartbeatSupport } from './heartbeat/HeartbeatSupport';

/**
 * This splits out the functionality of the desktop agent into
 * app, channels and intents concerns.
 */
export class BasicDesktopAgent implements DesktopAgent, Connectable {
  readonly heartbeat: HeartbeatSupport;
  readonly channels: ChannelSupport;
  readonly intents: IntentSupport;
  readonly apps: AppSupport;
  readonly connectables: Connectable[];

  constructor(
    heartbeat: HeartbeatSupport,
    channels: ChannelSupport,
    intents: IntentSupport,
    apps: AppSupport,
    connectables: Connectable[]
  ) {
    this.heartbeat = heartbeat;
    this.intents = intents;
    this.channels = channels;
    this.apps = apps;
    this.connectables = connectables;
  }

  addEventListener(type: FDC3EventTypes | null, handler: EventHandler): Promise<Listener> {
    switch (type) {
      case 'userChannelChanged':
        return this.channels.addChannelChangedEventHandler(handler);
      default:
        throw new Error('UnknownEventType');
    }
  }

  getInfo(): Promise<ImplementationMetadata> {
    return this.apps.getImplementationMetadata();
  }

  async broadcast(context: Context): Promise<void> {
    const channel = await this.channels.getUserChannel();
    if (channel) {
      return channel.broadcast(context);
    } else {
      return Promise.resolve();
    }
  }

  addContextListener(context: ContextHandler | string | null, handler?: ContextHandler): Promise<Listener> {
    const theHandler: ContextHandler = handler ? handler : (context as ContextHandler);
    const theContextType: string | null = context && handler ? (context as string) : null;
    return this.channels.addContextListener(theHandler, theContextType);
  }

  getUserChannels() {
    return this.channels.getUserChannels();
  }

  getSystemChannels() {
    return this.channels.getUserChannels();
  }

  getOrCreateChannel(channelId: string) {
    return this.channels.getOrCreate(channelId);
  }

  createPrivateChannel() {
    return this.channels.createPrivateChannel();
  }

  leaveCurrentChannel() {
    return this.channels.leaveUserChannel();
  }

  joinUserChannel(channelId: string) {
    return this.channels.joinUserChannel(channelId);
  }

  joinChannel(channelId: string) {
    return this.channels.joinUserChannel(channelId);
  }

  getCurrentChannel() {
    return this.channels.getUserChannel();
  }

  findIntent(intent: string, context: Context, resultType: string | undefined) {
    return this.intents.findIntent(intent, context, resultType);
  }

  findIntentsByContext(context: Context) {
    return this.intents.findIntentsByContext(context);
  }

  private ensureAppId(app?: string | AppIdentifier): AppIdentifier | undefined {
    if (typeof app === 'string') {
      return {
        appId: app,
      };
    } else if (app?.appId) {
      return app as AppIdentifier;
    } else {
      return undefined;
    }
  }

  raiseIntent(intent: string, context: Context, app?: string | AppIdentifier) {
    return this.intents.raiseIntent(intent, context, this.ensureAppId(app));
  }

  addIntentListener(intent: string, handler: IntentHandler) {
    return this.intents.addIntentListener(intent, handler);
  }

  raiseIntentForContext(context: Context, app?: string | AppIdentifier): Promise<IntentResolution> {
    return this.intents.raiseIntentForContext(context, this.ensureAppId(app));
  }

  open(app: string | AppIdentifier, context?: Context | undefined) {
    return this.apps.open(this.ensureAppId(app)!, context);
  }

  findInstances(app: AppIdentifier) {
    return this.apps.findInstances(app);
  }

  getAppMetadata(app: AppIdentifier): Promise<AppMetadata> {
    return this.apps.getAppMetadata(app);
  }

  async disconnect(): Promise<void> {
    await Promise.all(this.connectables.map(c => c.disconnect()));
  }

  async connect(): Promise<void> {
    await Promise.all(this.connectables.map(c => c.connect()));
  }
}
