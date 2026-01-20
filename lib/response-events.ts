import { EventEmitter } from "events";

export type ResponseEventPayload = {
  total?: number;
  delta?: number;
};

const RESPONSE_EVENT = "responses:updated";

const getEmitter = () => {
  if (!globalThis.__sompResponseEmitter) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    globalThis.__sompResponseEmitter = emitter;
  }
  return globalThis.__sompResponseEmitter;
};

export const responseEvents = getEmitter();
export { RESPONSE_EVENT };

declare global {
  // eslint-disable-next-line no-var
  var __sompResponseEmitter: EventEmitter | undefined;
}
