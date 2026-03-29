#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${HATCHLING_REPO_URL:-https://github.com/SteveEmmerich/hatchling.git}"
BRANCH="${HATCHLING_BRANCH:-main}"
TARGET_DIR="${HATCHLING_DIR:-$HOME/hatchling}"
MODE="${HATCHLING_MODE:-node}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not found." >&2
  exit 1
fi

if [ "$MODE" != "docker" ]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "node is required but not found." >&2
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required but not found." >&2
    exit 1
  fi
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required but not found." >&2
    exit 1
  fi
fi

if [ -d "$TARGET_DIR/.git" ]; then
  echo "Updating existing repo in $TARGET_DIR"
  git -C "$TARGET_DIR" fetch origin
  git -C "$TARGET_DIR" checkout "$BRANCH"
  git -C "$TARGET_DIR" pull --ff-only origin "$BRANCH"
else
  echo "Cloning $REPO_URL into $TARGET_DIR"
  if ! git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$TARGET_DIR"; then
    echo "Clone failed. If prompted for credentials, ensure GitHub access is available." >&2
    echo "Tip: use HATCHLING_REPO_URL with an accessible HTTPS URL." >&2
    exit 1
  fi
fi

cd "$TARGET_DIR/hatchling-core"

if [ "$MODE" = "docker" ]; then
  docker build -t hatchling-core:local .
  echo ""
  echo "Hatchling Docker image built."
  echo "Next:"
  echo "  docker run --rm -it -e HATCHLING_HOME=/data -e HATCHLING_HINDBRAIN_BACKEND=cpu -v hatchling_data:/data hatchling-core:local doctor --json"
  echo "  docker run --rm -it -e HATCHLING_HOME=/data -e HATCHLING_HINDBRAIN_BACKEND=cpu -v hatchling_data:/data hatchling-core:local init --non-interactive --name sandbox --purpose \"Sandboxed hatchling\" --personality \"curious,steady\""
else
  npm install
  npm link
  echo ""
  echo "Hatchling installed."
  echo "Next:"
  echo "  hatchling doctor --json"
  echo "  hatchling init"
fi
