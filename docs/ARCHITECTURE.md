# Architecture

Harmony is a Matrix chat client. The heavy lifting (protocol, sync, crypto) runs in **Rust compiled to WASM** inside a **SharedWorker**, so the React UI stays fast and multiple tabs share a single connection.

```
┌─────────────────────────────────────────────────────────┐
│  Browser Tab(s)                                         │
│  ┌─────────────────────────────────────┐                │
│  │ apps/web                            │                │
│  │  routes/  ui/  composer/  primitives│                │
│  │  domain APIs: spaces/api, rooms/api │                │
│  │                timeline/api, …      │                │
│  └────────────────┬────────────────────┘                │
│                   │                                     │
│                   ▼                                     │
│  ┌───────────────────────────────────────────┐          │
│  │  packages/react                           │          │
│  │  useRpc · useStream · useListSubscription │          │
│  └────────────────┬──────────────────────────┘          │
│                   │                                     │
│                   ▼                                     │
│  ┌───────────────────────────────────────────┐          │
│  │  packages/core                            │          │
│  │  rpc() · command() · subscribe()          │          │
│  │  Transport (MessagePort)                  │          │
│  └────────────────┬──────────────────────────┘          │
│                   │  MessagePort                        │
├───────────────────┼─────────────────────────────────────┤
│  SharedWorker     ▼                                     │
│  ┌───────────────────────────────────────────┐          │
│  │  packages/core/worker                     │          │
│  │  generic dispatcher → wasm.<jsName>(…)    │          │
│  └────────────────┬──────────────────────────┘          │
│                   ▼                                     │
│  ┌───────────────────────────────────────────┐          │
│  │  packages/wasm  (Rust → WASM)             │          │
│  │  matrix-sdk · IndexedDB · crypto          │          │
│  │  #[harmony_export] fns emit metadata into │          │
│  │  __harmony_protocol custom section        │          │
│  └───────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────┘
```

## Packages

| Package                            | What it does                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                         | React 19 app w/ TanStack Router. Owns `ui/`, `composer/`, `primitives/` and per-domain APIs.                                                |
| `packages/core`                    | Bridge runtime: `rpc`/`command`/`subscribe`, Transport, MessagePort dispatcher, `protocol/`.                                                |
| `packages/react`                   | Generic React primitives: `useRpc`, `useStream`, `useListSubscription`.                                                                     |
| `packages/wasm`                    | Build artifact of `packages/wasm` (`.wasm` + `.d.ts`).                                                                                      |
| `packages/wasm`                    | Rust crate wrapping `matrix-sdk`. Every bridge fn marked `#[harmony_export]`.                                                               |
| `packages/harmony-protocol`        | `Rpc<T>` / `Command` / `Subscription<I,C>` wrappers + `HarmonyError`.                                                                       |
| `packages/harmony-protocol-macros` | `#[harmony_export]` proc macro: emits wasm-bindgen export + `__harmony_protocol` entry.                                                     |
| `tools/harmony-cli`                | `harmony` CLI. `harmony codegen` builds WASM, reads `__harmony_protocol` section, generates `packages/core/lib/protocol/maps.generated.ts`. |

## Bridge: Rpc / Command / Subscription

Every WASM fn declares its bridge shape via its return type:

- `Rpc<T>` — request/response. Returns `{ ok: true, value: T } | { ok: false, error: HarmonyError }`.
- `Command` — fire-and-forget. Returns the same union with `T = void`.
- `Subscription<I, C>` — initial snapshot `I` + `ReadableStream<C>` of chunks. Startup errors return on `.ok = false`.

The `#[harmony_export]` macro reads the return type, derives a wire name (`domain.action`) and a JS name (`domainAction`), emits the wasm-bindgen export, and writes one NDJSON entry per fn into the `__harmony_protocol` custom WASM section. `harmony codegen` reads the section after build and writes `packages/core/lib/protocol/maps.generated.ts` — the single source of truth for client-side wire name → fn binding + TS shape.

`RpcResult<T>` (the discriminated union above) is the only error surface client code sees. Errors ride in-band on the same response — no separate error event types.

## How Data Flows

Take "user joins a space" as an example:

```
JoinForm (apps/web)
  → joinSpace(spaceId)         [apps/web/src/spaces/api.ts]
    → rpc("spaces.join", id)   [packages/core]
      → Transport.send → MessagePort → SharedWorker
        → generic dispatcher → wasm.spacesJoinSpace(id)
          → matrix-sdk joins room, builds SpaceData
        ← Rpc::ok(space) serialized into RpcResult
      ← MessagePort response with matching id
    ← Promise<RpcResult<SpaceData>>
  ← caller checks result.ok, navigates
```

Subscriptions skip the response id and stream `ReadableStream<C>` chunks instead. Use `useListSubscription("rooms.subscribe_in_space", spaceId, applyListDiff)` from `packages/react` to fold chunks into reactive state.

## Key Design Decisions

**SharedWorker** — One worker shared across all tabs. Matrix sync runs once, not per-tab. PortRegistry tracks connected tabs and fanouts subscription chunks.

**Rust/WASM core** — `matrix-rust-sdk` handles protocol, E2EE, persistent storage (IndexedDB via `matrix-sdk-indexeddb`).

**Generated wire map** — `harmony codegen` walks the `__harmony_protocol` custom section after build, generates `maps.generated.ts`. Adding a bridge fn = one `#[harmony_export]` annotation in Rust; the TS side picks it up automatically next `harmony codegen`.

**Diff-based list updates** — Lists (spaces, rooms, members, timeline events) use `ListDiff<T>` ops (`append`, `insert`, `set`, `remove`, `reset`, …) folded client-side. Avoids re-sending full lists.

**Per-domain APIs in `apps/web`** — Each domain (auth, spaces, rooms, members, timeline, sync, invites) gets its own `src/<domain>/api.ts` thin wrapper around `rpc`/`command`/`subscribe`. Components import wrappers, never the wire-level singleton.

## Orienting Yourself

- **Adding a bridge API** —
  1. Write the Rust fn with `#[harmony_export(domain = "…", action = "…")]` returning `Rpc<T>` / `Command` / `Subscription<I,C>`.
  2. `harmony codegen` regenerates `maps.generated.ts`. Done — types + dispatch wiring are automatic.
  3. (Optional) Add a thin wrapper in `apps/web/src/<domain>/api.ts` so call sites get domain-named fns instead of wire names.
- **UI** — Routes: `apps/web/src/routes/`. Components: `apps/web/src/ui/`. Layout guard `_authenticated` waits on `sessionStore.get()`.
- **Debugging worker** — Chrome DevTools → `chrome://inspect/#workers`. Bridge dispatch errors are surfaced as `RpcResult.ok=false`; client wrappers throw on the boundary or let callers branch.
- **Building WASM** — `harmony codegen` (dev) or `harmony codegen --release`. Output: `packages/wasm/`.

## Build Tools

| Tool        | Purpose                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm`      | Package manager, workspace linking                                                                               |
| `vite`      | Dev server + bundler for the web app                                                                             |
| `wasm-pack` | Compiles Rust crate to WASM + JS bindings                                                                        |
| `harmony`   | Typed workspace CLI (`harmony dev`, `harmony codegen`, `harmony db`, …) — forwards unknown subcommands to `just` |
| `just`      | Orchestration recipes (compose, hivemind, multi-step shell)                                                      |
| `lefthook`  | Git hooks for formatting, linting, commit messages                                                               |
