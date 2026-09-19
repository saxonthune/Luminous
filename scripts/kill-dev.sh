#!/usr/bin/env bash
set -u

repo_dir="$(cd "$(dirname "$0")/.." && pwd)"

# Killing the listeners alone leaves pnpm/tsx wrappers behind. Those wrappers
# can respawn the server child, so collect the whole repo-specific dev tree.
find_dev_pids() {
  ps -eo pid=,args= | awk -v repo="$repo_dir" -v self="$$" '
    $1 != self && (
      index($0, "packages/server exec tsx watch") ||
      index($0, "src/index.ts -- --config " repo "/luminous.config.json") ||
      index($0, "packages/client exec vite")
    ) { print $1 }
  '
}

dev_pids="$(find_dev_pids)"
if [ -n "$dev_pids" ]; then
  kill -TERM $dev_pids 2>/dev/null || true
  sleep 1
  remaining="$(find_dev_pids)"
  if [ -n "$remaining" ]; then
    kill -KILL $remaining 2>/dev/null || true
  fi
fi

# Also clean listeners if a dev child survived without a matching command line.
port_pids="$(lsof -ti :4080 -ti :5200 2>/dev/null || true)"
if [ -n "$port_pids" ]; then
  kill -TERM $port_pids 2>/dev/null || true
fi
