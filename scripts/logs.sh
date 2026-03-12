#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

cd "$ROOT_DIR"

SERVICE="${1:-}"

if ! docker_cli_available; then
  echo "Docker CLI not found. make logs only works with the Docker Compose path." >&2
  exit 1
fi

if ! docker_daemon_available; then
  echo "Docker daemon is not available. Start Docker Desktop/colima first." >&2
  exit 1
fi

if [[ -n "$SERVICE" ]]; then
  exec docker compose logs -f "$SERVICE"
fi

exec docker compose logs -f
