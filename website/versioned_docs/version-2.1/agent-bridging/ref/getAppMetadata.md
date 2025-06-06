---
id: getAppMetadata
sidebar_label: getAppMetadata
title: getAppMetadata
---

Desktop Agent bridging message exchange for a `getAppMetadata` API call on the [`DesktopAgent`](../../api/ref/DesktopAgent). Generated by API calls:

- [`getAppMetadata(app: AppIdentifier): Promise<AppMetadata>`](../../api/ref/DesktopAgent#getappmetadata)

[Message Exchange Type](../spec#individual-message-exchanges): **Request Response (single)**

E.g.

```javascript
let appIdentifier = { appId: "myApp@my.appd.com", desktopAgent: "agent-B" }
let appMetadata = await fdc3.getAppMetadata(appIdentifier);
```

:::info
`fdc3.getAppMetadata` calls should only involve the Desktop Agent Bridge where a `desktopAgent` field appears in the AppIdentifier being queried, all other calls should be handled locally by the Desktop Agent. Hence, the `payload.app.desktopAgent` is required on all requests.
:::

## Message exchange

```mermaid
sequenceDiagram
    box Desktop Agent A
    participant AA as App A
    participant DA as Desktop Agent A
    end
    participant DAB as Desktop Agent Bridge
    participant DB as Desktop Agent B
    participant DC as Desktop Agent C
    AA --) DA: fdc3.getAppMetadata()
    DA ->> DAB: getAppMetadataRequest
    DAB ->> DB: getAppMetadataRequest
    DB ->> DAB: getAppMetadataResponse (B)
    DAB ->> DA: getAppMetadataResponse (B)
    DA --) AA: resolve (AppMetadata)
```

## Request format

### Request message schemas

- [https://fdc3.finos.org/schemas/2.1/bridging/getAppMetadataAgentRequest.schema.json](pathname:///schemas/2.1/bridging/getAppMetadataAgentRequest.schema.json)
- [https://fdc3.finos.org/schemas/2.1/bridging/getAppMetadataBridgeRequest.schema.json](pathname:///schemas/2.1/bridging/getAppMetadataBridgeRequest.schema.json)

### Example

Outward message to the bridge:

```json
// agent-A -> DAB
{
    "type": "getAppMetadataRequest",
    "payload": {
        "app": {
            { "appId": "myApp@my.appd.com", "desktopAgent": "agent-B" }
        }
    },
    "meta": {
        "requestUuid": "<requestUuid>",
        "timestamp": "2020-03-...",
        "source": {
            "appId": "AChatApp",
            "instanceId": "02e575aa-4c3a-4b66-acad-155073be21f6"
        }
    }
}
```

which is repeated on to the target agent as:

```json
// DAB -> agent-B
{
    "type": "getAppMetadataRequest",
    "payload": {
        "app": {
            { "appId": "myApp@my.appd.com", "desktopAgent": "agent-B" }
        }
    },
    "meta": {
        "requestUuid": "<requestUuid>",
        "timestamp": "2020-03-...",
        "source": {
            "appId": "AChatApp",
            "instanceId": "02e575aa-4c3a-4b66-acad-155073be21f6",
            "desktopAgent": "agent-A" //added by DAB
        }
    }
}
```

## Response format

### Response message schemas

- [https://fdc3.finos.org/schemas/2.1/bridging/getAppMetadataAgentResponse.schema.json](pathname:///schemas/2.1/bridging/getAppMetadataAgentResponse.schema.json)
- [https://fdc3.finos.org/schemas/2.1/bridging/getAppMetadataAgentErrorResponse.schema.json](pathname:///schemas/2.1/bridging/getAppMetadataAgentErrorResponse.schema.json)
- [https://fdc3.finos.org/schemas/2.1/bridging/getAppMetadataBridgeResponse.schema.json](pathname:///schemas/2.1/bridging/getAppMetadataBridgeResponse.schema.json)
- [https://fdc3.finos.org/schemas/2.1/bridging/getAppMetadataBridgeErrorResponse.schema.json](pathname:///schemas/2.1/bridging/getAppMetadataBridgeErrorResponse.schema.json)

### Example

Response message from a Desktop Agent:

```json
// agent-B -> DAB
{
    "type":  "getAppMetadataResponse",
    "payload": {
        "appMetadata": { 
            "appId": "myApp@my.appd.com",
            "name": "myApp",
            "version": "1.0",
            "title": "My example application",
            "tooltip": " A tooltip for the application that can be used to render UI elements.",
            "description": "A longer, multi-paragraph description for the application that could include mark-up.",
            "icons": [..],
            "screenshots": [...] 
        }
    },
    "meta": {
        "requestUuid": "<requestUuid>",
        "responseUuid":  "<responseUuidAgentB>",
        "timestamp":  "2020-03-...",
    }
}
```

The bridge receives the response, augments the appMetadata with a `desktopAgent` field, producing the following response which it sends back to agent-A:

```json
// DAB -> agent-A
{
    "type":  "getAppMetadataResponse",
    "payload": {
        "appMetadata": { 
            "appId": "myApp@my.appd.com",
            "name": "myApp",
            "version": "1.0",
            "title": "My example application",
            "tooltip": " A tooltip for the application that can be used to render UI elements.",
            "description": "A longer, multi-paragraph description for the application that could include mark-up.",
            "icons": [..],
            "screenshots": [...],
            "desktopAgent": "agent-B" //added by DAB
        }
    },
    "meta": {
        "requestUuid": "<requestUuid>",
        "responseUuid":  "<responseUuidAgentB>",
        "timestamp":  "2020-03-...",
        "sources": [{ "desktopAgent": "agent-B" }]
    }
}
```
