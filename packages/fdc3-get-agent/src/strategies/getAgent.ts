import {
  DesktopAgent,
  GetAgentType,
  GetAgentParams,
  AgentError,
  DesktopAgentDetails,
  WebDesktopAgentType,
  DEFAULT_TIMEOUT_MS,
} from '@kite9/fdc3-standard';
import { DesktopAgentPreloadLoader } from './DesktopAgentPreloadLoader';
import { PostMessageLoader } from './PostMessageLoader';
import { retrieveDesktopAgentDetails, storeDesktopAgentDetails } from '../sessionStorage/DesktopAgentDetails';
import { FailoverHandler } from './FailoverHandler';
import { Loader } from './Loader';
import { Logger } from '../util/Logger';

// TypeGuards used to examine results of Loaders
const isRejected = (input: PromiseSettledResult<unknown>): input is PromiseRejectedResult =>
  input.status === 'rejected';

const isFulfilled = <T>(input: PromiseSettledResult<T>): input is PromiseFulfilledResult<T> =>
  input.status === 'fulfilled';

/**
 * For now, we only allow a single call to getAgent per application, so
 * we keep track of the promise we use here.
 */
let theAgentPromise: Promise<DesktopAgent> | null = null;

export function clearAgentPromise() {
  theAgentPromise = null;
}

export function getAgentPromise(): Promise<DesktopAgent> | null {
  return theAgentPromise;
}

function initAgentPromise(options: GetAgentParams): Promise<DesktopAgent> {
  Logger.log(`Initiating Desktop Agent discovery at ${new Date().toISOString()}`);
  let strategies: Loader[];

  //if options doesn't contain an identityURL, use the actualUrl
  if (!options.identityUrl) {
    options.identityUrl = globalThis.window.location.href;
  }

  //Retrieve persisted connection data limit to a previous strategy if one exists
  const persistedData = retrieveDesktopAgentDetails(options.identityUrl);
  if (persistedData) {
    switch (persistedData.agentType) {
      case WebDesktopAgentType.Preload:
        strategies = [new DesktopAgentPreloadLoader()];
        break;
      case WebDesktopAgentType.ProxyUrl:
        //agentUrl will only be used by PostMessageLoader if not falsey
        strategies = [new PostMessageLoader(persistedData.agentUrl)];
        break;
      case WebDesktopAgentType.ProxyParent:
        strategies = [new PostMessageLoader()];
        break;
      case WebDesktopAgentType.Failover:
        strategies = [];
        break;
      default:
        strategies = [new DesktopAgentPreloadLoader(), new PostMessageLoader()];
    }
  } else {
    strategies = [new DesktopAgentPreloadLoader(), new PostMessageLoader()];
  }

  const promises = strategies.map(s =>
    s.get(options).then(async selection => {
      //cancel other strategies if we selected a DA
      Logger.debug(`Strategy ${s.name} resolved - cleaning up other strategies`);
      for (let s2 = 0; s2 < strategies.length; s2++) {
        if (strategies[s2] !== s) {
          Logger.debug(`  cleaning up ${strategies[s2].name}`);
          await strategies[s2].cancel();
        }
      }
      strategies.forEach(async s2 => {
        if (s2 !== s) {
          await s2.cancel();
        }
      });
      return selection;
    })
  );

  Logger.debug('Waiting for discovery promises to settle...');
  return Promise.allSettled(promises).then(async results => {
    //review results
    const daResult = results.find(isFulfilled);
    Logger.debug(`Discovery results:  ${JSON.stringify(results, null, 2)}`);

    if (daResult) {
      const selection = daResult.value;
      const desktopAgentDetails: DesktopAgentDetails = {
        agentType: selection.details.agentType,
        identityUrl: selection.details.identityUrl,
        actualUrl: selection.details.actualUrl,
        agentUrl: selection.details.agentUrl ?? undefined,
        appId: selection.details.appId,
        instanceId: selection.details.instanceId,
        instanceUuid: selection.details.instanceUuid,
      };
      storeDesktopAgentDetails(desktopAgentDetails);
      Logger.log(
        `Desktop Agent located via discovery, appId: ${desktopAgentDetails.appId}, instanceId: ${desktopAgentDetails.instanceId}`
      );
      return selection.agent;
    } else {
      //if we received any error other than AgentError.AgentNotFound, throw it
      const errors = results.filter(isRejected);

      //n.b. the Loaders throw string error messages, rather than Error objects
      const error = errors.find(aRejection => aRejection.reason !== AgentError.AgentNotFound);
      if (error) {
        throw new Error(error.reason);
      } else if (options.failover != undefined) {
        Logger.debug(`Calling failover fn...`);
        //Proceed with the failover
        try {
          //TODO: consider adding a timeout for the failover, to avoid getting stuck here
          //  However there is an argument to be made for hanging out in case the
          //  function eventually returns, e.g. after an external DA started up

          const failoverHandler = new FailoverHandler(options);
          const selection = await failoverHandler.handleFailover();

          //store details of the connection in SessionStorage
          const desktopAgentDetails: DesktopAgentDetails = {
            agentType: WebDesktopAgentType.Failover,
            identityUrl: selection.details.identityUrl,
            actualUrl: selection.details.actualUrl,
            agentUrl: selection.details.agentUrl ?? undefined,
            appId: selection.details.appId,
            instanceId: selection.details.instanceId,
            instanceUuid: selection.details.instanceUuid,
          };
          storeDesktopAgentDetails(desktopAgentDetails);
          Logger.log(
            `Desktop Agent located via failover, appId: ${desktopAgentDetails.appId}, instanceId: ${desktopAgentDetails.instanceId}`
          );

          return selection.agent;
        } catch (e) {
          //n.b. FailoverHandler throws Error Objects so we can return this directly
          Logger.error('Desktop agent not found. Error reported during failover', e);
          throw e;
        }
      } else {
        //We didn't manage to find an agent.
        Logger.error('Desktop agent not found. No error reported during discovery.');
        throw new Error(AgentError.AgentNotFound);
      }
    }
  });
}

