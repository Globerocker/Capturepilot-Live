#!/usr/bin/env bash
# Install CapturePilot VPS cron timers on the Hostinger VPS.
#
# Run this once as root on srv1113360.hstgr.cloud after copying the
# tools/vps-crons/ directory to /opt/capturepilot/vps-crons/.
#
# What it does:
#   1. Ensures /etc/capturepilot/cron.env exists (creates a stub if missing).
#   2. Copies every cp-*.service and cp-*.timer to /etc/systemd/system/.
#   3. Reloads systemd, enables + starts each timer.
#   4. Prints the active timer list.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "install.sh must be run as root (try sudo)" >&2
  exit 1
fi

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_BIN="/opt/capturepilot/vps-crons"
ENV_DIR="/etc/capturepilot"
ENV_FILE="$ENV_DIR/cron.env"
SYSTEMD_DIR="/etc/systemd/system"

echo "==> source: $SRC_DIR"
echo "==> target: $TARGET_BIN"

# 1. Ensure binary location exists and contains the runner + per-cron scripts.
#    Skip the copy when running in-place (SRC_DIR == TARGET_BIN), otherwise
#    `cp -f` of a file onto itself aborts the script under `set -e`.
mkdir -p "$TARGET_BIN"
if [ "$SRC_DIR" != "$TARGET_BIN" ]; then
  cp -f "$SRC_DIR"/_runner.mjs "$TARGET_BIN/"
  for f in "$SRC_DIR"/*.mjs; do
    cp -f "$f" "$TARGET_BIN/"
  done
fi
chmod 0755 "$TARGET_BIN"/*.mjs

# 2. Ensure env file exists.
mkdir -p "$ENV_DIR"
if [ ! -f "$ENV_FILE" ]; then
  cat >"$ENV_FILE" <<'EOF'
# CapturePilot VPS cron environment.
# CRON_SECRET must match the CRON_SECRET set in the Vercel project.
CRON_SECRET=REPLACE_ME
# Optional overrides:
# CRON_BASE_URL=https://app.capturepilot.com
# CRON_TIMEOUT_MS=270000
EOF
  chmod 0600 "$ENV_FILE"
  echo "==> wrote stub $ENV_FILE — edit it before timers will succeed"
fi

# 3. Copy systemd units.
for unit in "$SRC_DIR"/cp-*.service "$SRC_DIR"/cp-*.timer; do
  [ -e "$unit" ] || continue
  cp -f "$unit" "$SYSTEMD_DIR/"
done

systemctl daemon-reload

# 4. Enable + start every cp-*.timer.
for timer in "$SYSTEMD_DIR"/cp-*.timer; do
  name=$(basename "$timer")
  echo "==> enabling $name"
  systemctl enable --now "$name"
done

echo
echo "==> Active CapturePilot timers:"
systemctl list-timers --all 'cp-*.timer' --no-pager || true

echo
echo "Done. Tail a unit's log with:"
echo "  journalctl -u cp-monthly-awards.service -f"
echo
if grep -q '^CRON_SECRET=REPLACE_ME' "$ENV_FILE"; then
  echo "WARNING: $ENV_FILE still has CRON_SECRET=REPLACE_ME — fill it in." >&2
fi
