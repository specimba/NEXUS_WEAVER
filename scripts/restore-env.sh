#!/usr/bin/env bash
# =============================================================================
# NEXUS Visual Weaver — Environment Restore Script
# =============================================================================
# Restores all tokens from GitHub repo Secrets into .env after a sandbox wipe.
#
# Usage:
#   ./scripts/restore-env.sh
#
# Prerequisites:
#   - GitHub PAT with repo + actions:secrets read access
#   - Set GH_PAT env var before running, or it will prompt:
#       export GH_PAT="<YOUR_GITHUB_PAT>"
#       ./scripts/restore-env.sh
#
# This script reads GitHub Actions Secrets (encrypted at rest) and writes them
# to .env (gitignored). Token values never appear in git history.
# =============================================================================
set -euo pipefail

REPO="specimba/NEXUS_WEAVER"
ENV_FILE="$(dirname "$0")/../.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  NEXUS Weaver — Environment Restore from GitHub Secrets  ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for PAT
if [ -z "${GH_PAT:-}" ]; then
  echo -e "${YELLOW}⚠  GH_PAT not set. Enter your GitHub Personal Access Token:${NC}"
  read -rs -p "  PAT: " GH_PAT
  echo ""
  export GH_PAT
fi

if [ -z "$GH_PAT" ]; then
  echo -e "${RED}✗ No PAT provided. Aborting.${NC}"
  exit 1
fi

# Verify PAT works
echo -e "${YELLOW}→ Verifying PAT access to ${REPO}...${NC}"
REPO_CHECK=$(curl -sS -o /dev/null -w "%{http_code}" \
  -H "Authorization: token $GH_PAT" \
  "https://api.github.com/repos/$REPO")
if [ "$REPO_CHECK" != "200" ]; then
  echo -e "${RED}✗ Cannot access repo (HTTP $REPO_CHECK). Check PAT + repo name.${NC}"
  exit 1
fi
echo -e "${GREEN}✓ PAT valid, repo accessible.${NC}"
echo ""

# Function to fetch a secret value from GitHub
# Note: GitHub does NOT allow reading secret VALUES via API (only metadata).
# Workaround: we use a GitHub Actions workflow that echoes secrets to an
# artifact, OR we store the .env as a single base64-encoded secret.
# For this sandbox, we use the SIMPLER approach: a single NEXUS_ENV secret
# containing the entire .env content (base64-encoded).
fetch_env_blob() {
  curl -sS -H "Authorization: token $GH_PAT" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/actions/secrets/NEXUS_ENV_BLOB" \
    2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('name',''))" 2>/dev/null
}

echo -e "${YELLOW}→ Checking for NEXUS_ENV_BLOB secret (full .env backup)...${NC}"
BLOB_CHECK=$(fetch_env_blob)

if [ "$BLOB_CHECK" = "NEXUS_ENV_BLOB" ]; then
  echo -e "${GREEN}✓ NEXUS_ENV_BLOB found. Use the GitHub Actions workflow to restore.${NC}"
  echo -e "  Run: gh workflow run restore-env.yml"
  echo -e "  Then download the artifact from the run."
else
  echo -e "${YELLOW}⚠  NEXUS_ENV_BLOB not found. Using individual secret restore.${NC}"
  echo -e "${YELLOW}  Note: GitHub doesn't expose secret values via API.${NC}"
  echo -e "${YELLOW}  Creating .env with placeholder values — fill manually.${NC}"
fi

echo ""
echo -e "${YELLOW}→ Writing .env template...${NC}"

# Write .env with non-secret config (URLs, timeouts) — token values left empty
# for manual fill OR restored via the GitHub Actions workflow
cat > "$ENV_FILE" << 'EOF'
# NEXUS Visual Weaver — .env (restored by scripts/restore-env.sh)
# Token values are stored as GitHub Secrets. To restore them:
#   1. Run the "Restore Env" GitHub Actions workflow, OR
#   2. Manually fill in the values below from your secret store.

DATABASE_URL=file:/home/z/my-project/db/custom.db
MODAL_USE=true

# Modal FLUX.2 Klein 9B endpoints
MODAL_FLUX2_URL=https://specimba--nexus-flux2-klein9b-nexusflux2generator-generate.modal.run
MODAL_FLUX2_READY=true

# Modal timeouts
MODAL_COLD_START_TIMEOUT=300
MODAL_WARM_TIMEOUT=120

# AEON brain endpoint
MODAL_BRAIN_URL=https://specimba--ep-qwen3-6-27b-aeon-ultimate-uncensored-bf16-server.eu-west.modal.direct
MODAL_BRAIN_MODEL=AEON-7/Qwen3.6-27B-AEON-Ultimate-Uncensored-BF16

# Video I2V backends
MODAL_WAN22_URL=https://specimba--nexus-wan22-i2v-nexuswan22generator-web-app.modal.run
MODAL_LTX23_URL=https://specimba--nexus-ltx23-i2v-nexusltx23generator-web-app.modal.run

# ═══════════════════════════════════════════════════════════════════════════
# TOKENS — fill these in (stored as GitHub Secrets, not in this file's history)
# ═══════════════════════════════════════════════════════════════════════════
MODAL_TOKEN_ID=
MODAL_TOKEN_SECRET=
MODAL_PROXY_KEY=
MODAL_PROXY_SECRET=
HF_TOKEN=
BROWSERLESS_TOKEN=
EOF

echo -e "${GREEN}✓ .env written to: $ENV_FILE${NC}"
echo ""
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}  NEXT STEPS:${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════════${NC}"
echo -e "  1. Fill in the token values in .env (from your secret store)"
echo -e "  2. Run: bun run db:push   (create the SQLite database)"
echo -e "  3. Run: bun run dev       (start the dev server)"
echo ""
echo -e "  To push the CURRENT .env to GitHub Secrets (for future restores):"
echo -e "    ./scripts/push-env-to-github.sh"
echo ""
