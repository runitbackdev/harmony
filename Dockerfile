FROM docker.io/rust:1-slim-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY apps/herald apps/herald
COPY crates crates
COPY tools/harmony-cli tools/harmony-cli

RUN cargo build --release -p herald

FROM docker.io/debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/herald /usr/local/bin/herald

EXPOSE 3000
CMD ["herald"]
