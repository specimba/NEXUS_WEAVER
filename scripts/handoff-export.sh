#!/usr/bin/env bash
# NEXUS Weaver — Handoff Export
# Exports current agent context to a portable file for handoff.
set -euo pipefail

EXPORT_DIR="${1:-./handoff-export}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")

mkdir -p "$EXPORT_DIR"

echo "▶ Exporting agent context to $EXPORT_DIR..."

# 1. Git state
git log --oneline -10 > "$EXPORT_DIR/git-log.txt"
git tag -l > "$EXPORT_DIR/git-tags.txt"
git diff --stat > "$EXPORT_DIR/git-diff.txt" 2>/dev/null || true

# 2. Dev server status
curl -sS -o /dev/null -w "HTTP %{http_code}" http://localhost:3000/ > "$EXPORT_DIR/dev-server-status.txt" 2>/dev/null || echo "NOT RUNNING" > "$EXPORT_DIR/dev-server-status.txt"

# 3. TypeScript check
bunx tsc --noEmit 2>&1 | tail -5 > "$EXPORT_DIR/tsc-check.txt"

# 4. Lint check
bun run lint 2>&1 | tail -5 > "$EXPORT_DIR/lint-check.txt"

# 5. Modal app states (if CLI available)
if command -v modal &>/dev/null || [ -f /home/z/.venv/bin/modal ]; then
  MODAL_BIN="${MODAL_BIN:-modal}"
  [ -f /home/z/.venv/bin/modal ] && MODAL_BIN="/home/z/.venv/bin/modal"
  $MODAL_BIN app list 2>&1 > "$EXPORT_DIR/modal-apps.txt" || echo "Modal CLI not authenticated" > "$EXPORT_DIR/modal-apps.txt"
else
  echo "Modal CLI not installed" > "$EXPORT_DIR/modal-apps.txt"
fi

# 6. Worklog (last 5 entries)
tail -100 worklog.md > "$EXPORT_DIR/worklog-recent.md" 2>/dev/null || echo "No worklog" > "$EXPORT_DIR/worklog-recent.md"

# 7. .env check (don't export values, just check existence)
if [ -f .env ]; then
  grep -c "=" .env > "$EXPORT_DIR/env-var-count.txt"
  echo ".env EXISTS" > "$EXPORT_DIR/env-status.txt"
else
  echo ".env MISSING" > "$EXPORT_DIR/env-status.txt"
fi

# 8. Package versions
cat package.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Name: {d[\"name\"]}'); print(f'Version: {d[\"version\"]}')" > "$EXPORT_DIR/package-info.txt"

# 9. Create tarball
TARBALL="nexus-handoff-${TIMESTAMP}.tar.gz"
tar -czf "$TARBALL" -C "$EXPORT_DIR" .
echo ""
echo "✅ Export complete: $TARBALL"
echo "   Contents: $(ls "$EXPORT_DIR" | wc -l) files"
echo "   Size: $(du -h "$TARBALL" | cut -f1)"
