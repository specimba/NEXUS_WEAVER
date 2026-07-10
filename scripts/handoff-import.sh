#!/usr/bin/env bash
# NEXUS Weaver — Handoff Import
# Loads context from a previous agent's export.
set -euo pipefail

TARBALL="${1:?Usage: handoff-import.sh <handoff-tarball>}"

echo "▶ Importing agent context from $TARBALL..."

IMPORT_DIR="./handoff-import-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$IMPORT_DIR"
tar -xzf "$TARBALL" -C "$IMPORT_DIR"

echo ""
echo "=== Git Log (last 10 commits) ==="
cat "$IMPORT_DIR/git-log.txt" 2>/dev/null || echo "(not available)"

echo ""
echo "=== Dev Server Status ==="
cat "$IMPORT_DIR/dev-server-status.txt" 2>/dev/null || echo "(not available)"

echo ""
echo "=== TypeScript Check ==="
cat "$IMPORT_DIR/tsc-check.txt" 2>/dev/null || echo "(not available)"

echo ""
echo "=== Lint Check ==="
cat "$IMPORT_DIR/lint-check.txt" 2>/dev/null || echo "(not available)"

echo ""
echo "=== Modal Apps ==="
cat "$IMPORT_DIR/modal-apps.txt" 2>/dev/null || echo "(not available)"

echo ""
echo "=== .env Status ==="
cat "$IMPORT_DIR/env-status.txt" 2>/dev/null || echo "(not available)"

echo ""
echo "=== Recent Worklog ==="
cat "$IMPORT_DIR/worklog-recent.md" 2>/dev/null || echo "(not available)"

echo ""
echo "✅ Import complete. Context saved to: $IMPORT_DIR"
echo "   Read AGENTS.md and HANDOFF.md for full project context."
echo "   Run the verification commands from handoff/checklist.md"
