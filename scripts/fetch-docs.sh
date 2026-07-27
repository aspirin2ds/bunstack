#!/usr/bin/env bash
# Populates .online-docs/ with the plain-text (llms.txt / .md) upstream docs for
# this stack, so agents and humans can grep them locally instead of re-fetching.
#
#   ./scripts/fetch-docs.sh          # fetch anything missing
#   ./scripts/fetch-docs.sh --force  # re-fetch everything (refresh)
#
# Only plain-text sources belong here. Pages served as HTML (most of
# orm.drizzle.team, hono.dev/docs/*) are deliberately absent — use the
# llms*.txt bundles for those.
set -euo pipefail

cd "$(dirname "$0")/.."
DEST=.online-docs
FORCE=${1:-}

# dest-path <TAB> url
MANIFEST=$(
  cat <<'EOF'
bun/llms.txt	https://bun.com/llms.txt
bun/llms-full.txt	https://bun.com/llms-full.txt
bun/runtime-sql.md	https://bun.com/docs/runtime/sql.md
bun/http-server.md	https://bun.com/docs/runtime/http/server.md
bun/http-metrics.md	https://bun.com/docs/runtime/http/metrics.md
bun/http-error-handling.md	https://bun.com/docs/runtime/http/error-handling.md
bun/environment-variables.md	https://bun.com/docs/runtime/environment-variables.md
bun/test.md	https://bun.com/docs/test/index.md
bun/test-mocks.md	https://bun.com/docs/test/mocks.md
bun/docker.md	https://bun.com/docs/guides/ecosystem/docker.md
bun/bunfig.md	https://bun.com/docs/runtime/bunfig.md
hono/llms.txt	https://hono.dev/llms.txt
hono/llms-small.txt	https://hono.dev/llms-small.txt
hono/llms-full.txt	https://hono.dev/llms-full.txt
drizzle/llms.txt	https://orm.drizzle.team/llms.txt
drizzle/llms-full.txt	https://orm.drizzle.team/llms-full.txt
zod/llms.txt	https://zod.dev/llms.txt
EOF
)

fetched=0 skipped=0 failed=0

while IFS=$'\t' read -r path url; do
  [ -z "$path" ] && continue
  out="$DEST/$path"

  if [ -s "$out" ] && [ "$FORCE" != "--force" ]; then
    printf '  skip   %-28s (cached)\n' "$path"
    skipped=$((skipped + 1))
    continue
  fi

  mkdir -p "$(dirname "$out")"

  # Write to a temp file so a failed fetch never leaves a truncated doc behind.
  if curl -sfL --max-time 120 "$url" -o "$out.tmp" && [ -s "$out.tmp" ]; then
    mv "$out.tmp" "$out"
    printf '  ok     %-28s %8s bytes\n' "$path" "$(wc -c <"$out" | tr -d ' ')"
    fetched=$((fetched + 1))
  else
    rm -f "$out.tmp"
    printf '  FAILED %-28s %s\n' "$path" "$url"
    failed=$((failed + 1))
  fi
done <<<"$MANIFEST"

date -u +'%Y-%m-%dT%H:%M:%SZ' >"$DEST/.fetched-at"

echo
echo "fetched=$fetched skipped=$skipped failed=$failed  ->  $DEST ($(du -sh $DEST | cut -f1))"
[ "$failed" -eq 0 ]
