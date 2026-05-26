# Rust / WASM (crates/wasm)

Rust core. Every bridge-facing fn is marked with `#[harmony_export(…)]` and returns one of `Rpc<T>` / `Command` / `Subscription<I, C>`.

## Technical Stack

- **Library**: `matrix-rust-sdk` (git main, `matrix-sdk` + `matrix-sdk-ui`).
- **Target**: `wasm32-unknown-unknown`.
- **Bindings**: `wasm-bindgen` + `tsify` (for type emission).
- **Bridge macro**: `harmony_protocol::harmony_export` (in `crates/harmony-protocol-macros`).

## Adding a Bridge API

```rust
use harmony_protocol::{Rpc, harmony_export};

#[harmony_export(domain = "spaces", action = "create")]
pub async fn create_space(input: CreateSpaceInput) -> Rpc<SpaceData> {
    create_space_impl(input).await.into()
}
```

That's it. The macro:

1. Emits a `#[wasm_bindgen(js_name = "spacesCreateSpace")]` export.
2. Writes an NDJSON entry into the `__harmony_protocol` custom WASM section recording: wire name (`spaces.create`), JS name, kind (rpc/command/subscription), input/output TS types, referenced wasm types.

`harmony codegen` builds the WASM, reads the section, and regenerates `packages/core/lib/protocol/maps.generated.ts`. The TS side picks up the new fn with no further wiring.

For paired snapshot fns use `snapshot_for = "<other.wire.name>"`:

```rust
#[harmony_export(domain = "spaces", action = "get", snapshot_for = "spaces.subscribe")]
pub async fn get() -> Rpc<Vec<SpaceData>> { … }
```

## Type Generation

- `#[derive(Tsify, Serialize)] #[tsify(into_wasm_abi)]` on output structs — emits TS + serializes into JS.
- `#[derive(Tsify, Serialize, Deserialize)] #[tsify(from_wasm_abi)]` on input structs — emits TS + deserializes from JS. (`from_wasm_abi` is tsify-deprecated; staged replacement via `Ts<T>` wrapper is a future bead.)
- `#[serde(rename_all = "camelCase")]` on all structs crossing the boundary so TS sees camelCase.

## Development Workflow

- **Build + regen maps**: `harmony codegen` (dev) or `harmony codegen --release`.
- **Clippy gate**: `cargo clippy --workspace -- -D warnings` (no `#[allow]` to silence — refactor instead).

## Critical Constraints

- **Size**: Watch the WASM binary size. Audit added crates.
- **Concurrency**: Single-threaded WASM. Use `wasm-bindgen-futures` for async; no real threads. `thread_local!` for per-worker state.
- **Doc comments**: Describe behavior, not design history. No ADR references in source or non-ADR docs.
