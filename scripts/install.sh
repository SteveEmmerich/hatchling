#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${HATCHLING_REPO_URL:-git@github.com:SteveEmmerich/hatchling.git}"
BRANCH="${HATCHLING_BRANCH:-codex/organism-architecture-refactor}"
TARGET_DIR="${HATCHLING_DIR:-$HOME/hatchling}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not found." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but not found." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but not found." >&2
  exit 1
fi

if [ -d "$TARGET_DIR/.git" ]; then
  echo "Updating existing repo in $TARGET_DIR"
  git -C "$TARGET_DIR" fetch origin
  git -C "$TARGET_DIR" checkout "$BRANCH"
  git -C "$TARGET_DIR" pull --ff-only origin "$BRANCH"
else
  echo "Cloning $REPO_URL into $TARGET_DIR"
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$TARGET_DIR"
fi

cd "$TARGET_DIR/hatchling-core"

npm install
npm link

echo ""
echo "Hatchling installed."
echo "Next:"
echo "  hatchling doctor --json"
echo "  hatchling init"
