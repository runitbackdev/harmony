# Contributing

Thanks for helping out! Here's everything you need to get going.

## Prerequisites

- [mise](https://mise.jdx.dev) — pins Rust, Node, pnpm, `just`, `wasm-pack`, `hivemind`

## Getting Started

```sh
just setup        # mise install, pnpm install, install `harmony` CLI, build WASM, install git hooks
harmony dev       # full local stack (synapse + web)
```

Run `harmony self-update` after pulling changes to `tools/harmony-cli`.

## Common Commands

| Command           | What it does                           |
| ----------------- | -------------------------------------- |
| `harmony web`     | Frontend only, hosted homeserver       |
| `harmony dev`     | Full local stack (synapse + web)       |
| `harmony build`   | Production build (WASM + web)          |
| `harmony codegen` | Build WASM + emit `maps.generated.ts`  |
| `harmony check`   | Run cargo check, clippy, eslint, typos |
| `harmony fmt`     | Format Rust + TypeScript               |
| `harmony clean`   | Remove all build artifacts             |

`harmony` forwards unknown subcommands to `just`, so any orchestration recipe (`synapse`, `synapse-reset`, etc.) works via `harmony <name>`.

## Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org) enforced by a git hook.

```
feat: add room timeline support
fix: handle expired session on restore
refactor: extract sync handler into its own module
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

Subject line must be lowercase, max 72 characters. Body lines max 100 characters.

## Pre-commit Hooks

Lefthook runs automatically on commit:

- **Rust** — `cargo fmt` + `clippy`
- **TypeScript** — `prettier` + `eslint`
- **All files** — `typos` (spell check)

Formatting fixes are auto-staged. If clippy or eslint fail, fix the issues and commit again.

## Project Structure

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for how the codebase fits together. The short version: bridge fns + types go in `packages/wasm` (`#[harmony_export]` annotated), the worker runtime + generated wire maps live in `packages/core`, generic React primitives live in `packages/react`, and UI + per-domain wrappers live in `apps/web`.
