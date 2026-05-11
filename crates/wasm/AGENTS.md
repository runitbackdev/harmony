# Rust & WASM Patterns (crates/wasm)

This directory contains the high-performance Rust core of Harmony.

## Technical Stack
- **Library**: `matrix-rust-sdk`.
- **Target**: `wasm32-unknown-unknown`.
- **Bindings**: `wasm-bindgen` and `tsify` (for TS types).

## Development Workflow
- **Build**: Use `just build-wasm-dev` for development builds.
- **Output**: Build artifacts land in `packages/wasm/`.

## Patterns
- **Type Generation**: Use `#[derive(Tsify)]` on Rust structs that need to be shared with TypeScript. These are then imported into `packages/protocol`.
- **Async WASM**: Use `wasm-bindgen-futures` for async operations.
- **Persistence**: We use `matrix-sdk-sqlite` configured for IndexedDB via the WASM target.

## Critical Constraints
- **Size**: Be mindful of WASM binary size. Avoid unnecessary crates.
- **Concurrency**: WebAssembly has limited threading support; ensure logic is compatible with single-threaded worker environments or uses appropriate synchronization.
