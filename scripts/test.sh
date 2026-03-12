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

print_section "Running backend automated tests"
(
  cd "$ROOT_DIR/backend"
  npm test
)

print_section "Running analysis-service automated tests"
(
  cd "$ROOT_DIR/analysis-service"
  PYTHONPATH=. "$PYTHON_BIN" -m unittest discover -s tests -p 'test_*.py'
)

echo
echo "Tests completed successfully."
