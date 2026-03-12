#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

cd "$ROOT_DIR"

if [[ -z "$PYTHON_BIN" ]]; then
  echo "python3 not found. Set PYTHON_BIN in .env or install Python 3." >&2
  exit 1
fi

echo "[1/3] Building backend..."
(
  cd "$ROOT_DIR/backend"
  npm run build
)

echo "[2/3] Building frontend..."
(
  cd "$ROOT_DIR/frontend"
  npm run build
)

echo "[3/3] Compiling Python sources..."
(
  cd "$ROOT_DIR/analysis-service"
  PYTHONPYCACHEPREFIX=/tmp/badminton-ai-analysis-pycache "$PYTHON_BIN" -m py_compile app.py services/*.py tests/*.py
)

echo
echo "Build completed successfully."
