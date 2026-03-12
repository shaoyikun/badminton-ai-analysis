#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

cd "$ROOT_DIR"

if ! docker_cli_available; then
  echo "Docker CLI not found. make down only manages the Docker Compose path." >&2
  exit 1
fi

if ! docker_daemon_available; then
  echo "Docker daemon is not available. Start Docker Desktop/colima first." >&2
  exit 1
fi

print_section "Stopping Docker Compose services"
docker compose down
