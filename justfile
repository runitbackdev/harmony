wasm-crate := "crates/wasm"
wasm-out := "../../packages/wasm"

compose := if `command -v docker >/dev/null 2>&1 && echo yes || echo no` == "yes" { "docker compose" } else { "podman compose" }

# Frontend only — hosted homeserver by default (override via VITE_HOMESERVER_URL).
web:
  @test -d packages/wasm || just build-wasm-dev
  pnpm --filter web dev

# Full local stack — synapse (detached) + herald + web via hivemind.
dev:
  @test -d packages/wasm || just build-wasm-dev
  @just synapse
  hivemind Procfile.dev

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
  {{compose}} up -d synapse

synapse-stop:
  {{compose}} down

setup-users:
  {{compose}} exec synapse register_new_matrix_user -u admin -p admin -c /config/homeserver.yaml --admin
  {{compose}} exec synapse register_new_matrix_user -u alice -p alice -c /config/homeserver.yaml --no-admin
  {{compose}} exec synapse register_new_matrix_user -u bob -p bob -c /config/homeserver.yaml --no-admin

synapse-reset:
  {{compose}} down -v
  {{compose}} up -d synapse
  @echo "Waiting for Synapse to start..."
  @until {{compose}} exec synapse curl -sf http://localhost:8008/_matrix/client/versions > /dev/null 2>&1; do sleep 1; done
  just setup-users
  @echo "Synapse reset complete."

[private]
build-wasm:
  wasm-pack build {{wasm-crate}} --target web --scope harmony --out-dir {{wasm-out}}

[private]
build-web:
  pnpm --filter web build
