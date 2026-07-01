import type { CommandMap, RpcMap, SubscriptionMap } from "./maps.generated";

export type RpcName = keyof RpcMap;
export type CommandName = keyof CommandMap;
export type SubscriptionName = keyof SubscriptionMap;

type RpcEntry<K extends RpcName> = RpcMap[K];
type CommandEntry<K extends CommandName> = CommandMap[K];
type SubscriptionEntry<K extends SubscriptionName> = SubscriptionMap[K];

/** Input type of an RPC call. */
export type RpcInput<K extends RpcName> =
  RpcEntry<K> extends (input: infer I) => unknown ? I : never;

/** Successful payload type of an RPC call (already inside the `RpcResult`). */
export type RpcOutput<K extends RpcName> =
  RpcEntry<K> extends (input: never) => Promise<infer R>
    ? R extends { ok: true; value: infer V }
      ? V
      : never
    : never;

export type CommandInput<K extends CommandName> =
  CommandEntry<K> extends (input: infer I) => unknown ? I : never;

export type SubscriptionInput<K extends SubscriptionName> =
  SubscriptionEntry<K> extends { fn: (input: infer I) => unknown } ? I : never;

export type SubscriptionInitial<K extends SubscriptionName> =
  SubscriptionEntry<K> extends { fn: (input: never) => Promise<infer R> }
    ? R extends { initial: infer Init }
      ? Init
      : never
    : never;

export type SubscriptionChunk<K extends SubscriptionName> =
  SubscriptionEntry<K> extends { fn: (input: never) => Promise<infer R> }
    ? R extends { stream: ReadableStream<infer C> }
      ? C
      : never
    : never;
