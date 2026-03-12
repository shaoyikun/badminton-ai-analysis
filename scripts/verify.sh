#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/4] Linting frontend..."
(
  cd "$ROOT_DIR/frontend"
  npm run lint
)

echo "[2/4] Running automated tests..."
"$ROOT_DIR/scripts/test.sh"

echo "[3/4] Running production builds..."
"$ROOT_DIR/scripts/build.sh"

if [[ "${SKIP_DOCKER_VERIFY:-0}" == "1" ]]; then
  echo "[4/4] Skipping Docker Compose build verification (SKIP_DOCKER_VERIFY=1)."
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker CLI not found. Install Docker or rerun with SKIP_DOCKER_VERIFY=1." >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not available. Start Docker Desktop/colima or rerun with SKIP_DOCKER_VERIFY=1." >&2
    exit 1
  fi

  echo "[4/4] Verifying Docker Compose builds..."
  docker compose build backend frontend
fi

echo
echo "Verification completed successfully."
