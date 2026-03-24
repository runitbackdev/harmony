wasm-crate := "crates/wasm"
wasm-out := "../../packages/wasm"

setup: check-deps
  rustup target add wasm32-unknown-unknown
  command -v wasm-pack >/dev/null || cargo install wasm-pack
  command -v typos >/dev/null || cargo install typos-cli
  command -v committed >/dev/null || cargo install committed
  just build-wasm-dev
  pnpm install
  pnpm lefthook install

dev:
  @test -d packages/wasm || just build-wasm-dev
  VITE_HOMESERVER_URL=http://localhost:8008 pnpm --filter web dev

build: build-wasm build-web

build-wasm-dev:
  wasm-pack build {{wasm-crate}} --target web --dev --scope harmony --out-dir {{wasm-out}}

check:
  cargo check --workspace
  cargo clippy --workspace
  pnpm lint
  typos

fmt:
  cargo fmt --all
  pnpm prettier --write "apps/**/*.{ts,tsx}" "packages/**/*.{ts,tsx}"

clean:
  cargo clean
  rm -rf packages/wasm
  pnpm --filter web exec rm -rf dist

synapse:
  docker compose up -d synapse

synapse-stop:
  docker compose down

setup-users:
  docker exec harmony-synapse register_new_matrix_user -u admin -p admin -c /config/homeserver.yaml --admin
  docker exec harmony-synapse register_new_matrix_user -u alice -p alice -c /config/homeserver.yaml --no-admin
  docker exec harmony-synapse register_new_matrix_user -u bob -p bob -c /config/homeserver.yaml --no-admin

synapse-seed: setup-users

[private]
check-deps:
  @command -v rustup >/dev/null || (echo "error: rustup not found — install from https://rustup.rs" && exit 1)
  @command -v cargo >/dev/null || (echo "error: cargo not found — install rust via rustup" && exit 1)
  @command -v pnpm >/dev/null || (echo "error: pnpm not found — install from https://pnpm.io" && exit 1)

[private]
build-wasm:
  wasm-pack build {{wasm-crate}} --target web --scope harmony --out-dir {{wasm-out}}

[private]
build-web:
  pnpm --filter web build
