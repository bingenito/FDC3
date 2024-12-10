import {
  Channel,
  ContextHandler,
  Listener,
  PrivateChannel,
  ChannelSelector,
  EventHandler,
  ChannelError,
} from '@kite9/fdc3-standard';
import { Messaging } from '../Messaging';
import { ChannelSupport } from './ChannelSupport';
import { DefaultPrivateChannel } from './DefaultPrivateChannel';
import { DefaultChannel } from './DefaultChannel';
import { DefaultContextListener } from '../listeners/DefaultContextListener';
import { UserChannelContextListener } from '../listeners/UserChannelContextListener';
import { EventListener } from '../listeners/EventListener';
import {
  GetCurrentChannelResponse,
  GetCurrentChannelRequest,
  GetUserChannelsResponse,
  GetUserChannelsRequest,
  GetOrCreateChannelResponse,
  GetOrCreateChannelRequest,
  CreatePrivateChannelResponse,
  CreatePrivateChannelRequest,
  LeaveCurrentChannelResponse,
  LeaveCurrentChannelRequest,
  JoinUserChannelResponse,
  JoinUserChannelRequest,
} from '@kite9/fdc3-schema/generated/api/BrowserTypes';

export class DefaultChannelSupport implements ChannelSupport {
  readonly messaging: Messaging;
  readonly channelSelector: ChannelSelector;
  protected userChannels: Channel[] = [];
  protected userChannelListeners: UserChannelContextListener[] = [];

  constructor(messaging: Messaging, channelSelector: ChannelSelector) {
    this.messaging = messaging;
    this.channelSelector = channelSelector;
    this.channelSelector.setChannelChangeCallback((channelId: string | null) => {
      if (channelId == null) {
        this.leaveUserChannel();
      } else {
        this.joinUserChannel(channelId);
      }
    });

    this.addChannelChangedEventHandler(e => {
      this.channelSelector.updateChannel(e.details.newChannelId, this.userChannels ?? []);
    });
  }

  async addChannelChangedEventHandler(handler: EventHandler): Promise<Listener> {
    const listener = new EventListener(this.messaging, 'channelChangedEvent', handler);
    await listener.register();
    return listener;
  }

  async getUserChannel(): Promise<Channel | null> {
    const request: GetCurrentChannelRequest = {
      meta: this.messaging.createMeta(),
      type: 'getCurrentChannelRequest',
      payload: {},
    };
    const response = await this.messaging.exchange<GetCurrentChannelResponse>(request, 'getCurrentChannelResponse');
    //handle successful responses - errors will already have been thrown by exchange above
    if (response.payload.channel) {
      return new DefaultChannel(
        this.messaging,
        response.payload.channel.id,
        'user',
        response.payload.channel.displayMetadata
      );
    } else if (response.payload.channel === null) {
      //this is a valid response if no channel is set
      return null;
    } else {
      console.warn(
        'Invalid response from Desktop Agent to getCurrentChannel (channel should be explicitly null if no channel is set)!',
        response.payload
      );
      return null;
    }
  }

  async getUserChannels(): Promise<Channel[]> {
    const response = await this.messaging.exchange<GetUserChannelsResponse>(
      {
        meta: this.messaging.createMeta(),
        type: 'getUserChannelsRequest',
        payload: {},
      } as GetUserChannelsRequest,
      'getUserChannelsResponse'
    );
    //handle successful responses - errors will already have been thrown by exchange above
    if (response.payload.userChannels) {
      const channels = response.payload.userChannels;
      this.userChannels = channels.map(c => new DefaultChannel(this.messaging, c.id, 'user', c.displayMetadata));
    } else {
      console.error('Invalid response from Desktop Agent to getUserChannelsRequest!', response);
      throw new Error(ChannelError.NoChannelFound);
    }
    return this.userChannels;
  }

  async getOrCreate(id: string): Promise<Channel> {
    const request: GetOrCreateChannelRequest = {
      meta: this.messaging.createMeta(),
      type: 'getOrCreateChannelRequest',
      payload: {
        channelId: id,
      },
    };
    const response = await this.messaging.exchange<GetOrCreateChannelResponse>(request, 'getOrCreateChannelResponse');
    //handle successful responses - errors will already have been thrown by exchange above
    if (response.payload.channel) {
      const out = new DefaultChannel(this.messaging, id, 'app', response.payload.channel.displayMetadata);
      return out;
    } else {
      console.error('Invalid response from Desktop Agent to getUserChannelsRequest!', response);
      throw new Error(ChannelError.CreationFailed);
    }
  }

  async createPrivateChannel(): Promise<PrivateChannel> {
    const request: CreatePrivateChannelRequest = {
      meta: this.messaging.createMeta(),
      type: 'createPrivateChannelRequest',
      payload: {},
    };
    const response = await this.messaging.exchange<CreatePrivateChannelResponse>(
      request,
      'createPrivateChannelResponse'
    );
    if (response.payload.privateChannel) {
      return new DefaultPrivateChannel(this.messaging, response.payload.privateChannel.id);
    } else {
      console.error('Invalid response from Desktop Agent to getUserChannelsRequest!', response);
      throw new Error(ChannelError.CreationFailed);
    }
  }

  async leaveUserChannel(): Promise<void> {
    const request: LeaveCurrentChannelRequest = {
      meta: this.messaging.createMeta(),
      type: 'leaveCurrentChannelRequest',
      payload: {},
    };
    await this.messaging.exchange<LeaveCurrentChannelResponse>(request, 'leaveCurrentChannelResponse');
    this.channelSelector.updateChannel(null, this.userChannels);
    this.userChannelListeners.forEach(l => l.changeChannel(null));
  }

  async joinUserChannel(id: string) {
    const request: JoinUserChannelRequest = {
      meta: this.messaging.createMeta(),
      type: 'joinUserChannelRequest',
      payload: {
        channelId: id,
      },
    };
    await this.messaging.exchange<JoinUserChannelResponse>(request, 'joinUserChannelResponse');
    this.channelSelector.updateChannel(id, this.userChannels);
    for (const l of this.userChannelListeners) {
      await l.changeChannel(new DefaultChannel(this.messaging, id, 'user'));
    }
  }

  async addContextListener(handler: ContextHandler, type: string | null): Promise<Listener> {
    //TODO: Figure out a better solution than inlining this class.
    /** Utility class used to wrap the DefaultContextListener and ensure it gets removed
     *  when its unsubscribe function is called.
     */
    class UnsubscribingDefaultContextListener extends DefaultContextListener {
      container: DefaultChannelSupport;

      constructor(
        container: DefaultChannelSupport,
        messaging: Messaging,
        channelId: string | null,
        contextType: string | null,
        handler: ContextHandler,
        messageType: string = 'broadcastEvent'
      ) {
        super(messaging, channelId, contextType, handler, messageType);
        this.container = container;
      }

      async unsubscribe(): Promise<void> {
        super.unsubscribe();
        this.container.userChannelListeners = this.container.userChannelListeners.filter(l => l != this);
      }
    }

    const currentChannelId = (await this.getUserChannel())?.id ?? null;
    const listener = new UnsubscribingDefaultContextListener(this, this.messaging, currentChannelId, type, handler);
    this.userChannelListeners.push(listener);
    await listener.register();
    return listener;
  }
}
