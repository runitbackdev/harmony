import type {
  BridgeOutbound,
  BridgeRequest,
  BridgeSubscribe,
  HarmonyError,
  RpcResult,
  StreamHandle,
  Transport,
} from "./index";
import { isBridgeOutbound } from "./index";

type PendingRequest = {
  resolve: (result: RpcResult<unknown>) => void;
  reject: (error: Error) => void;
};

type ActiveSubscription = {
  resolveInitial: (result: RpcResult<unknown>) => void;
  rejectInitial: (error: Error) => void;
  onChunk: (chunk: unknown) => void;
};

/**
 * Client-side Transport adapter for a web SharedWorker host.
 *
 * Communicates with {@link createWorkerDispatcher} over a MessagePort using
 * the bridge envelope shapes defined in `./index.ts`. Coexists with the
 * legacy `WorkerConnection`; the worker disambiguates by the `kind` field.
 */
export class TransportSharedWorker implements Transport {
  private readonly port: MessagePort;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly subscriptions = new Map<string, ActiveSubscription>();
  private nextId = 0;
  private disposed = false;
  private readonly handleUnload: () => void;

  constructor(port: MessagePort) {
    this.port = port;
    this.port.addEventListener("message", this.handleMessage);
    this.port.start();

    this.handleUnload = () => {
      try {
        this.port.postMessage({ kind: "connection.close" });
      } catch {
        // Port already closed; ignore.
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.handleUnload);
    }
  }

  request(name: string, input: unknown): Promise<RpcResult<unknown>> {
    if (this.disposed) {
      return Promise.resolve(errorResult("unknown", "transport disposed"));
    }
    const id = this.allocateId("req");
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const message: BridgeRequest = { kind: "request", id, name, input };
      this.port.postMessage(message);
    });
  }

  command(name: string, input: unknown): void {
    if (this.disposed) return;
    this.port.postMessage({ kind: "command", name, input });
  }

  subscribe(
    name: string,
    input: unknown,
    onChunk: (chunk: unknown) => void,
  ): StreamHandle<unknown> {
    if (this.disposed) {
      return {
        initial: Promise.resolve(errorResult("unknown", "transport disposed")),
        unsubscribe: () => {},
      };
    }
    const id = this.allocateId("sub");

    const initial = new Promise<RpcResult<unknown>>((resolve, reject) => {
      this.subscriptions.set(id, {
        resolveInitial: resolve,
        rejectInitial: reject,
        onChunk,
      });
      const message: BridgeSubscribe = { kind: "subscribe", id, name, input };
      this.port.postMessage(message);
    });
    return {
      initial,
      unsubscribe: () => {
        if (!this.subscriptions.delete(id)) return;
        try {
          this.port.postMessage({ kind: "unsubscribe", id });
        } catch {
          // Port may already be closed.
        }
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.handleUnload);
    }
    this.handleUnload();
    this.port.removeEventListener("message", this.handleMessage);
    for (const { reject } of this.pending.values()) {
      reject(new Error("transport disposed"));
    }
    this.pending.clear();
    for (const { rejectInitial } of this.subscriptions.values()) {
      rejectInitial(new Error("transport disposed"));
    }
    this.subscriptions.clear();
  }

  private readonly handleMessage = (event: MessageEvent) => {
    const data = event.data as unknown;
    if (!isBridgeOutbound(data)) return;
    this.deliver(data);
  };

  private deliver(message: BridgeOutbound) {
    if (message.kind === "response") {
      const pending = this.pending.get(message.id);
      if (pending) {
        this.pending.delete(message.id);
        pending.resolve(message.result);
        return;
      }
      const subscription = this.subscriptions.get(message.id);

      if (subscription) {
        subscription.resolveInitial(message.result);
        if (!message.result.ok) this.subscriptions.delete(message.id);
      }
      return;
    }
    const subscription = this.subscriptions.get(message.id);

    if (subscription) subscription.onChunk(message.chunk);
  }

  private allocateId(prefix: string): string {
    this.nextId += 1;
    return `${prefix}_${this.nextId}`;
  }
}

function errorResult(code: string, message?: string): RpcResult<never> {
  const error: HarmonyError = { code };
  if (message !== undefined) error.message = message;
  return { ok: false, error };
}
