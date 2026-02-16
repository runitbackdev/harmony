wasm-crate := "crates/wasm"
wasm-out := "../../packages/wasm"

setup:
  rustup target add wasm32-unknown-unknown
  cargo install wasm-pack typos-cli committed
  pnpm install
  pnpm lefthook install

dev:
  pnpm --filter web dev

build: build-wasm build-web

check:
  cargo check --workspace
  cargo clippy --workspace
  pnpm --filter web lint
  typos

fmt:
  cargo fmt --all
  pnpm prettier --write "apps/**/*.{ts,tsx}" "packages/**/*.{ts,tsx}"

clean:
  cargo clean
  rm -rf packages/wasm
  pnpm --filter web exec rm -rf dist

[private]
build-wasm:
  wasm-pack build {{wasm-crate}} --target web  --scope harmony --out-dir {{wasm-out}}

[private]
build-web:
  pnpm --filter web build
