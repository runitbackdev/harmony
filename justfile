compose := if `command -v docker >/dev/null 2>&1 && echo yes || echo no` == "yes" { "docker compose" } else { "podman compose" }

# Frontend only — hosted homeserver by default (override via VITE_HOMESERVER_URL).
web:
    @test -d packages/wasm || harmony codegen
    pnpm --filter web dev

# Full local stack — synapse + postgres (detached) + herald + web via hivemind.
dev:
    @test -d packages/wasm || harmony codegen
    @just synapse
    @just postgres
    hivemind Procfile.dev

build:
    harmony codegen --release
    pnpm --filter web build

check:
    cargo check --workspace
    cargo clippy --workspace
    harmony codegen
    git diff --exit-code -- packages/core/lib/protocol/maps.generated.ts
    pnpm lint
    typos

fmt:
    cargo fmt --all
    pnpm prettier --write "apps/**/*.{ts,tsx}" "packages/**/*.{ts,tsx}"

clean:
    cargo clean
    rm -rf packages/wasm
    pnpm --filter web exec rm -rf dist

setup:
    mise install
    cargo install --path tools/harmony-cli --force
    @just gen-rpc
    pnpm install
    pnpm exec lefthook install

gen-rpc:
    harmony codegen

psql:
    psql "${HERALD_DATABASE_URL:-${DATABASE_URL:?'set HERALD_DATABASE_URL or DATABASE_URL'}}"

self-update:
    cargo install --path tools/harmony-cli --force

synapse:
    {{ compose }} up -d synapse

postgres:
    {{ compose }} up -d postgres

synapse-stop:
    {{ compose }} down

setup-users:
    {{ compose }} exec synapse register_new_matrix_user -u admin -p admin -c /config/homeserver.yaml --admin
    {{ compose }} exec synapse register_new_matrix_user -u alice -p alice -c /config/homeserver.yaml --no-admin
    {{ compose }} exec synapse register_new_matrix_user -u bob -p bob -c /config/homeserver.yaml --no-admin

synapse-reset:
    {{ compose }} down -v
    {{ compose }} up -d synapse
    @echo "Waiting for Synapse to start..."
    @until {{ compose }} exec synapse curl -sf http://localhost:8008/_matrix/client/versions > /dev/null 2>&1; do sleep 1; done
    just setup-users
    @echo "Synapse reset complete."
