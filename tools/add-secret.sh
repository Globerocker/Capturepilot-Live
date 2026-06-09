#!/usr/bin/env bash
# Hidden-input flow for adding secrets to .env.local AND Vercel without
# exposing the value to the terminal scrollback, shell history, OR (most
# importantly) any Claude conversation transcript.
#
# Usage:
#   tools/add-secret.sh VAR_NAME
#   tools/add-secret.sh SAM_API_KEY_4
#
# The script:
#   1. Reads the value via `read -rs` so it never echoes to stdout or
#      lands in shell history.
#   2. Appends `VAR_NAME=<value>` to ../.env.local with a timestamp comment.
#   3. Optionally pushes to Vercel for all 3 environments
#      (production/preview/development) via `vercel env add`.
#   4. NEVER prints the value back. Length-only verification.
#
# Why this exists:
#   Pasting a key into chat (Claude, Slack, anywhere) burns the credential.
#   Even if the conversation is deleted, the key may have been cached by
#   model providers or backed up. Rotating before paste is the only safe
#   move, but humans forget. This script forces the right shape: secret
#   lands directly in env vars, never in chat.
#
# Requires:
#   - vercel CLI (brew install vercel-cli) authenticated against the
#     correct project (auto-detected from .vercel/project.json)
#   - Run from repo root (the script enforces this)

set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 VAR_NAME" >&2
    echo "  e.g. $0 SAM_API_KEY_4" >&2
    exit 1
fi

VAR_NAME="$1"
ENV_FILE=".env.local"

# Enforce repo-root run so we touch the right .env.local (the dashboard/.env.local
# is a symlink to this one).
if [[ ! -f "CLAUDE.md" || ! -d "dashboard" ]]; then
    echo "ERROR: run from repo root (where CLAUDE.md + dashboard/ live)." >&2
    exit 1
fi

# Validate var name shape so a typo doesn't write garbage
if ! [[ "$VAR_NAME" =~ ^[A-Z][A-Z0-9_]*$ ]]; then
    echo "ERROR: var name must be SCREAMING_SNAKE_CASE (got '$VAR_NAME')." >&2
    exit 1
fi

# Refuse to silently overwrite — if it's already set, demand explicit --force
if grep -q "^${VAR_NAME}=" "$ENV_FILE" 2>/dev/null; then
    echo "ERROR: $VAR_NAME already in $ENV_FILE. To replace:" >&2
    echo "  1. sed -i '' '/^${VAR_NAME}=/d' $ENV_FILE" >&2
    echo "  2. $0 $VAR_NAME" >&2
    exit 1
fi

echo "Paste the value for $VAR_NAME (input hidden, hit Enter when done):"
read -rs VALUE
echo
if [[ -z "$VALUE" ]]; then
    echo "ERROR: empty value." >&2
    exit 1
fi
LEN=${#VALUE}
echo "Got $LEN characters. (Value never echoed.)"

# Optional expiry date input
echo "Expiry date (YYYY-MM-DD) — press Enter to skip rotation tracking:"
read -r EXPIRES
COMMENT="# $VAR_NAME added $(date -u +'%Y-%m-%d') via tools/add-secret.sh"
if [[ -n "$EXPIRES" ]]; then
    COMMENT="$COMMENT (expires $EXPIRES)"
fi

# Append atomically (use a heredoc so the value never gets process-arg-listed)
{
    printf '\n%s\n' "$COMMENT"
    printf '%s=%s\n' "$VAR_NAME" "$VALUE"
} >> "$ENV_FILE"
echo "Appended to $ENV_FILE."

# Vercel push — optional
echo
read -rp "Push to Vercel (production + preview + development)? [y/N] " PUSH_VERCEL
if [[ "$PUSH_VERCEL" =~ ^[Yy]$ ]]; then
    if ! command -v vercel >/dev/null 2>&1; then
        echo "ERROR: vercel CLI not found. brew install vercel-cli." >&2
        exit 1
    fi
    for ENV in production preview development; do
        echo "  → vercel env add $VAR_NAME $ENV ..."
        printf '%s' "$VALUE" | vercel env add "$VAR_NAME" "$ENV" --force 2>&1 | grep -v "^$" || true
    done
    echo "Vercel envs updated. Trigger a redeploy for changes to take effect."
fi

# Cleanup — kill the value from the shell
unset VALUE

echo
echo "Done. The value was never echoed, never logged, never argv-visible."
echo
if [[ -n "$EXPIRES" ]]; then
    echo "Don't forget: also add a row (or update one) in api_connectors with"
    echo "    expires_at = '${EXPIRES}T00:00:00Z'"
    echo "so /admin/health/integrations countdown stays accurate."
fi
