# Core / Bridge Runtime (packages/core)

This package hosts the WASM bridge runtime: `rpc`, `command`, `subscribe` on the client side and the generic dispatcher inside the SharedWorker.

## Architecture

- **SharedWorker** (`lib/worker/index.ts`) — one worker per origin, shared across tabs. Initializes WASM, accepts MessagePort connections.
- **Transport** (`lib/transport/`) — generic MessagePort dispatcher. Routes by wire name to the wasm-bindgen exports registered in `lib/protocol/maps.generated.ts`. No per-feature handlers.
- **Protocol** (`lib/protocol/`) — `maps.generated.ts` (auto from `harmony codegen`), `types.ts` (input/output/initial/chunk type extractors), `diff.ts` (`applyListDiff` reducer).
- **Session** (`lib/session/`) — async `SessionStore` interface + `LocalStorageSessionStore` adapter.

## Bridge Surface

```ts
import { rpc, command, subscribe } from "@harmony/core";

const result = await rpc("spaces.create", input);    // RpcResult<SpaceData>
await command("auth.logout", undefined);             // RpcResult<void>
const handle = subscribe("spaces.subscribe", undefined, (chunk) => …);
// handle.initial: Promise<RpcResult<…>>; handle.unsubscribe()
```

All three return / accept `RpcResult<T> = { ok: true; value: T } | { ok: false; error: HarmonyError }`.

## Guidelines

- Components MUST NOT import the singleton (`harmony.ts`) or use wire names directly. They go through domain wrappers in `apps/web/src/<domain>/api.ts`.
- Adding a new bridge fn = one `#[harmony_export]` in Rust + `harmony codegen`. No handler registration here.
- `maps.generated.ts` is generated — do not hand-edit. Regenerate via `harmony codegen` after Rust changes.
