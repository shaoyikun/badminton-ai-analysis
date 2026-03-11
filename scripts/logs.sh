#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

SERVICE="${1:-}"

if [[ -n "$SERVICE" ]]; then
  exec docker compose logs -f "$SERVICE"
fi

exec docker compose logs -f
