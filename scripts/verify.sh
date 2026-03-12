#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

cd "$ROOT_DIR"

STRICT_VERIFY=1
if [[ "${SKIP_DOCKER_VERIFY:-0}" == "1" ]]; then
  STRICT_VERIFY=0
fi

print_section "Linting frontend"
(
  cd "$ROOT_DIR/frontend"
  npm run lint
)

print_section "Running automated tests"
"$ROOT_DIR/scripts/test.sh"

print_section "Running production builds"
"$ROOT_DIR/scripts/build.sh"

if [[ "$STRICT_VERIFY" -eq 0 ]]; then
  print_section "Skipping Docker Compose build verification"
  echo "SKIP_DOCKER_VERIFY=1 is set, so this run is suitable for local iteration only."
else
  if ! docker_cli_available; then
    echo "Docker CLI not found. Install Docker or use make verify-local for the local-only gate." >&2
    exit 1
  fi

  if ! docker_daemon_available; then
    echo "Docker daemon is not available. Start Docker Desktop/colima or use make verify-local for the local-only gate." >&2
    exit 1
  fi

  print_section "Verifying Docker Compose builds"
  docker compose build backend frontend
fi

echo
if [[ "$STRICT_VERIFY" -eq 1 ]]; then
  echo "Strict verification completed successfully."
  echo "This run satisfies the repository handoff gate."
else
  echo "Local verification completed successfully."
  echo "Docker Compose build verification was skipped, so this run does not satisfy the handoff gate."
fi
