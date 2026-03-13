#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

cd "$ROOT_DIR/backend"
node --import tsx src/dev/evaluateFixtures.ts "$@"
