#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
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

if command -v docker >/dev/null 2>&1 && command -v colima >/dev/null 2>&1; then
  if ! colima status >/dev/null 2>&1; then
    echo "[1/3] Starting colima..."
    colima start
  fi

  if [[ "$WITH_BUILD" -eq 1 ]]; then
    echo "[2/3] Rebuilding and starting project with Docker Compose..."
    docker compose up --build -d
  else
    echo "[2/3] Starting project with Docker Compose..."
    docker compose up -d
  fi

  echo "[3/3] Current service status:"
  docker compose ps

  echo
  echo "Done."
  echo "- Frontend: http://127.0.0.1:5173"
  echo "- Backend:  http://127.0.0.1:8787"
  echo
  echo "Useful commands:"
  echo "- ./scripts/up.sh --build   # rebuild images and start"
  echo "- ./scripts/logs.sh"
  echo "- ./scripts/down.sh"
  exit 0
fi

if [[ -x "$ROOT_DIR/scripts/start-dev.sh" ]]; then
  echo "Docker / colima not found. Falling back to local dev mode..."
  exec "$ROOT_DIR/scripts/start-dev.sh"
fi

echo "No supported startup path found."
exit 1
