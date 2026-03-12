#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

cd "$ROOT_DIR"

if [[ -z "$PYTHON_BIN" ]]; then
  echo "python3 not found. Set PYTHON_BIN in .env or install Python 3." >&2
  exit 1
fi

echo "[1/2] Running backend automated tests..."
(
  cd "$ROOT_DIR/backend"
  npm test
)

echo "[2/2] Running analysis-service automated tests..."
(
  cd "$ROOT_DIR/analysis-service"
  PYTHONPATH=. "$PYTHON_BIN" -m unittest discover -s tests -p 'test_*.py'
)

echo
echo "Tests completed successfully."
