#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_SOURCE_FOLDER:-/opt/src}"
cd "$APP_DIR"

if [[ ! -d node_modules ]] || [[ -z "$(ls -A node_modules 2>/dev/null)" ]]; then
  echo "[dev] Installing npm dependencies into the container..."
  meteor npm install
fi

SETTINGS_FILE="${SETTINGS_FILE:-settings.json}"
if [[ ! -f "$SETTINGS_FILE" ]]; then
  echo "[dev] Settings file not found: $SETTINGS_FILE" >&2
  exit 1
fi

echo "[dev] Starting Meteor (file changes reload automatically; restart container after package.json / .meteor changes)"
echo "[dev] Settings: $SETTINGS_FILE"

exec meteor run \
  --settings "$SETTINGS_FILE" \
  --exclude-archs "web.browser.legacy,web.cordova" \
  --port "${PORT:-3000}" \
  "$@"
