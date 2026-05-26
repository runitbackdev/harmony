# Instructions for AI Agents

This project uses bd (beads) for issue tracking.

- Run `bd prime` for workflow context and command guidance.
- Use `bd ready`, `bd show <id>`, `bd update <id> --claim`, and `bd close <id>`.
- Use `bd remember "insight"` for persistent project memory; do not create MEMORY.md files.
- Do not use markdown TODO lists for task tracking.

## Mission & Goals: "Matrix for Humans"

Harmony is not just another Matrix client; it is a community-first chat platform designed to bridge the gap between decentralized protocols and mainstream usability.

1.  **Protocol Invisibility**: Users should never need to know what a "homeserver" or "federation" is. The UX should feel familiar to users of Discord or Slack.
2.  **Performance as a Feature**: Speed is paramount. We offload heavy lifting to Rust and a SharedWorker to ensure the UI remains fluid and instant.
3.  **Utilitarian Minimalism**: The interface should be "invisible until needed." Every pixel must earn its place by solving a user problem or communicating essential state.
4.  **Ownership & Sovereignty**: We empower users to own their data without the technical tax usually associated with decentralized tools.

This file provides guidance for AI coding agents (Gemini CLI, Claude Code, Cursor Agent, Copilot Workspace, etc.) operating on this codebase.

## Before You Begin

1. Read [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the SharedWorker and WASM data flow.
2. Read [CONTRIBUTING.md](./CONTRIBUTING.md) and understand the project's conventions.
3. Read the [AI Policy](./AI_POLICY.md) — contributions must comply with it.
4. Familiarize yourself with the project structure and the [Matrix protocol](https://matrix.org).

## Project Context

Harmony is a community-centric chat application (think Discord) built on the Matrix protocol. It's a monorepo managed with pnpm and the **Vite+ (`vp`)** toolchain.

Key architecture:

- **SharedWorker Core**: All Matrix sync and protocol logic runs in a single SharedWorker to support multi-tab synchronization and offload the UI thread.
- **Rust/WASM Engine**: High-performance crypto and protocol operations are handled by Rust (`matrix-rust-sdk`) compiled to WebAssembly.

Key directories:

- `apps/web` — React 19 web app. Owns routes, design system (`src/ui/`), composer (`src/composer/`), primitives (`src/primitives/`), and per-domain API wrappers (`src/<domain>/api.ts`).
- `apps/herald` — Rust appservice (Axum + toasty + Postgres) for custom statuses, invites, presence.
- `packages/core` — Bridge runtime: `rpc` / `command` / `subscribe` + Transport + generic worker dispatcher. Owns generated wire map.
- `packages/react` — Generic React primitives: `useRpc`, `useStream`, `useListSubscription`.
- `packages/wasm` — Build artifact of `crates/wasm` (`.wasm` + `.d.ts`).
- `crates/wasm` — Rust crate wrapping `matrix-rust-sdk`. Bridge fns marked `#[harmony_export]`.
- `crates/harmony-protocol` + `crates/harmony-protocol-macros` — `Rpc/Command/Subscription` wrappers + the `#[harmony_export]` proc macro.
- `tools/harmony-cli` — `harmony` CLI binary. Typed workspace commands: `codegen` (build WASM + emit `packages/core/lib/protocol/maps.generated.ts`), `db`, `migration`, `psql`, `self-update`. Unknown subcommands forward to `just`.

## Rules for AI Agents

### DO

- Help the human contributor understand the complex data flow between UI and Worker
- Suggest improvements that follow the "Invisible until needed" design principle
- Write tests for new and existing functionality using `vp test`
- Use `vp` (Vite+) for all development tasks: `vp check` (lint/types), `vp fmt` (format)
- Follow the existing commit convention: `type(scope): description`
- Respect TypeScript strict mode — never use `any` or `unknown`, use proper types
- Use **Valtio** for local reactive state and **TanStack Query** for server state
- Use **Skeleton Labs** tokens and components for all UI elements

### DON'T

- Use `pnpm`, `npm`, or `yarn` directly for linting, testing, or formatting tasks
- Bypass the domain wrapper layer (`apps/web/src/<domain>/api.ts`) — components never import `@harmony/core`'s singleton or use wire names directly
- Refactor core protocol logic without prior discussion with maintainers
- Add new dependencies without justification
- Introduce patterns that don't already exist (e.g., adding a different state library)
- Submit code that the human operator cannot explain or modify

### Code Quality Checklist

Before the human submits your work, ensure:

- [ ] `vp check` passes (Oxlint and TypeScript checks)
- [ ] `vp test` passes (Vitest suites)
- [ ] WASM is rebuilt if `crates/wasm` was changed (`harmony codegen`)
- [ ] PR description explains _what_ and _why_, not just _how_
- [ ] AI usage is disclosed per the [AI Policy](./AI_POLICY.md)

## Tech Stack Quick Reference

| Layer           | Technology                     |
| :-------------- | :----------------------------- |
| Core Engine     | Rust (WASM) + Matrix Rust SDK  |
| Logic Layer     | SharedWorker (TS)              |
| Frontend        | React 19 + TypeScript          |
| Routing         | TanStack Router                |
| State           | Valtio + TanStack Query        |
| Styling         | Tailwind CSS 4 + Skeleton Labs |
| Toolchain       | Vite+ (`vp`)                   |
| Package Manager | pnpm (monorepo)                |
| Task Runner     | `harmony` CLI (forwards to `just`) |
