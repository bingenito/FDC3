---
id: desktopAgentCommunicationProtocol
sidebar_label: Desktop Agent Communication Protocol 
title: Desktop Agent Communication Protocol (2.2)
---

:::info _[@experimental](../../fdc3-compliance#experimental-features)_

FDC3's Desktop Agent Communication Protocol (DACP) is an experimental feature added to FDC3 in 2.2. Limited aspects of its design may change in future versions and it is exempted from the FDC3 Standard's normal versioning and deprecation polices in order to facilitate any necessary change.

:::

The Desktop Agent Communication Protocol (DACP) constitutes a set of standardized JSON messages or 'wire protocol' that can be used to implement an interface to a Desktop Agent, encompassing all API calls events defined in the [Desktop Agent API](../ref/DesktopAgent.md). For example, the DACP is used by the [`@finos/fdc3` npm module](https://www.npmjs.com/package/@finos/fdc3) to communicate with Browser-Resident Desktop Agents or a connection setup via the [FDC3 Web Connection Protocol](./webConnectionProtocol).

## Protocol conventions

DACP messages are defined in [JSON Schema](https://json-schema.org/) in the [FDC3 github repository](https://github.com/finos/FDC3/tree/fdc3-for-web/schemas/api).

:::tip

TypeScript types representing all DACP and WCP messages are generated from the JSON Schema source and can be imported from the [`@finos/fdc3` npm module](https://www.npmjs.com/package/@finos/fdc3):

```ts
import { BrowserTypes } from "@finos/fdc3";
```

:::

The protocol is composed of several different classes of message, each governed by a message schema:

1. **App Request Messages** ([`AppRequest` schema](pathname:///schemas/2.2/api/appRequest.schema.json)):
    - Messages sent by an application representing an API call, such as [`DesktopAgent.broadcast`](../ref/DesktopAgent#broadcast), [`Channel.addContextListener`](../ref/Channel#addcontextlistener), or [`Listener.unsubscribe`](../ref/Types#listener).
    - Message names all end in 'Request'.
    - Each instance of a request message sent is uniquely identified by a `meta.requestUuid` field.

2. **Agent Response Messages** ([`AgentResponse` schema](pathname:///schemas/2.2/api/agentResponse.schema.json)):
    - Response messages sent from the DA to the application, each relating to a corresponding _App Request Message_.
    - Message names all end in 'Response'.
    - Each instance of an Agent Response Message is uniquely identified by a `meta.responseUuid` field.
    - Each instance of an Agent Response Message quotes the `meta.requestUuid` value of the message it is responding to.

3. **Agent Event Messages** ([`AgentEvent` schema](pathname:///schemas/2.2/api/agentEvent.schema.json)):
    - Messages sent from the DA to the application that are due to actions in other applications, such as an inbound context resulting from another app's broadcast.
    - Message names all end in 'Event'.
    - Each instance of an Agent Response Message is uniquely identified by a `meta.eventUuid` field.

Each individual message is also governed by a message schema, which is composed with the schema for the message type.

:::info

In rare cases, the payload of a request or event message may quote the `requestUuid` or `eventUuid` of another message that it represents a response to, e.g. `intentResultRequest` quotes the `eventUuid` of the `intentEvent` that delivered the intent and context to the app, as well as the `requestUuid` of the `raiseIntentRequest` message that originally raised the intent.

:::

All messages defined in the DACP follow a common structure:

```json
{
    "type": "string", // string identifying the message type
    "payload": {
        //message payload fields defined for each message type 
    },
    "meta": {
        "timestamp": "2024-09-17T10:15:39+00:00"
        //other meta fields determined by each 'class' of message
        //  these include requestUuid, responseUuid and eventUuid
        //  and a source field identifying an app where appropriate
    }
}
```

`meta.timestamp` fields are formatted as strings, according to the format defined by [ISO 8601-1:2019](https://www.iso.org/standard/70907.html), which is produced in JavaScript via the `Date` class's `toISOString()` function, e.g. `(new Date()).toISOString()`.

### Routing, Registering Listeners & Multiplexing

The design of the Desktop Agent Communication Protocol is guided by the following sentence from the introduction to the Desktop Agent overview:

> A Desktop Agent is a desktop component (or aggregate of components) that serves as a launcher and message router (broker) for applications in its domain.

Hence, that design is based on the assumption that all messaging between applications passes through an entity that acts as the 'Desktop Agent' and routes those messages on to the appropriate recipients (for example, a context message broadcast by an app to a channel is routed onto other apps that have added a listener to that channel, or an intent and context pair raised by an application is routed to another app chosen to resolve that intent). While implementations based on a shared bus are possible, they have not been specifically considered in the design of the DACP messages.

Further, the design of the DACP is based on the assumption that applications will interact with an implementation of the [`DesktopAgent`](../ref/DesktopAgent) interface, with the DACP used behind the scenes to support communication between the implementation of that interface and an entity acting as the Desktop Agent which is running in another process or location, necessitating the use of a 'wire protocol' for communication. For example, [Browser-Resident Desktop Agent](./browserResidentDesktopAgents) implementations use the [FDC3 Web Communication Protocol (WCP)](./webConnectionProtocol.md) to connect a 'Desktop Agent Proxy', provided by the `getAgent()` implementation in the [`@finos/fdc3` npm module](https://www.npmjs.com/package/@finos/fdc3), and a Desktop Agent running in another frame or window which is communicated with via the DACP.

As a Desktop Agent is expected to act as a router for messages sent through the Desktop Agent API, the DACP provides message exchanges for the registration and un-registration of listeners for particular message types (e.g. events, contexts broadcast on user channels, contexts broadcast on other channel types, raised intents etc.). In most cases, apps can register multiple listeners for the same messages (often filtered for different context or event types). However, where multiple listeners are present, only a single DACP message should be sent representing the action taken in the FDC3 API (e.g. broadcasting a message to a channel) and any multiplexing to multiple listeners should be applied at the receiving end. For example, when working with the WCP, this should be handled by the Desktop Agent Proxy implementation provided by the `getAgent()` implementation.

### Timeouts for Message Exchanges

As the DACP is used to communicate with a different browsing context, timeouts are applied to message exchanges allowing them to fail and for the Desktop Agent Proxy to return an error to the caller. A default timeout of 10 seconds is applied to all message exchanges, with the exception of those that may involve the launch of an application (`open()`, `raiseIntent()` and `raiseIntentForContext()`). Implementations of the FDC3 Desktop Agent API are required to allow a minimum timeout of 15 seconds for an application to launch and add any necessary context or intent listeners (see [Desktop Agent API Compliance](../spec#desktop-agent-api-standard-compliance) for further details). However, no upper bound for the timeout is currently specified. Message exchanges that involve the launch of an application use a default timeout of 100 seconds.

Desktop Agents may specify custom values for both the default message exchange timeout and the timeout used for exchanges that may involve the launch of an application. Custom values are passed to the Desktop Agent proxy by setting the optional `payload.messageExchangeTimeout` and `payload.appLaunchTimeout` fields in the `WCP3Handshake` Response sent by the Desktop Agent to an application connecting to it. `payload.messageExchangeTimeout` MUST be set to a value greater than or equal to 100 ms, and `payload.appLaunchTimeout`  MUST be set to a value greater than or equal to 15,000 ms.

```ts
/** Default timeout used by a DesktopAgentProxy for all message exchanges
 * with a DesktopAgent, except those that involve the launch of an application.
 * May be overridden by a DesktopAgent by passing a value in the
 * payload.messageExchangeTimeout of a WCP3Handshake message.
 */
export const DEFAULT_MESSAGE_EXCHANGE_TIMEOUT_MS = 10000;

/** Default timeout used by a DesktopAgentProxy for message exchanges with a
 * DesktopAgent that involve launching applications. May be overridden by a 
 * DesktopAgent by passing a value in the payload.appLaunchTimeout of a 
 * WCP3Handshake message.
 * */
export const DEFAULT_APP_LAUNCH_TIMEOUT_MS = 100000;
```

:::info

The message exchange timeouts are used to detect a lack of response from the Desktop Agent, which will be reported via the `ApiTimeout` error message. However, there are also defined error messages for apps failing to add an expected context listener (`OpenError.AppTimeout`) or intent listener (`ResolveError.IntentDeliveryFailed`) after launch. To return these errors, the Desktop Agent should set a longer timeout via the `payload.appLaunchTimeout` field in its `WCP3Handshake` message than it uses internally to detect such failures. Doing so will ensure that timeouts can be separately attributed to the App or to the Desktop Agent.

:::

## Message Definitions Supporting FDC3 API calls

This section provides details of the messages defined in the DACP, grouped according to the FDC3 API functions that they support, and defined by JSON Schema files. Many of these message definitions make use of JSON versions of [metadata](../ref/Metadata) and other [types](../ref/Types) defined by the Desktop Agent API, the JSON versions of which can be found in [api.schema.json](pathname:///schemas/2.2/api/api.schema.json), while a number of DACP specific object definitions that are reused through the messages can be found in [common.schema.json](pathname:///schemas/2.2/api/common.schema.json).

### `DesktopAgent`

#### `addContextListener()`

Request and response used to implement the [`DesktopAgent.addContextListener()`](../ref/DesktopAgent#addcontextlistener) and [`Channel.addContextListener()`](../ref/Channel#addcontextlistener) API calls:

- [`addContextListenerRequest`](pathname:///schemas/2.2/api/addContextListenerRequest.schema.json)
- [`addContextListenerResponse`](pathname:///schemas/2.2/api/addContextListenerResponse.schema.json)

Event message used to deliver context objects that have been broadcast to listeners:

- [`broadcastEvent`](pathname:///schemas/2.2/api/broadcastEvent.schema.json)

Request and response for removing the context listener ([`Listener.unsubscribe()`](../ref/Types#listener)):

- [`contextListenerUnsubscribeRequest`](pathname:///schemas/2.2/api/contextListenerUnsubscribeRequest.schema.json)
- [`contextListenerUnsubscribeResponse`](pathname:///schemas/2.2/api/contextListenerUnsubscribeResponse.schema.json)

#### `addEventListener()`

Request and response used to implement the [`addEventListener()`](../ref/DesktopAgent#addeventlistener) API call:

- [`addEventListenerRequest`](pathname:///schemas/2.2/api/addEventListenerRequest.schema.json)
- [`addEventListenerResponse`](pathname:///schemas/2.2/api/addEventListenerResponse.schema.json)

Event messages used to deliver events that have occurred:

- [`channelChangedEvent`](pathname:///schemas/2.2/api/channelChangedEvent.schema.json)

Request and response for removing the event listener ([`Listener.unsubscribe()`](../ref/Types#listener)):

- [`eventListenerUnsubscribeRequest`](pathname:///schemas/2.2/api/eventListenerUnsubscribeRequest.schema.json)
- [`eventListenerUnsubscribeResponse`](pathname:///schemas/2.2/api/eventListenerUnsubscribeResponse.schema.json)

#### `addIntentListener()`

Request and response used to implement the [`addIntentListener()`](../ref/DesktopAgent#addintentlistener) API call:

- [`addIntentListenerRequest`](pathname:///schemas/2.2/api/addIntentListenerRequest.schema.json)
- [`addIntentListenerResponse`](pathname:///schemas/2.2/api/addIntentListenerResponse.schema.json)

Event message used to a raised intent and context object from another app to the listener:

- [`intentEvent`](pathname:///schemas/2.2/api/intentEvent.schema.json)

An additional request and response used to deliver an [`IntentResult`](../ref/Types#intentresult) from the intent handler to the Desktop Agent, so that it can convey it back to the raising application:

- [`intentResultRequest`](pathname:///schemas/2.2/api/intentResultRequest.schema.json)
- [`intentResultResponse`](pathname:///schemas/2.2/api/intentResultResponse.schema.json)

Please note this exchange (and the `IntentResolution.getResult()` API call) support `void` results from a raised intent and hence this message exchange should occur for all raised intents, including those that do not return a result. In such cases, the void intent result allows resolution of the `IntentResolution.getResult()` API call and indicates that the intent handler has finished running.

Request and response for removing the intent listener ([`Listener.unsubscribe()`](../ref/Types#listener)):

- [`intentListenerUnsubscribeRequest`](pathname:///schemas/2.2/api/intentListenerUnsubscribeRequest.schema.json)
- [`intentListenerUnsubscribeResponse`](pathname:///schemas/2.2/api/intentListenerUnsubscribeResponse.schema.json)

A typical exchange of messages between an app raising an intent, a Desktop agent and an app resolving an intent is:

```mermaid
sequenceDiagram
    AppA ->> DesktopAgent: raiseIntentRequest
    DesktopAgent ->> AppB: intentEvent
    DesktopAgent ->> AppA: raiseIntentResponse
    AppB ->> DesktopAgent: intentResultRequest
    DesktopAgent ->> AppB: intentResultResponse
    DesktopAgent ->> AppA: raiseIntentResultResponse
```

The above flow assumes that AppB has already been launched and added an intent listener. As apps can be launched to resolve an intent a typical message exchange (that includes registration of the intent listener) is:

```mermaid
sequenceDiagram
    AppA ->> DesktopAgent: raiseIntentRequest
    break intent resolution determines a new instance of AppB should be launched
        DesktopAgent -->> AppB: Launch
        AppB -->> DesktopAgent: Connect via WCP
    end
    AppB ->> DesktopAgent: addIntentListenerRequest
    DesktopAgent ->> AppB: addIntentListenerResponse
    DesktopAgent ->> AppB: intentEvent
    DesktopAgent ->> AppA: raiseIntentResponse
    AppB ->> DesktopAgent: intentResultRequest
    DesktopAgent ->> AppB: intentResultResponse
    DesktopAgent ->> AppA: raiseIntentResultResponse
```

:::tip

See [`raiseIntent`](#raiseintent) below for further examples of message exchanges involved in raising intents and intent resolution.

:::

#### `broadcast()`

Request and response used to implement the [`DesktopAgent.broadcast()`](../ref/DesktopAgent#broadcast) and [`Channel.broadcast()`](../ref/Channel#broadcast) API calls:

- [`broadcastRequest`](pathname:///schemas/2.2/api/broadcastRequest.schema.json)
- [`broadcastResponse`](pathname:///schemas/2.2/api/broadcastResponse.schema.json)

See [`addContextListener()`](#addcontextlistener) above for the `broadcastEvent` used to deliver the broadcast to other apps.

#### `createPrivateChannel()`

Request and response used to implement the [`createPrivateChannel()`](../ref/DesktopAgent#createprivatechannel) API call:

- [`createPrivateChannelRequest`](pathname:///schemas/2.2/api/createPrivateChannelRequest.schema.json)
- [`createPrivateChannelResponse`](pathname:///schemas/2.2/api/createPrivateChannelResponse.schema.json)

#### `findInstances()`

Request and response used to implement the [`findInstances()`](../ref/DesktopAgent#findinstances) API call:

- [`findInstancesRequest`](pathname:///schemas/2.2/api/findInstancesRequest.schema.json)
- [`findInstancesResponse`](pathname:///schemas/2.2/api/findInstancesResponse.schema.json)

#### `findIntent()`

Request and response used to implement the [`findIntent()`](../ref/DesktopAgent#findintent) API call:

- [`findIntentRequest`](pathname:///schemas/2.2/api/findIntentRequest.schema.json)
- [`findIntentResponse`](pathname:///schemas/2.2/api/findIntentResponse.schema.json)

#### `findIntentsByContext()`

Request and response used to implement the [`findIntentsByContext()`](../ref/DesktopAgent#findintentsbycontext) API call:

- [`findIntentsByContextRequest`](pathname:///schemas/2.2/api/findIntentsByContextRequest.schema.json)
- [`findIntentsByContextResponse`](pathname:///schemas/2.2/api/findIntentsByContextResponse.schema.json)

#### `getAppMetadata()`

Request and response used to implement the [`getAppMetadata()`](../ref/DesktopAgent#getappmetadata) API call:

- [`getAppMetadataRequest`](pathname:///schemas/2.2/api/getAppMetadataRequest.schema.json)
- [`getAppMetadataResponse`](pathname:///schemas/2.2/api/getAppMetadataResponse.schema.json)

#### `getCurrentChannel()`

Request and response used to implement the [`getCurrentChannel()`](../ref/DesktopAgent#getcurrentchannel) API call:

- [`getCurrentChannelRequest`](pathname:///schemas/2.2/api/getCurrentChannelRequest.schema.json)
- [`getCurrentChannelResponse`](pathname:///schemas/2.2/api/getCurrentChannelResponse.schema.json)

#### `getInfo()`

Request and response used to implement the [`getInfo()`](../ref/DesktopAgent#getinfo) API call:

- [`getInfoRequest`](pathname:///schemas/2.2/api/getInfoRequest.schema.json)
- [`getInfoResponse`](pathname:///schemas/2.2/api/getInfoResponse.schema.json)

#### `getOrCreateChannel()`

Request and response used to implement the [`getOrCreateChannel()`](../ref/DesktopAgent#getorcreatechannel) API call:

- [`getOrCreateChannelRequest`](pathname:///schemas/2.2/api/getOrCreateChannelRequest.schema.json)
- [`getOrCreateChannelResponse`](pathname:///schemas/2.2/api/getOrCreateChannelResponse.schema.json)

#### `getUserChannels()`

Request and response used to implement the [`getUserChannels()`](../ref/DesktopAgent#getuserchannels) API call:

- [`getUserChannelsRequest`](pathname:///schemas/2.2/api/getUserChannelsRequest.schema.json)
- [`getUserChannelsResponse`](pathname:///schemas/2.2/api/getUserChannelsResponse.schema.json)

#### `joinUserChannel()`

Request and response used to implement the [`joinUserChannel()`](../ref/DesktopAgent#joinuserchannel) API call:

- [`joinUserChannelRequest`](pathname:///schemas/2.2/api/joinUserChannelRequest.schema.json)
- [`joinUserChannelResponse`](pathname:///schemas/2.2/api/joinUserChannelResponse.schema.json)

#### `leaveCurrentChannel()`

Request and response used to implement the [`leaveCurrentChannel()`](../ref/DesktopAgent#leavecurrentchannel) API call:

- [`leaveCurrentChannelRequest`](pathname:///schemas/2.2/api/leaveCurrentChannelRequest.schema.json)
- [`leaveCurrentChannelResponse`](pathname:///schemas/2.2/api/leaveCurrentChannelResponse.schema.json)

#### `open()`

Request and response used to implement the [`open()`](../ref/DesktopAgent#open) API call:

- [`openRequest`](pathname:///schemas/2.2/api/openRequest.schema.json)
- [`openResponse`](pathname:///schemas/2.2/api/openResponse.schema.json)

Where a context object is passed (e.g. `fdc3.open(app, context)`) the `broadcastEvent` message described above in [`addContextListener`](#addcontextlistener) should be used to deliver it after the context listener has been added:

```mermaid
sequenceDiagram
    AppA ->> DesktopAgent: openRequest<br>(with context)
    break Desktop Agent launches AppB
        DesktopAgent -->> AppB: Launch
        AppB -->> DesktopAgent: Connect via WCP
    end
    AppB ->> DesktopAgent: addContextListenerRequest
    DesktopAgent ->> AppB: addContextListenerResponse
    DesktopAgent ->> AppB: broadcastEvent
    DesktopAgent ->> AppA: openResponse<br/>(with AppIdentifier)
```

However, if the app opened doesn't add a context listener within a timeout (defined by the Desktop Agent) then the `openResponse` should be sent with `AppTimeout` error from the [`OpenError`](../ref/Errors#openerror) enumeration.

:::tip

Desktop Agents MUST allow at least 15 seconds for an app to add a context listener before timing out (see [Desktop Agent API Standard Compliance](https://fdc3.finos.org/docs/next/api/spec#desktop-agent-api-standard-compliance) for more detail) and applications SHOULD add their listeners as soon as possible to keep the delay short (see the [addContextListener reference doc](https://fdc3.finos.org/docs/next/api/ref/DesktopAgent#addcontextlistener)).

:::

#### `raiseIntent()`

Request and response used to implement the [`raiseIntent()`](../ref/DesktopAgent#raiseintent) API call:

- [`raiseIntentRequest`](pathname:///schemas/2.2/api/raiseIntentRequest.schema.json)
- [`raiseIntentResponse`](pathname:///schemas/2.2/api/raiseIntentResponse.schema.json)

An additional response message is provided for the delivery of an `IntentResult` from the resolving application to the raising application (which is collected via the [`IntentResolution.getResult()`](../ref/Metadata#intentresolution) API call), which should quote the `requestUuid` from the original `raiseIntentRequest`:

- [`raiseIntentResultResponse`](pathname:///schemas/2.2/api/raiseIntentResultResponse.schema.json)

There is no request message to indicate a call to the `resolution.getResult()` function of `IntentResolution`. Hence, Desktop Agents MUST send this additional response message to indicate the status of the intent handling function and to deliver its result (or void if none was returned).

:::tip

See [`addIntentListener`](#addintentlistener) above for details of the messages used for the resolving app to deliver the result to the Desktop Agent.

:::

Where there are multiple options for resolving a raised intent, there are two possible versions of the resulting message exchanges. Which to use depends on whether the Desktop Agent uses an intent resolver user interface (or other suitable mechanism) that it controls, or one injected into the application (for example an iframe injected by a `getAgent()` implementation into an application window) to perform resolution.

When working with an injected interface, the Desktop Agent should respond with a `raiseIntentResponse` containing a `RaiseIntentNeedsResolutionResponsePayload`:

```mermaid
---
title: Intent resolution with injected Intent Resolver iframe
---
sequenceDiagram
    AppA ->> DesktopAgent: raiseIntentRequest
    DesktopAgent ->> AppA: raiseIntentResponse
    Note left of DesktopAgent: raiseIntentResponse includes a<br/> RaiseIntentNeedsResolutionResponsePayload<br/>containing an AppIntent
    break when AppIntent return with multiple options
        DesktopAgent --> AppA: getAgent displays IntentResolver
        AppA --> DesktopAgent: User picks an option
    end
    AppA ->> DesktopAgent: raiseIntentRequest
    Note left of DesktopAgent: New request includes a<br/>specific 'app' target<br/>and new requestUuid
    DesktopAgent ->> AppB: intentEvent
    DesktopAgent ->> AppA: raiseIntentResponse
    AppB ->> DesktopAgent: intentResultRequest
    DesktopAgent ->> AppB: intentResultResponse
    DesktopAgent ->> AppA: raiseIntentResultResponse
```

Alternatively, if the Desktop Agent is able to provide its own user interface or another suitable means of resolving the intent, then it may do so and respond with a `raiseIntentResponse` containing a `RaiseIntentSuccessResponsePayload`:

```mermaid
---
title: Intent resolution with Desktop Agent provided Intent Resolver
---
sequenceDiagram
    AppA ->> DesktopAgent: raiseIntentRequest
    break DA determines there are multiple options
        DesktopAgent-->AppA: Desktop Agent displays an<br/>IntentResolver UI
        AppA-->DesktopAgent: User picks an option
    end
    DesktopAgent ->> AppB: intentEvent
    DesktopAgent ->> AppA: raiseIntentResponse
    Note left of DesktopAgent: DesktopAgent responds<br/>to the original<br/>raiseIntentRequest message with<br/>a RaiseIntentSuccessResponsePayload
    AppB ->> DesktopAgent: intentResultRequest
    DesktopAgent ->> AppB: intentResultResponse
    DesktopAgent ->> AppA: raiseIntentResultResponse
```

#### `raiseIntentForContext()`

Request and response used to implement the [`raiseIntentForContext()`](../ref/DesktopAgent#raiseintentforcontext) API call:

- [`raiseIntentForContextRequest`](pathname:///schemas/2.2/api/raiseIntentForContextRequest.schema.json)
- [`raiseIntentForContextResponse`](pathname:///schemas/2.2/api/raiseIntentForContextResponse.schema.json)

Message exchanges for handling `raiseIntentForContext()` are the same as for `raiseIntent`, except for the substitution of `raiseIntentForContextRequest` for `raiseIntentRequest` and `raiseIntentForContextResponse` for `raiseIntentResponse`. Hence, please see [`raiseIntent`](#raiseintent) and [`addIntentListener`](#addintentlistener) for further details.

### `Channel`

Owing to the significant overlap between the FDC3 [`DesktopAgent`](../ref/DesktopAgent) and [`Channel`](../ref/Channel) interfaces, which includes the ability to retrieve and work with User channels as App Channels, most of the messaging for the `Channel` API is shared with `DesktopAgent`. Specifically, all messages defined in the the [`broadcast`](#broadcast) and [`addContextListener`](#addcontextlistener) sections above are reused, with a few minor differences to note:

- When working with a specific channel, the `channelId` property in `addContextListenerRequest` should be set to the ID of the channel, where it is set to `null` to work with the current user channel.
- When receiving a `broadcastEvent` a `channelId` that is `null` indicates that the context was sent via a call to `fdc3.open` and does not relate to a channel.

The following additional function is unique to the `Channel` interface:

#### `getCurrentContext()`

Request and response used to implement the [`Channel.getCurrentContext()`](../ref/Channel#getcurrentcontext) API call:

- [`getCurrentContextRequest`](pathname:///schemas/2.2/api/getCurrentContextRequest.schema.json)
- [`getCurrentContextResponse`](pathname:///schemas/2.2/api/getCurrentContextResponse.schema.json)

### `PrivateChannel`

The [`PrivateChannel`](../ref/PrivateChannel) interface extends [`Channel`](../ref/Channel) with a number of additional functions that are supported by the following messages:

#### `addEventListener()`

Request and response used to implement the [`PrivateChannel.addEventListener`](../ref/PrivateChannel#addeventlistener) API call:

- [`privateChanneladdEventListenerRequest`](pathname:///schemas/2.2/api/privateChanneladdEventListenerRequest.schema.json)
- [`privateChanneladdEventListenerResponse`](pathname:///schemas/2.2/api/privateChanneladdEventListenerResponse.schema.json)

Event messages used to deliver events that have occurred:

- [`privateChannelOnAddContextListenerEvent`](pathname:///schemas/2.2/api/privateChannelOnAddContextListenerEvent.schema.json)
- [`privateChannelOnDisconnectEvent`](pathname:///schemas/2.2/api/privateChannelOnDisconnectEvent.schema.json)
- [`privateChannelOnUnsubscribeEvent`](pathname:///schemas/2.2/api/privateChannelOnUnsubscribeEvent.schema.json)

:::tip

The above messages may also be used to implement the deprecated [`onAddContextListener()`](../ref/PrivateChannel#onaddcontextlistener), [`onUnsubscribe`](../ref/PrivateChannel#onunsubscribe) and [`onDisconnect`](../ref/PrivateChannel#ondisconnect) functions of the `PrivateChannel` interface.

:::

Message exchange for removing the event listener [`Listener.unsubscribe`](../ref/Types#listener):

- [`privateChannelUnsubscribeEventListenerRequest`](pathname:///schemas/2.2/api/privateChannelUnsubscribeEventListenerRequest.schema.json)
- [`privateChannelUnsubscribeEventListenerResponse`](pathname:///schemas/2.2/api/privateChannelUnsubscribeEventListenerResponse.schema.json)

#### `disconnect()`

Request and response used to implement the [`PrivateChannel.disconnect()`](../ref/PrivateChannel#disconnect) API call:

- [`privateChannelDisconnectRequest`](pathname:///schemas/2.2/api/privateChannelDisconnectRequest.schema.json)
- [`privateChannelDisconnectResponse`](pathname:///schemas/2.2/api/privateChannelDisconnectResponse.schema.json)

### Checking apps are alive

Depending on the connection over which the Desktop Agent and app are connected, it may be necessary for the Desktop Agent to check whether the application is still alive. This can be done, either periodically or on demand (for example to validate options that will be provided in an [`AppIntent`](../ref/Metadata#appintent) as part of a `findIntentResponse` or `raiseIntentResponse` and displayed in an intent resolver interface), using the following message exchange:

- [`heartbeatEvent`](pathname:///schemas/2.2/api/heartbeatEvent.schema.json)
- [`heartbeatAcknowledgment`](pathname:///schemas/2.2/api/heartbeatAcknowledgment.schema.json)

As a Desktop Agent initiated exchange, it is initiated with an `AgentEvent` message and completed via an `AppRequest` message as an acknowledgement.

:::tip

Additional procedures are defined in the [Browser Resident Desktop Agents specification](./browserResidentDesktopAgents#disconnects) and [Web Connection Protocol](./webConnectionProtocol#step-5-disconnection) for the detection of app disconnection or closure. Implementations will often need to make use of multiple procedures to catch all forms of disconnection in a web browser.

:::

### Controlling Injected User Interfaces

Desktop Agent implementations, such as those based on the [Browser Resident Desktop Agents specification](./browserResidentDesktopAgents) and [Web Connection Protocol](./webConnectionProtocol), may either provide their own user interfaces (or other appropriate mechanisms) for the selection of User Channels or Intent Resolution, or they may work with implementations injected into the application (for example, as described in the [Web Connection Protocol](./webConnectionProtocol#providing-channel-selector-and-intent-resolver-uis) and implemented in [`getAgent()`](../ref/GetAgent)).

Where injected user interfaces are used, standardized messaging is needed to communicate with those interfaces. This is provided in the DACP via the following 'iframe' messages, which are governed by the [`Fdc3UserInterfaceMessage`](pathname:///schemas/2.2/api/fdc3UserInterface.schema.json) schema. The following messages are provided:

- [`Fdc3UserInterfaceHello`](pathname:///schemas/2.2/api/fdc3UserInterfaceHello.schema.json): Sent by the iframe to its `window.parent` frame to initiate communication and to provide initial CSS to apply to the frame. This message should have a `MessagePort` appended over which further communication will be conducted.
- [`Fdc3UserInterfaceHandshake`](pathname:///schemas/2.2/api/fdc3UserInterfaceHandshake.schema.json):  Response to the `Fdc3UserInterfaceHello` message sent by the application frame, which should be sent over the `MessagePort`. Includes details of the FDC3 version that the application is using.
- [`Fdc3UserInterfaceDrag`](pathname:///schemas/2.2/api/fdc3UserInterfaceDrag.schema.json): Message sent by the iframe to indicate that it is being dragged to a new position and including offsets to indicate direction and distance.
- [`Fdc3UserInterfaceRestyle`](pathname:///schemas/2.2/api/fdc3UserInterfaceRestyle.schema.json): Message sent by the iframe to indicate that its frame should have updated CSS applied to it, for example to support a channel selector interface that can be 'popped open' or an intent resolver that wishes to resize itself to show additional content.

Messages are also provided that are specific to each user interface type provided by a Desktop Agent. The following messages are specific to Channel Selector user interfaces:

- [`Fdc3UserInterfaceChannels`](pathname:///schemas/2.2/api/fdc3UserInterfaceChannels.schema.json): Sent by the parent frame to initialize a Channel Selector user interface by providing metadata for the Desktop Agent's user channels and details of any channel that is already selected. This message will typically be sent by a `getAgent()` implementation immediately after the `fdc3UserInterfaceHandshake` and before making the injected iframe visible.
- [`Fdc3UserInterfaceChannelSelected`](pathname:///schemas/2.2/api/fdc3UserInterfaceChannelSelected.schema.json): Sent by the Channel Selector to indicate that a channel has been selected or deselected.

Messages specific to Intent Resolver user interfaces:

- [`Fdc3UserInterfaceResolve`](pathname:///schemas/2.2/api/fdc3UserInterfaceResolve.schema.json): Sent by the parent frame to initialize an Intent Resolver user interface to resolve a raised intent, before making the iframe visible. The message includes the context object sent with the intent and an array of one or more [`AppIntent`](../ref/Metadata#appintent) objects representing the resolution options for the intent ([`raiseIntent`](../ref/DesktopAgent#raiseintent)) or context ([`raiseIntentForContext`](../ref/DesktopAgent#raiseintentforcontext)) that was raised.
- [`Fdc3UserInterfaceResolveAction`](pathname:///schemas/2.2/api/fdc3UserInterfaceResolveAction.schema.json): Sent by the Intent Resolver to indicate actions taken by the user in the interface, including hovering over an option, clicking a cancel button, or selecting a resolution option. The Intent Resolver should be hidden by the `getAgent()` implementation after a resolution option is selected to ensure that it does not interfere with user's ongoing interaction with the app's user interface.
