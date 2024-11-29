import { HeartbeatAcknowledgementRequest, HeartbeatEvent } from "@kite9/fdc3-schema/generated/api/BrowserTypes";
import { Messaging } from "../Messaging";
import { RegisterableListener } from "./RegisterableListener";

export class HeartbeatListener implements RegisterableListener {

    readonly id: string;
    readonly messaging: Messaging;

    constructor(messaging: Messaging) {
        this.id = "heartbeat-" + messaging.createUUID();
        this.messaging = messaging;
    }

    filter(m: any): boolean {
        return m.type === "heartbeatEvent";
    }

    action(_m: any): void {
        this.messaging.post({
            type: "heartbeatAcknowledgementRequest",
            meta: {
                requestUuid: this.messaging.createUUID(),
                timestamp: new Date()
            },
            payload: {
                heartbeatEventUuid: (_m as HeartbeatEvent).meta.eventUuid
            }
        } as HeartbeatAcknowledgementRequest);
        //console.log("Heartbeat acknowledged")
    }

    async register(): Promise<void> {
        this.messaging.register(this);
    }

    async unsubscribe(): Promise<void> {
        this.messaging.unregister(this.id);
    }

}