import type { WorkerInbound } from "@harmony/protocol";
import type { PortRegistry } from "./ports";
import type { HandlerMap, Send } from "./types";

type Handler = (message: WorkerInbound, send: Send) => Promise<void>;

export function createDispatcher(handlers: HandlerMap, ports: PortRegistry) {
  return async (port: MessagePort, message: WorkerInbound) => {
    const isRequest = "id" in message;

    const send: Send = {
      port,
      respond(payload) {
        if (isRequest) {
          port.postMessage({ ...payload, id: message.id });
        }
      },
      broadcast(payload) {
        ports.broadcast(payload);
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
      await (handler as Handler)(message, send);
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
