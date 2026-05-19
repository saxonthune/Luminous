#!/usr/bin/env bash
# PostToolUse hook (Write|Edit): lint + typecheck the edited file's package only.
# Scoped to one package via the nearest package.json so unrelated repo-wide
# errors don't get re-injected into context after every edit.
set -uo pipefail

f=$(jq -r '.tool_input.file_path // empty')
case "$f" in
  *.ts | *.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$f" ] || exit 0

# Walk up to the nearest package.json — that package's tsconfig scopes the check.
dir=$(dirname "$f")
while [ "$dir" != "/" ] && [ ! -f "$dir/package.json" ]; do
  dir=$(dirname "$dir")
done

pnpm exec eslint "$f" 2>&1 || true
if [ -f "$dir/tsconfig.json" ]; then
  (cd "$dir" && pnpm exec tsgo --noEmit 2>&1) || true
fi
