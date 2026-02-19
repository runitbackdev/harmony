import type { WorkerInbound } from "@harmony/protocol";
import type { HandlerMap, Send } from "./types";

export function createDispatcher(handlers: HandlerMap) {
  return async (port: MessagePort, message: WorkerInbound) => {
    const isRequest = "id" in message;

    const send: Send = {
      respond(payload) {
        if (isRequest) {
          port.postMessage({ ...payload, id: message.id });
        }
      },
      stream(payload) {
        port.postMessage(payload);
      },
    };

    const handler = handlers[message.type];

    if (!handler) {
      if (isRequest) {
        send.respond({
          type: "h.error",
          requestType: message.type,
          code: "unknown",
          message: `No handler for message type: ${message.type}`,
        });
      }
      return;
    }

    try {
      await (handler as Function)(message, send);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      if (isRequest) {
        send.respond({
          type: "h.error",
          requestType: message.type,
          code: "unknown",
          message: errorMessage,
        });
      } else {
        console.error(`Command ${message.type} failed:`, errorMessage);
      }
    }
  };
}
