#!/usr/bin/env bash
# Decides what a PR must test. Prints `scope=all|features` and `paths=<vitest path filters>`.
# Only features/<x>/ (and .env.example) changed => those features + architecture, smoke and cross-feature tests.
# Anything else (core/, contracts/, tests/, config, tooling) => everything.
set -euo pipefail
base="${1:-origin/main}"
files=$(git diff --name-only "$base"...HEAD)
other=$(printf '%s\n' "$files" | grep -vE '^(features/[^_/][^/]*/|\.env\.example$)' || true)
feats=$(printf '%s\n' "$files" | grep -E '^features/[^_/][^/]*/' | sed -E 's#^(features/[^/]+/).*#\1#' | sort -u | tr '\n' ' ' || true)
if [ -n "$other" ] || [ -z "$feats" ]; then
  echo "scope=all"; echo "paths="; exit 0
fi
echo "scope=features"; echo "paths=${feats}tests/architecture/ tests/smoke/ tests/integration/"
