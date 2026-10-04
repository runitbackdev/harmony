FROM docker.io/library/rust:1-bookworm AS wasm

RUN apt-get update && apt-get install -y --no-install-recommends \
    clang \
    && rm -rf /var/lib/apt/lists/*

RUN rustup target add wasm32-unknown-unknown \
    && curl -sSfL https://rustwasm.github.io/wasm-pack/installer/init.sh | sh

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY apps/desktop apps/desktop
COPY packages/bindings packages/bindings
COPY packages/harmony-protocol packages/harmony-protocol
COPY packages/harmony-protocol-macros packages/harmony-protocol-macros
COPY tools/harmony-cli tools/harmony-cli

RUN cargo run -p harmony-cli --bin harmony -- codegen --release

# Vite build of the web app.
FROM docker.io/library/node:22-bookworm-slim AS build

ENV CI=true
RUN corepack enable

WORKDIR /app

COPY . .
COPY --from=wasm /app/packages/wasm packages/wasm

RUN pnpm install --frozen-lockfile \
    && pnpm --filter web build

FROM docker.io/library/nginx:1-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
