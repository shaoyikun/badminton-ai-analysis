#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ENV_FILE"
  set +a
fi

BACKEND_PORT="${BACKEND_PORT:-8787}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 2>/dev/null || true)}"
VITE_API_BASE="${VITE_API_BASE:-http://127.0.0.1:${BACKEND_PORT}}"
UPLOAD_MAX_FILE_SIZE_BYTES="${UPLOAD_MAX_FILE_SIZE_BYTES:-209715200}"
APT_MIRROR="${APT_MIRROR:-mirrors.aliyun.com}"

export BACKEND_PORT
export FRONTEND_PORT
export PYTHON_BIN
export VITE_API_BASE
export UPLOAD_MAX_FILE_SIZE_BYTES
export APT_MIRROR

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

print_section() {
  echo
  echo "==> $1"
}

print_access_urls() {
  echo "- Frontend: http://127.0.0.1:$FRONTEND_PORT"
  echo "- Backend:  http://127.0.0.1:$BACKEND_PORT"
}

print_standard_commands() {
  echo "Useful commands:"
  echo "- make setup         # install local dependencies"
  echo "- make run           # start the project (Docker preferred)"
  echo "- make dev           # force local development mode"
  echo "- make test          # run automated tests"
  echo "- make build         # run production builds"
  echo "- make verify        # strict handoff gate, includes Docker build check"
  echo "- make verify-local  # local quick gate, skips Docker build check"
  echo "- make logs          # stream Docker Compose logs"
  echo "- make down          # stop Docker Compose services"
}

docker_cli_available() {
  has_cmd docker
}

docker_daemon_available() {
  docker_cli_available && docker info >/dev/null 2>&1
}

try_start_colima() {
  if docker_daemon_available; then
    return 0
  fi

  if has_cmd colima; then
    print_section "Docker daemon unavailable, attempting to start colima"
    colima start
  fi

  docker_daemon_available
}

require_python() {
  if [[ -z "$PYTHON_BIN" ]]; then
    echo "python3 not found. Set PYTHON_BIN in .env or install Python 3, then rerun make setup." >&2
    exit 1
  fi
}
