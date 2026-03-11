import type {
  CommandKey,
  ResponseMap,
  StreamMap,
  StreamMessage,
  WorkerInbound,
  WorkerOutbound,
} from "@harmony/protocol";
import { Emitter } from "./emitter";

type PendingRequest = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolve: (message: any) => void;
  reject: (error: Error) => void;
};

type Payload<T extends string> = Omit<
  Extract<WorkerInbound, { type: T }>,
  "type" | "id"
>;

export class WorkerConnection {
  private port: MessagePort;
  private pending = new Map<string, PendingRequest>();
  private emitter = new Emitter<StreamMap>();
  private currentId = 0;
  private handleUnload: () => void;

  constructor(worker: SharedWorker) {
    this.port = worker.port;
    this.port.onmessage = (event: MessageEvent) => {
      this.handleMessage(event.data);
    };
    this.port.start();

    this.handleUnload = () => {
      this.port.postMessage({ type: "h.connection.close" });
    };
    window.addEventListener("beforeunload", this.handleUnload);
  }

  dispose() {
    window.removeEventListener("beforeunload", this.handleUnload);
    this.handleUnload();
  }

  request<T extends keyof ResponseMap>(
    type: T,
    payload: Payload<T>,
  ): Promise<ResponseMap[T]> {
    const id = this.nextId();

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.port.postMessage({ ...payload, type, id });
    });
  }

  command<T extends CommandKey>(type: T, payload: Payload<T>) {
    this.port.postMessage({ ...payload, type });
  }

  on<T extends keyof StreamMap>(
    type: T,
    listener: (message: StreamMap[T]) => void,
  ): () => void {
    return this.emitter.on(type, listener);
  }

  private handleMessage(message: WorkerOutbound | StreamMessage) {
    if (!("id" in message)) {
      this.emitter.emit(message.type, message);
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;

    this.pending.delete(message.id);

    if (message.type === "h.error") {
      pending.reject(
        new Error(`${message.message} from ${message.requestType}`),
      );
    } else {
      pending.resolve(message);
    }
  }

  private nextId(): string {
    return `req_${++this.currentId}`;
  }
}
