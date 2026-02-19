import type {
  CommandKey,
  ResponseMap,
  StreamMessage,
  WorkerInbound,
  WorkerOutbound,
} from "@harmony/protocol";

type WithoutId<T> = T extends any ? Omit<T, "id"> : never;

export type Send = {
  respond: (payload: WithoutId<WorkerOutbound>) => void;
  stream: (payload: StreamMessage) => void;
};

export type HandlerFor<T extends WorkerInbound["type"]> = (
  message: Extract<WorkerInbound, { type: T }>,
  send: Send,
) => Promise<void>;

export type HandlerMap = {
  [K in keyof ResponseMap]?: HandlerFor<K>;
} & {
  [K in CommandKey]?: HandlerFor<K>;
};
