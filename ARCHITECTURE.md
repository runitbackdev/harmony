# Architecture

Harmony is a Matrix chat client. The heavy lifting (protocol, sync, crypto) runs in **Rust compiled to WASM** inside a **SharedWorker**, so the React UI stays fast and multiple tabs share a single connection.

```
┌─────────────────────────────────────────────────────────┐
│  Browser Tab(s)                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐             │
│  │ apps/web │  │ react    │  │ ui        │             │
│  │ (routes) │→ │ (hooks)  │→ │ (design)  │             │
│  └────┬─────┘  └────┬─────┘  └───────────┘             │
│       │              │                                  │
│       └──────┬───────┘                                  │
│              ▼                                          │
│  ┌───────────────────┐         MessagePort              │
│  │   core/client     │ ──────────────────────┐          │
│  │   (Harmony class) │                       │          │
│  └───────────────────┘                       │          │
├──────────────────────────────────────────────┼──────────┤
│  SharedWorker                                ▼          │
│  ┌───────────────────────────────────────────────┐      │
│  │   core/worker                                 │      │
│  │   dispatcher → handlers → WASM calls          │      │
│  └──────────────────────┬────────────────────────┘      │
│                         ▼                               │
│  ┌───────────────────────────────────────────────┐      │
│  │   crates/wasm (Rust → WASM)                   │      │
│  │   matrix-sdk · IndexedDB · crypto             │      │
│  └───────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## Packages

| Package | What it does |
|---------|-------------|
| `apps/web` | React 19 app with TanStack Router. File-based routing, session-guarded layouts. |
| `packages/core` | The `Harmony` client class + SharedWorker internals. Owns the message protocol. |
| `packages/react` | React hooks (`useLogin`, `useSync`, `useSyncStatus`, `useSpaces`) wrapping core. |
| `packages/protocol` | Shared TypeScript types for every message crossing the worker boundary. |
| `packages/ui` | Design system components (Skeleton React + Tailwind 4). |
| `packages/composer` | Rich text editor built on Lexical. |
| `packages/profiler` | FPS/memory dev overlay. |
| `crates/wasm` | Rust crate compiled to WASM. Wraps `matrix-sdk` for auth, sync, and spaces. |

## Message Protocol

Everything between the UI thread and SharedWorker uses one of three message shapes defined in `packages/protocol`:

- **Request → Response** — has an `id`. Client sends a request, worker replies with the same `id`. Used for login, restore, subscribe.
- **Stream** — no `id`. Worker broadcasts to all connected ports. Used for sync status updates, space list diffs.
- **Command** — no `id`, no response expected. Fire-and-forget from client to worker. Used for logout, stop sync, unsubscribe.

The worker's `dispatcher` routes each incoming message to a handler by `type` string (e.g. `h.auth.login`, `h.sync.start`). Handlers call into WASM functions and send responses/streams back through `MessagePort`.

## How Data Flows

Take "user logs in" as an example:

```
LoginForm (apps/web)
  → useLogin hook (packages/react)
    → harmony.auth.login() (packages/core)
      → WorkerConnection.request("h.auth.login", { ... })
        → postMessage to SharedWorker
          → dispatcher finds authHandlers["h.auth.login"]
            → calls login() from WASM
              → matrix-sdk authenticates against homeserver
            ← SessionData returned
          ← send.respond({ type: "h.auth.login", ...session })
        ← Promise resolves with session
      ← session saved to localStorage
    ← hook updates status/error state
```

Streaming works similarly, but after the initial response the worker keeps piping `ReadableStream` chunks from WASM as broadcast messages to all ports.

## Key Design Decisions

**SharedWorker** — One worker shared across all tabs. Matrix sync runs once, not per-tab. The `PortRegistry` tracks connected tabs and broadcasts stream updates to all of them. When the last tab closes, sync stops.

**Rust/WASM for the core** — The `matrix-rust-sdk` handles protocol details, E2EE, and persistent storage (IndexedDB). TypeScript types are auto-generated from Rust structs via `tsify`.

**Diff-based updates** — Space lists (and eventually room lists, timelines) use a `ListDiff` protocol with operations like `append`, `insert`, `remove`, `set`, `reset`. This avoids re-sending full lists on every change.

**Layered packages** — Each layer has a single responsibility: `protocol` defines the contract, `core` implements the worker + client, `react` provides hooks, `apps/web` composes them into a UI. You can swap the UI layer without touching the rest.

## Orienting Yourself

Starting points depending on what you're working on:

- **Adding a new API** — Define types in `packages/protocol`, add a WASM function in `crates/wasm`, write a handler in `packages/core/lib/worker/handlers/`, expose it through a client API in `packages/core/lib/`, then add a React hook in `packages/react`.
- **Changing UI** — Routes live in `apps/web/src/routes/`. Components in `packages/ui/`. The `_authenticated` layout guard runs `restoreSession()` before rendering child routes.
- **Debugging worker issues** — Chrome DevTools → `chrome://inspect/#workers` to see SharedWorker console. The dispatcher logs handler errors.
- **Building WASM** — `just build-wasm-dev`. Output lands in `packages/wasm/`.

## Build Tools

| Tool | Purpose |
|------|---------|
| `pnpm` | Package manager, workspace linking |
| `vite` | Dev server + bundler for the web app |
| `wasm-pack` | Compiles Rust crate to WASM + JS bindings |
| `just` | Task runner (`just dev`, `just build`, `just check`, `just fmt`) |
| `lefthook` | Git hooks for formatting, linting, commit messages |