/**
 * Function used to retrieve an FDC3 Desktop Agent API instance, which
 * supports the discovery of a Desktop Agent Preload (a container-injected
 * API implementation) or a Desktop Agent Proxy (a Browser-based Desktop Agent
 * running in another window or frame). Finally, if no Desktop Agent is found,
 * a failover function may be supplied by an app allowing it to start or otherwise
 * connect to a Desktop Agent (e.g. by loading a proprietary adaptor that
 * returns a `DesktopAgent` implementation or by creating a window or iframe of
 * its own that will provide a Desktop Agent Proxy.
 *
 * @param {GetAgentParams} params Optional parameters object, which
 * may include a URL to use for the app's identity, other settings
 * that affect the behavior of the getAgent() function and a `failover`
 * function that should be run if a Desktop Agent is not detected.
 *
 * @returns A promise that resolves to a DesktopAgent implementation or
 * rejects with an error message from the `AgentError` enumeration if unable to
 * return a Desktop Agent implementation.
 *
 * @example
 * const fdc3 = await getAgent();
 *
 * // OR
 *
 * getAgent({
 *     identityUrl: "https://example.com/path?param=appName#example",
 *     channelSelector: false,
 *     intentResolver: false
 * }).then((fdc3) => {
 *     //do FDC3 stuff here
 * };
 */
export const getAgent: GetAgentType = (params?: GetAgentParams) => {
  const DEFAULT_OPTIONS: GetAgentParams = {
    dontSetWindowFdc3: true,
    channelSelector: true,
    intentResolver: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  const options: GetAgentParams = {
    ...DEFAULT_OPTIONS,
    ...params,
  };

  async function handleSetWindowFdc3(da: DesktopAgent) {
    if (!options.dontSetWindowFdc3 && globalThis.window.fdc3 == null) {
      globalThis.window.fdc3 = da;
      globalThis.window.dispatchEvent(new Event('fdc3Ready'));
    }
    return da;
  }

  if (!theAgentPromise) {
    theAgentPromise = initAgentPromise(options).then(handleSetWindowFdc3);
  }

  return theAgentPromise;
};

/**
 * Replaces the original fdc3Ready function from FDC3 2.0 with a new one that uses the
 * new getAgent function.
 *
 * @param waitForMs Amount of time to wait before failing the promise (20 seconds is the default).
 * @returns A DesktopAgent promise.
 */
export function fdc3Ready(waitForMs = DEFAULT_TIMEOUT_MS): Promise<DesktopAgent> {
  return getAgent({
    timeoutMs: waitForMs,
    dontSetWindowFdc3: false,
    channelSelector: true,
    intentResolver: true,
  });
}
