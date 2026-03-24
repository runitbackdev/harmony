#!/bin/bash
set -e

docker compose down -v
docker compose up -d

echo "Waiting for Synapse..."
until curl -s http://localhost:8008/_matrix/client/versions > /dev/null 2>&1; do
  sleep 1
done

register() {
  docker compose exec synapse register_new_matrix_user \
    -u "$1" -p "$2" $([ "$3" = "admin" ] && echo "-a" || echo "--no-admin") \
    -c /config/homeserver.yaml http://localhost:8008
}

register admin admin admin
register alice alice no
register bob bob no

echo "Dev environment ready."
