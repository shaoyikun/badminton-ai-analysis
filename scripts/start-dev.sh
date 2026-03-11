#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
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

if lsof -iTCP:8787 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 8787 is already in use. Stop the existing backend process first." >&2
  exit 1
fi

if lsof -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 5173 is already in use. Stop the existing frontend process first." >&2
  exit 1
fi

export PYTHON_BIN="${PYTHON_BIN:-$(command -v python3)}"

echo "Using PYTHON_BIN=$PYTHON_BIN"
echo "Starting backend on http://127.0.0.1:8787 ..."
(
  cd "$ROOT_DIR/backend"
  npm run dev
) &
BACKEND_PID=$!

echo "Starting frontend on http://127.0.0.1:5173 ..."
(
  cd "$ROOT_DIR/frontend"
  npm run dev -- --host 127.0.0.1 --port 5173
) &
FRONTEND_PID=$!

echo
echo "Project is starting..."
echo "- Frontend: http://127.0.0.1:5173"
echo "- Backend:  http://127.0.0.1:8787"
echo "Press Ctrl+C to stop both services."
echo

wait "$BACKEND_PID" "$FRONTEND_PID"
