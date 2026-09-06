#!/usr/bin/env bash
# Push every non-empty variable in .env.local to a linked Vercel project.
#
#   npx vercel login && npx vercel link      # once
#   ./tools/push-env.sh                      # then this
#
# Existing values are removed first, so the script is safe to re-run after you
# rotate a key. Nothing is echoed.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.local ] || { echo "no .env.local — copy .env.example first"; exit 1; }
[ -d .vercel ]    || { echo "not linked — run 'npx vercel link' first"; exit 1; }

VERCEL=${VERCEL:-npx vercel}
ENVIRONMENTS=(production preview development)

pushed=0 skipped=0
while IFS='=' read -r key value; do
  case "$key" in ''|\#*) continue ;; esac
  value=${value%$'\r'}
  if [ -z "$value" ]; then
    printf '  %-28s skipped (empty)\n' "$key"
    skipped=$((skipped + 1))
    continue
  fi
  for env in "${ENVIRONMENTS[@]}"; do
    $VERCEL env rm "$key" "$env" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | $VERCEL env add "$key" "$env" >/dev/null 2>&1
  done
  printf '  %-28s pushed to %s\n' "$key" "${ENVIRONMENTS[*]}"
  pushed=$((pushed + 1))
done < .env.local

echo
echo "$pushed pushed, $skipped skipped."
echo "Now: npx vercel deploy --prod"
