#!/usr/bin/env bash
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "$0")" && pwd)/common.sh"

cd "$ROOT_DIR"

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

install_with_brew() {
  local pkg="$1"
  if has_cmd brew; then
    echo "Installing $pkg via Homebrew..."
    HOMEBREW_NO_AUTO_UPDATE=1 brew install "$pkg"
    return 0
  fi
  return 1
}

install_with_apt() {
  local pkg="$1"
  if has_cmd apt-get; then
    echo "Installing $pkg via apt-get..."
    sudo apt-get update
    sudo apt-get install -y "$pkg"
    return 0
  fi
  return 1
}

ensure_cmd() {
  local cmd="$1"
  local install_name="${2:-$1}"

  if has_cmd "$cmd"; then
    return 0
  fi

  echo "$cmd not found. Trying to install $install_name..."
  install_with_brew "$install_name" || install_with_apt "$install_name" || {
    echo "Failed to auto-install $install_name. Please install it manually and rerun this script."
    exit 1
  }

  has_cmd "$cmd" || {
    echo "$cmd is still not available after installing $install_name."
    exit 1
  }
}

echo "[1/4] Checking base tools..."
ensure_cmd node node
ensure_cmd npm node
ensure_cmd python3 python
ensure_cmd ffmpeg ffmpeg
ensure_cmd ffprobe ffmpeg
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3)}"

echo "[2/4] Installing backend dependencies..."
cd "$ROOT_DIR/backend"
npm install

echo "[3/4] Installing frontend dependencies..."
cd "$ROOT_DIR/frontend"
npm install

echo "[4/4] Installing analysis-service Python dependencies..."
cd "$ROOT_DIR/analysis-service"
"$PYTHON_BIN" -m pip install -r requirements.txt

echo
echo "Setup complete."
echo "Run make run to start the project with one command."
