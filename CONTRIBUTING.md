# Contributing

Thanks for helping out! Here's everything you need to get going.

## Prerequisites

- [Rust](https://rustup.rs) (stable)
- [pnpm](https://pnpm.io)
- [just](https://github.com/casey/just)

## Getting Started

```sh
just setup   # installs toolchains, builds WASM, installs deps, sets up git hooks
just dev     # starts the vite dev server
```

## Common Commands

| Command      | What it does                             |
| ------------ | ---------------------------------------- |
| `just dev`   | Start dev server (builds WASM if needed) |
| `just build` | Production build (WASM + web)            |
| `just check` | Run clippy, eslint, and typos            |
| `just fmt`   | Format everything (cargo fmt + prettier) |
| `just clean` | Remove all build artifacts               |

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

See [ARCHITECTURE.md](./ARCHITECTURE.md) for how the codebase fits together. The short version: types go in `packages/protocol`, logic goes in `crates/wasm` + `packages/core`, UI goes in `packages/react` + `apps/web`.
