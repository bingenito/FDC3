import { AppRequestMessageMeta, AgentResponseMessage } from '@kite9/fdc3-schema/generated/api/BrowserTypes';
import { v4 as uuidv4 } from 'uuid';

export function createResponseMeta(m: AppRequestMessageMeta): AgentResponseMessage['meta'] {
  const meta: AgentResponseMessage['meta'] = {
    requestUuid: m.requestUuid,
    responseUuid: uuidv4(),
    source: m.source,
    timestamp: new Date(),
  };
  return meta;
}
