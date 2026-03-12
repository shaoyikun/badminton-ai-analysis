#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

cd "$ROOT_DIR"

WITH_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --build)
      WITH_BUILD=1
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: ./scripts/up.sh [--build]"
      exit 1
      ;;
  esac
done

if docker_cli_available; then
  if ! docker_daemon_available; then
    try_start_colima || true
  fi

  if docker_daemon_available; then
    if [[ "$WITH_BUILD" -eq 1 ]]; then
      print_section "Rebuilding and starting services with Docker Compose"
      docker compose up --build -d
    else
      print_section "Starting services with Docker Compose"
      docker compose up -d
    fi

    print_section "Current Docker Compose status"
    docker compose ps

    echo
    echo "Project is running in Docker Compose mode."
    print_access_urls
    echo
    print_standard_commands
    exit 0
  fi

  echo "Docker CLI is installed, but the Docker daemon is unavailable."
  echo "Falling back to local development mode."
fi

if [[ -x "$ROOT_DIR/scripts/start-dev.sh" ]]; then
  print_section "Starting local development mode"
  exec "$ROOT_DIR/scripts/start-dev.sh"
fi

echo "No supported startup path found."
exit 1
