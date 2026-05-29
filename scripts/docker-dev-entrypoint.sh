#!/usr/bin/env bash
set -euo pipefail

# Container usually runs as root; required for writable .meteor/local on volumes.
export METEOR_ALLOW_SUPERUSER="${METEOR_ALLOW_SUPERUSER:-1}"
export PYTHONUNBUFFERED=1

APP_DIR="${APP_SOURCE_FOLDER:-/opt/src}"
cd "$APP_DIR"

HOT_RELOAD="${SSE_HOT_RELOAD:-0}"

echo "================================================================"
echo "[dev] entrypoint v4 | SSE_HOT_RELOAD=${HOT_RELOAD}"
if [[ "$HOT_RELOAD" == "1" ]]; then
  echo "[dev] Mode: HOT RELOAD (meteor run) — you will see 'Started proxy.' then a LONG quiet compile."
else
  echo "[dev] Mode: RESTART-ONLY (meteor build + node) — no reload on file save."
fi
echo "[dev] App dir: $APP_DIR"
echo "[dev] Settings file: ${SETTINGS_FILE:-settings.json}"
echo "================================================================"

if [[ ! -d node_modules ]] || [[ -z "$(ls -A node_modules 2>/dev/null)" ]]; then
  echo "[dev] $(date -Iseconds) Installing npm dependencies..."
  meteor npm install
fi

SETTINGS_FILE="${SETTINGS_FILE:-settings.json}"
if [[ ! -f "$SETTINGS_FILE" ]]; then
  echo "[dev] Settings file not found: $SETTINGS_FILE" >&2
  exit 1
fi

export_meteor_settings() {
  if [[ -z "${METEOR_SETTINGS:-}" ]]; then
    export METEOR_SETTINGS
    METEOR_SETTINGS="$(cat "$SETTINGS_FILE")"
    export METEOR_SETTINGS
  fi
}

run_meteor_dev_server() {
  echo "[dev] $(date -Iseconds) Starting meteor run (first compile may take 15-45 min on a server)..."
  echo "[dev] Tip: use SSE_HOT_RELOAD=0 (default) to skip file watching and rebuild only on container restart."
  exec meteor run \
    --settings "$SETTINGS_FILE" \
    --exclude-archs "web.browser.legacy,web.cordova" \
    --port "${PORT:-3000}" \
    "$@"
}

run_build_and_node() {
  local build_dir="/tmp/borovets-sse-meteor-build"
  local build_log="/tmp/borovets-sse-meteor-build.log"

  export_meteor_settings

  echo "[dev] $(date -Iseconds) meteor build started (log: $build_log)"
  echo "[dev] First build on a server often takes 15-45 minutes with sparse output — this is normal."
  echo "[dev] Settings from $SETTINGS_FILE are applied at runtime via METEOR_SETTINGS (meteor build has no --settings flag)."
  rm -rf "$build_dir"
  : >"$build_log"

  set +e
  stdbuf -oL -eL meteor build "$build_dir" \
    --directory \
    --server-only \
    --server "${ROOT_URL:-http://localhost:8500}" 2>&1 | tee -a "$build_log"
  local build_status=${PIPESTATUS[0]}
  set -e

  if [[ "$build_status" -ne 0 ]]; then
    echo "[dev] meteor build failed (exit $build_status). Last 40 lines:" >&2
    tail -n 40 "$build_log" >&2
    exit "$build_status"
  fi

  echo "[dev] $(date -Iseconds) meteor build finished."
  echo "[dev] Installing server bundle dependencies..."
  (cd "$build_dir/bundle/programs/server" && npm install --production)

  echo "[dev] $(date -Iseconds) Starting node main.js"
  echo "[dev] After code changes: docker compose -f sse-docker-stack.dev.yml restart app"
  cd "$build_dir/bundle"
  exec node main.js
}

if [[ "$HOT_RELOAD" == "1" ]]; then
  run_meteor_dev_server
else
  run_build_and_node
fi
