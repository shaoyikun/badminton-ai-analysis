#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

cd "$ROOT_DIR"

if ! has_cmd npm; then
  echo "npm not found. Install Node.js and rerun make setup." >&2
  exit 1
fi

require_python

print_section "Building backend"
(
  cd "$ROOT_DIR/backend"
  npm run build
)

print_section "Building frontend"
(
  cd "$ROOT_DIR/frontend"
  npm run build
)

print_section "Compiling Python sources"
(
  cd "$ROOT_DIR/analysis-service"
  PYTHONPYCACHEPREFIX=/tmp/badminton-ai-analysis-pycache "$PYTHON_BIN" -m py_compile app.py services/*.py tests/*.py
)

echo
echo "Build completed successfully."
