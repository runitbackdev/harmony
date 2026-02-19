import type {
  CommandKey,
  ResponseMap,
  StreamMessage,
  WorkerInbound,
  WorkerOutbound,
} from "@harmony/protocol";

type PendingRequest = {
  resolve: (message: any) => void;
  reject: (error: Error) => void;
};

export type StreamListener = (message: StreamMessage) => void;

type Payload<T extends string> = Omit<
  Extract<WorkerInbound, { type: T }>,
  "type" | "id"
>;

export class WorkerConnection {
  private port: MessagePort;
  private pending = new Map<string, PendingRequest>();
  private streamListeners = new Set<StreamListener>();
  private currentId = 0;

  constructor(worker: SharedWorker) {
    this.port = worker.port;
    this.port.onmessage = (
      event: MessageEvent<WorkerOutbound | StreamMessage>,
    ) => {
      this.handleMessage(event.data);
    };
    this.port.start();
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

  on(listener: StreamListener): () => void {
    this.streamListeners.add(listener);

    return () => this.streamListeners.delete(listener);
  }

  private handleMessage(message: WorkerOutbound | StreamMessage) {
    if ("id" in message && message.id) {
      const pending = this.pending.get(message.id);

      if (pending) {
        this.pending.delete(message.id);

        if (message.type === "h.error") {
          pending.reject(
            new Error(`${message.message} from ${message.requestType}`),
          );
        } else {
          pending.resolve(message);
        }
      }

      return;
    }

    this.streamListeners.forEach((listener) =>
      listener(message as StreamMessage),
    );
  }

  private nextId(): string {
    return `req_${++this.currentId}`;
  }
}
