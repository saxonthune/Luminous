#!/usr/bin/env bash
# csearch.sh — code search helper for agents.
#
# A single, allowlist-friendly entry point for the multi-pattern exploration
# that would otherwise need long compound grep/cat one-liners (which can't be
# auto-approved). Allowlist `bash scripts/csearch.sh` once and every search
# below runs without a prompt.
#
# Usage:
#   scripts/csearch.sh <pattern> [path] [glob]   Search one regex (ripgrep).
#   scripts/csearch.sh -m <path> <p1> <p2> ...   Search several regexes in one path.
#   scripts/csearch.sh -f <name-glob> [path]     Find files by name.
#
# Examples:
#   scripts/csearch.sh 'resolveRoots' packages/server-next
#   scripts/csearch.sh 'fg-subtle' packages/client-next '*.css'
#   scripts/csearch.sh -m packages/client-next/src 'fg-muted' 'fg-subtle'
#   scripts/csearch.sh -f '*.pack.json'
#
# Defaults: searches the repo root, skips node_modules / dist / .git.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

RG_OPTS=(--line-number --no-heading --color=never
         --glob '!node_modules' --glob '!dist' --glob '!.git')

case "${1:-}" in
  -m)
    shift
    path="${1:?usage: csearch.sh -m <path> <pattern>...}"; shift
    for pat in "$@"; do
      echo "=== $pat ==="
      rg "${RG_OPTS[@]}" -e "$pat" "$path" || echo "(no matches)"
      echo
    done
    ;;
  -f)
    shift
    glob="${1:?usage: csearch.sh -f <name-glob> [path]}"
    path="${2:-.}"
    rg --files "${RG_OPTS[@]}" "$path" --glob "$glob" || echo "(no matches)"
    ;;
  "")
    echo "usage: csearch.sh <pattern> [path] [glob]" >&2
    echo "       csearch.sh -m <path> <pattern>..." >&2
    echo "       csearch.sh -f <name-glob> [path]" >&2
    exit 2
    ;;
  *)
    pat="$1"
    path="${2:-.}"
    glob="${3:-}"
    if [ -n "$glob" ]; then
      rg "${RG_OPTS[@]}" --glob "$glob" -e "$pat" "$path" || echo "(no matches)"
    else
      rg "${RG_OPTS[@]}" -e "$pat" "$path" || echo "(no matches)"
    fi
    ;;
esac
