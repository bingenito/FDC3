import {
  AppIntent,
  AppIdentifier,
  IntentResolution,
  IntentHandler,
  Listener,
  ResolveError,
  IntentResult,
  IntentResolver,
  IntentResolutionChoice,
} from '@kite9/fdc3-standard';
import { IntentSupport } from './IntentSupport';
import { Messaging } from '../Messaging';
import { DefaultIntentResolution } from './DefaultIntentResolution';
import { DefaultIntentListener } from '../listeners/DefaultIntentListener';
import { DefaultChannel } from '../channels/DefaultChannel';
import { DefaultPrivateChannel } from '../channels/DefaultPrivateChannel';
import { Context } from '@kite9/fdc3-context';
import {
  FindIntentRequest,
  FindIntentResponse,
  FindIntentsByContextRequest,
  FindIntentsByContextResponse,
  RaiseIntentForContextRequest,
  RaiseIntentForContextResponse,
  RaiseIntentRequest,
  RaiseIntentResponse,
  RaiseIntentResultResponse,
} from '@kite9/fdc3-schema/generated/api/BrowserTypes';

const convertIntentResult = async (
  { payload }: RaiseIntentResultResponse,
  messaging: Messaging
): Promise<IntentResult> => {
  const result = payload.intentResult;
  if (result?.channel) {
    const { channel } = result;
    switch (channel.type) {
      case 'private': {
        return new DefaultPrivateChannel(messaging, channel.id);
      }
      case 'app':
      case 'user':
      default: {
        return new DefaultChannel(messaging, channel.id, channel.type, channel.displayMetadata);
      }
    }
  } else if (result?.context) {
    return result.context;
  } else {
    return;
  }
};

export class DefaultIntentSupport implements IntentSupport {
  readonly messaging: Messaging;
  readonly intentResolver: IntentResolver;

  constructor(messaging: Messaging, intentResolver: IntentResolver) {
    this.messaging = messaging;
    this.intentResolver = intentResolver;
  }

  async findIntent(intent: string, context: Context, resultType: string | undefined): Promise<AppIntent> {
    const messageOut: FindIntentRequest = {
      type: 'findIntentRequest',
      payload: {
        intent,
        context,
        resultType,
      },
      meta: this.messaging.createMeta(),
    };

    const result = await this.messaging.exchange<FindIntentResponse>(messageOut, 'findIntentResponse');
    const appIntent = result.payload.appIntent!;
    if (appIntent.apps.length == 0) {
      throw new Error(ResolveError.NoAppsFound);
    } else {
      return {
        intent: appIntent.intent,
        apps: appIntent.apps,
      };
    }
  }

  async findIntentsByContext(context: Context): Promise<AppIntent[]> {
    const messageOut: FindIntentsByContextRequest = {
      type: 'findIntentsByContextRequest',
      payload: {
        context,
      },
      meta: this.messaging.createMeta(),
    };

    const result: FindIntentsByContextResponse = await this.messaging.exchange(
      messageOut,
      'findIntentsByContextResponse'
    );
    const appIntents = result.payload.appIntents;
    if (!appIntents || appIntents.length == 0) {
      throw new Error(ResolveError.NoAppsFound);
    } else {
      return appIntents;
    }
  }

  private async createResultPromise(
    messageOut: RaiseIntentRequest | RaiseIntentForContextRequest
  ): Promise<IntentResult> {
    const rp = await this.messaging.waitFor<RaiseIntentResultResponse>(
      m => m.type == 'raiseIntentResultResponse' && m.meta.requestUuid == messageOut.meta.requestUuid
    );

    const ir = await convertIntentResult(rp, this.messaging);
    return ir;
  }

  async raiseIntent(intent: string, context: Context, app: AppIdentifier): Promise<IntentResolution> {
    const meta = this.messaging.createMeta();
    const messageOut: RaiseIntentRequest = {
      type: 'raiseIntentRequest',
      payload: {
        intent,
        context,
        app: app,
      },
      meta: meta,
    };

    const resultPromise = this.createResultPromise(messageOut);
    const response = await this.messaging.exchange<RaiseIntentResponse>(
      messageOut,
      'raiseIntentResponse',
      ResolveError.IntentDeliveryFailed
    );

    if (response.payload.appIntent) {
      // Needs further resolution, we need to invoke the resolver
      const result: IntentResolutionChoice | void = await this.intentResolver.chooseIntent(
        [response.payload.appIntent],
        context
      );
      if (result) {
        return this.raiseIntent(intent, context, result.appId);
      } else {
        throw new Error(ResolveError.UserCancelled);
      }
    } else if (response.payload.intentResolution) {
      // Was resolved
      const details = response.payload.intentResolution;
      return new DefaultIntentResolution(this.messaging, resultPromise, details.source, details.intent);
    } else {
      //should never get here as exchange will throw above
      throw new Error(ResolveError.NoAppsFound);
    }
  }

  async raiseIntentForContext(context: Context, app?: AppIdentifier | undefined): Promise<IntentResolution> {
    const messageOut: RaiseIntentForContextRequest = {
      type: 'raiseIntentForContextRequest',
      payload: {
        context,
        app: app,
      },
      meta: this.messaging.createMeta(),
    };

    const resultPromise = this.createResultPromise(messageOut);
    const response = await this.messaging.exchange<RaiseIntentForContextResponse>(
      messageOut,
      'raiseIntentForContextResponse',
      ResolveError.IntentDeliveryFailed
    );
    if (response.payload.appIntents) {
      // Needs further resolution, we need to invoke the resolver
      const result: IntentResolutionChoice | void = await this.intentResolver.chooseIntent(
        response.payload.appIntents,
        context
      );
      if (result) {
        return this.raiseIntent(result.intent, context, result.appId);
      } else {
        throw new Error(ResolveError.UserCancelled);
      }
    } else if (response.payload.intentResolution) {
      // Was resolved
      const details = response.payload.intentResolution;
      return new DefaultIntentResolution(this.messaging, resultPromise, details.source, details.intent);
    } else {
      //should never get here as exchange will throw above
      throw new Error(ResolveError.NoAppsFound);
    }
  }

  async addIntentListener(intent: string, handler: IntentHandler): Promise<Listener> {
    const out = new DefaultIntentListener(this.messaging, intent, handler);
    await out.register();
    return out;
  }
}
