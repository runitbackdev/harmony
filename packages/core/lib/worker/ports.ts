import type { StreamMessage } from "@harmony/protocol";

export class PortRegistry {
  private ports = new Set<MessagePort>();
  private onEmpty?: () => void;
  private onRemoveCallbacks = new Set<(port: MessagePort) => void>();

  add(port: MessagePort) {
    this.ports.add(port);
  }

  remove(port: MessagePort) {
    this.ports.delete(port);
    for (const cb of this.onRemoveCallbacks) cb(port);
    if (this.ports.size === 0) this.onEmpty?.();
  }

  onPortRemoved(callback: (port: MessagePort) => void) {
    this.onRemoveCallbacks.add(callback);
    return () => this.onRemoveCallbacks.delete(callback);
  }

  broadcast(message: StreamMessage) {
    for (const port of this.ports) {
      port.postMessage(message);
    }
  }

  onAllDisconnected(callback: () => void) {
    this.onEmpty = callback;
  }
}
