#!/usr/bin/env bash
# Populates .online-docs/ with the plain-text (llms.txt / .md) upstream docs for
# this stack, so agents and humans can grep them locally instead of re-fetching.
#
#   ./scripts/fetch-docs.sh          # fetch anything missing
#   ./scripts/fetch-docs.sh --force  # re-fetch everything (refresh)
#
# Only plain-text sources belong here. Pages served as HTML (most of
# orm.drizzle.team, hono.dev/docs/*, all of tailwindcss.com) are deliberately
# absent — use the llms*.txt bundles or the GitHub sources below for those.
set -euo pipefail

cd "$(dirname "$0")/.."
DEST=.online-docs
FORCE=${1:-}

# ---------------------------------------------------------------- single files
#
# dest-path <TAB> url
#
# Every bun.com docs page has a `.md` twin, and so does every ui.shadcn.com one.
# Resolve Bun paths from bun/llms.txt rather than from memory — they get
# reorganized (`docs/api/sql` is now `docs/runtime/sql`).
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
bun/pm-workspaces.md	https://bun.com/docs/pm/workspaces.md
bun/pm-workspaces-guide.md	https://bun.com/docs/guides/install/workspaces.md
bun/pm-filter.md	https://bun.com/docs/pm/filter.md
bun/pm-catalogs.md	https://bun.com/docs/pm/catalogs.md
bun/pm-isolated-installs.md	https://bun.com/docs/pm/isolated-installs.md
bun/pm-install.md	https://bun.com/docs/pm/cli/install.md
hono/llms.txt	https://hono.dev/llms.txt
hono/llms-small.txt	https://hono.dev/llms-small.txt
hono/llms-full.txt	https://hono.dev/llms-full.txt
drizzle/llms.txt	https://orm.drizzle.team/llms.txt
drizzle/llms-full.txt	https://orm.drizzle.team/llms-full.txt
zod/llms.txt	https://zod.dev/llms.txt
vite/llms.txt	https://vite.dev/llms.txt
vite/llms-full.txt	https://vite.dev/llms-full.txt
react/llms.txt	https://react.dev/llms.txt
shadcn/llms.txt	https://ui.shadcn.com/llms.txt
shadcn/install-tanstack.md	https://ui.shadcn.com/docs/installation/tanstack.md
shadcn/monorepo.md	https://ui.shadcn.com/docs/monorepo.md
shadcn/components-json.md	https://ui.shadcn.com/docs/components-json.md
shadcn/cli.md	https://ui.shadcn.com/docs/cli.md
shadcn/theming.md	https://ui.shadcn.com/docs/theming.md
tailwind/theme.mdx	https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/docs/theme.mdx
tailwind/upgrade-guide.mdx	https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/docs/upgrade-guide.mdx
EOF
)

# -------------------------------------------------------------------- bundles
#
# dest-path <TAB> repo <TAB> ref <TAB> directory
#
# TanStack publishes no llms.txt: tanstack.com server-renders its docs, so every
# `llms.txt` path there returns HTTP 200 with the SPA shell — a fetch that looks
# like it worked and caches 200 KB of markup. The docs are markdown in the repo,
# so each directory is concatenated into one greppable bundle. Listing the
# directory (rather than naming files) means an upstream page added tomorrow is
# picked up by the next --force run.
#
# These track `main`, which can be ahead of the released package. Check a
# surprising API against the installed version before believing the doc.
BUNDLES=$(
  cat <<'EOF'
tanstack/start.md	TanStack/router	main	docs/start/framework/react
tanstack/start-guide.md	TanStack/router	main	docs/start/framework/react/guide
tanstack/router-guide.md	TanStack/router	main	docs/router/guide
tanstack/router-routing.md	TanStack/router	main	docs/router/routing
EOF
)

fetched=0 skipped=0 failed=0

cached() {
  [ -s "$1" ] && [ "$FORCE" != "--force" ]
}

report_ok() {
  printf '  ok     %-30s %8s bytes\n' "$1" "$(wc -c <"$2" | tr -d ' ')"
  fetched=$((fetched + 1))
}

report_failed() {
  printf '  FAILED %-30s %s\n' "$1" "$2"
  failed=$((failed + 1))
}

# ------------------------------------------------------------ fetch: singles

while IFS=$'\t' read -r path url; do
  [ -z "$path" ] && continue
  out="$DEST/$path"

  if cached "$out"; then
    printf '  skip   %-30s (cached)\n' "$path"
    skipped=$((skipped + 1))
    continue
  fi

  mkdir -p "$(dirname "$out")"

  # Write to a temp file so a failed fetch never leaves a truncated doc behind.
  if curl -sfL --retry 2 --retry-delay 1 --retry-all-errors --max-time 120 "$url" -o "$out.tmp" &&
    [ -s "$out.tmp" ]; then
    mv "$out.tmp" "$out"
    report_ok "$path" "$out"
  else
    rm -f "$out.tmp"
    report_failed "$path" "$url"
  fi
done <<<"$MANIFEST"

# ------------------------------------------------------------ fetch: bundles

# Concatenates every .md in a GitHub directory into one file. Returns non-zero
# without touching $out if the listing or any page fails, so a rate-limited API
# response cannot silently produce an empty bundle.
fetch_bundle() {
  local out=$1 repo=$2 ref=$3 dir=$4
  local api="https://api.github.com/repos/$repo/contents/$dir?ref=$ref"
  local names name

  # Parsed with grep/sed rather than jq: this script has no dependency beyond
  # curl, and it may run before `bun install`.
  names=$(curl -sfL --retry 2 --retry-delay 1 --retry-all-errors --max-time 60 "$api" |
    grep -o '"name": *"[^"]*\.md"' | sed 's/.*"name": *"//; s/"$//' | sort)

  # An error payload (rate limit, moved directory) has no "name" fields at all.
  if [ -z "$names" ]; then
    return 1
  fi

  printf '<!-- Assembled by scripts/fetch-docs.sh from %s@%s %s -->\n' "$repo" "$ref" "$dir" >"$out.tmp"

  while read -r name; do
    [ -z "$name" ] && continue
    printf '\n\n<!-- ===== %s/%s ===== -->\n\n' "$dir" "$name" >>"$out.tmp"

    if ! curl -sfL --retry 2 --retry-delay 1 --retry-all-errors --max-time 60 \
      "https://raw.githubusercontent.com/$repo/$ref/$dir/$name" >>"$out.tmp"; then
      return 1
    fi
  done <<<"$names"

  mv "$out.tmp" "$out"
}

while IFS=$'\t' read -r path repo ref dir; do
  [ -z "$path" ] && continue
  out="$DEST/$path"

  if cached "$out"; then
    printf '  skip   %-30s (cached)\n' "$path"
    skipped=$((skipped + 1))
    continue
  fi

  mkdir -p "$(dirname "$out")"

  if fetch_bundle "$out" "$repo" "$ref" "$dir"; then
    report_ok "$path" "$out"
  else
    rm -f "$out.tmp"
    report_failed "$path" "$repo/$dir"
  fi
done <<<"$BUNDLES"

date -u +'%Y-%m-%dT%H:%M:%SZ' >"$DEST/.fetched-at"

echo
echo "fetched=$fetched skipped=$skipped failed=$failed  ->  $DEST ($(du -sh $DEST | cut -f1))"
[ "$failed" -eq 0 ]
