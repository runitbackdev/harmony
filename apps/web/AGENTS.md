# Web App (apps/web)

React 19 frontend. Owns routes, design system (`src/ui/`), rich-text editor (`src/composer/`), reusable primitives (`src/primitives/`), and per-domain API wrappers (`src/<domain>/api.ts`).

## Technical Stack

- **Routing**: TanStack Router (file-based).
- **State**: Valtio (local reactive) + TanStack Query (HTTP / external server state).
- **Forms**: TanStack Form + Valibot.
- **Components**: `@runitback/react` (Base UI, web-only) for chrome; `src/ui/` for first-party chat-surface components. Tailwind 4 + `@runitback/styles` semantic tokens.

## Desktop (Tauri)

The same frontend runs natively via the Tauri shell at `apps/desktop`. `createDefaultClient` selects `TransportTauri` when `window.__TAURI__` is present, otherwise the SharedWorker.

- `just desktop-dev` — launch the desktop shell against the vite dev server (hot reload).
- `just desktop-build` — produce a release bundle.

## Core Patterns

### 1. Domain API wrappers

Every Matrix-facing call goes through `src/<domain>/api.ts`. These wrap `@harmony/core`'s `rpc` / `command` / `subscribe` with domain-named fns:

```ts
// src/spaces/api.ts
import { rpc } from "@harmony/core";
import { useListSubscription } from "@harmony/react";
export const joinSpace = (id: string) => rpc("spaces.join", id);
export function useSpaces() {
  return useListSubscription("spaces.subscribe", undefined, (state, diff) => …);
}
```

Components import `joinSpace`/`useSpaces`, never raw wire names or the singleton.

### 2. RpcResult handling

`rpc(…)` returns `{ ok: true; value: T } | { ok: false; error: HarmonyError }`. Every consumer must branch:

```ts
const result = await joinSpace(id);
if (!result.ok) throw new Error(result.error.message ?? result.error.code);
// result.value: SpaceData
```

### 3. Subscriptions

`useListSubscription` / `useStream` / `useRpc` from `@harmony/react` are the only primitives. They return `{ status: "idle" | "ready" | "error"; value; error }` — destructure `.value` and handle the idle/error states.

### 4. Auth guard

Routes needing a session nest under `_authenticated`. Layout calls `await sessionStore.get()` before rendering children. `useSession()` from `@/auth/api` exposes the session as a TanStack Query result for sync access in components.

### 5. Styling

Use `@runitback/styles` semantic tokens (`bg-surface`, `text-ink`, `text-sub`, `border-line`, `bg-accent`, `text-link`, `bg-soft`). No numeric ramps, no hardcoded colors. Light is the default; `[data-theme="dark"]` flips tokens.

## HTTP (Herald) APIs

Non-WASM endpoints (invites, future presence HTTP fallbacks) live alongside domain APIs as plain `fetch` wrappers — e.g. `src/invites/api.ts`. They read `sessionStore.get()` for bearer tokens. Herald serves these under `/api/*`.
