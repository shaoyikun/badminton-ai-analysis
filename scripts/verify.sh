#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/3] Linting frontend..."
(
  cd "$ROOT_DIR/frontend"
  npm run lint
)

echo "[2/3] Running automated tests..."
"$ROOT_DIR/scripts/test.sh"

echo "[3/3] Running production builds..."
"$ROOT_DIR/scripts/build.sh"

echo
echo "Verification completed successfully."
