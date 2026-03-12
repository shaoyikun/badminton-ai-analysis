#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

cd "$ROOT_DIR"

if lsof -iTCP:"$BACKEND_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $BACKEND_PORT is already in use. Stop the existing backend process first." >&2
  exit 1
fi

if lsof -iTCP:"$FRONTEND_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $FRONTEND_PORT is already in use. Stop the existing frontend process first." >&2
  exit 1
fi

if ! has_cmd npm; then
  echo "npm not found. Install Node.js and rerun make setup." >&2
  exit 1
fi

require_python

print_section "Starting backend"
echo "Using PYTHON_BIN=$PYTHON_BIN"
echo "Backend URL: http://127.0.0.1:$BACKEND_PORT"
(
  cd "$ROOT_DIR/backend"
  PORT="$BACKEND_PORT" npm run dev
) &
BACKEND_PID=$!

print_section "Starting frontend"
echo "Frontend URL: http://127.0.0.1:$FRONTEND_PORT"
(
  cd "$ROOT_DIR/frontend"
  VITE_API_BASE="$VITE_API_BASE" npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

echo
echo "Project is starting in local development mode."
print_access_urls
echo "Press Ctrl+C to stop both services."
echo

wait "$BACKEND_PID" "$FRONTEND_PID"
