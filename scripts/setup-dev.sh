#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

echo "[1/4] Checking base tools..."
command -v node >/dev/null 2>&1 || { echo "Node.js is required."; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required."; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 is required."; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg is required."; exit 1; }
command -v ffprobe >/dev/null 2>&1 || { echo "ffprobe is required."; exit 1; }

echo "[2/4] Installing backend dependencies..."
cd "$ROOT_DIR/backend"
npm install

echo "[3/4] Installing frontend dependencies..."
cd "$ROOT_DIR/frontend"
npm install

echo "[4/4] Installing analysis-service Python dependencies..."
cd "$ROOT_DIR/analysis-service"
python3 -m pip install -r requirements.txt

echo
echo "Setup complete."
echo "Run ./scripts/start-dev.sh to start backend + frontend together."
