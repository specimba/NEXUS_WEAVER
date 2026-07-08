#!/usr/bin/env bash
# =============================================================================
# NEXUS Visual Weaver — Push .env to GitHub Secrets
# =============================================================================
# Reads the current .env file and stores ALL of it (base64-encoded) as a
# single GitHub Secret "NEXUS_ENV_BLOB". This allows scripts/restore-env.sh
# to restore the entire .env after a sandbox wipe.
#
# Also stores each token as an individual secret for granular access.
#
# Usage:
#   export GH_PAT="github_pat_..."
#   ./scripts/push-env-to-github.sh
# =============================================================================
set -euo pipefail

REPO="specimba/NEXUS_WEAVER"
ENV_FILE="$(dirname "$0")/../.env"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  NEXUS Weaver — Push .env to GitHub Secrets              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"

if [ -z "${GH_PAT:-}" ]; then
  echo -e "${YELLOW}⚠  GH_PAT not set. Enter your GitHub PAT:${NC}"
  read -rs -p "  PAT: " GH_PAT
  echo ""
  export GH_PAT
fi

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${RED}✗ .env not found at $ENV_FILE${NC}"
  echo -e "  Run ./scripts/restore-env.sh first to create it."
  exit 1
fi

# Check pynacl
export PYTHONPATH="/home/z/.venv/lib/python3.12/site-packages:${PYTHONPATH:-}"
if ! python3 -c "from nacl import public" 2>/dev/null; then
  echo -e "${YELLOW}→ Installing pynacl...${NC}"
  /home/z/.venv/bin/pip3 install pynacl --quiet 2>&1 | tail -1
fi

# Get repo public key
echo -e "${YELLOW}→ Fetching repo public key...${NC}"
KEY_JSON=$(curl -sS -H "Authorization: token $GH_PAT" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/actions/secrets/public-key")
KEY_ID=$(echo "$KEY_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['key_id'])")
KEY_B64=$(echo "$KEY_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['key'])")
echo -e "${GREEN}✓ Key ID: $KEY_ID${NC}"

# Function to encrypt + store a secret
store_secret() {
  local name="$1"
  local value="$2"
  local encrypted_hex=$(python3 -c "
from nacl import encoding, public
pub = public.PublicKey('$KEY_B64'.encode(), encoding.Base64Encoder())
box = public.SealedBox(pub)
print(box.encrypt('$value'.encode()).hex())
")
  local encrypted_b64=$(python3 -c "import base64; print(base64.b64encode(bytes.fromhex('$encrypted_hex')).decode())")
  local code=$(curl -sS -o /dev/null -w "%{http_code}" -X PUT \
    -H "Authorization: token $GH_PAT" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/actions/secrets/$name" \
    -d "{\"encrypted_value\":\"$encrypted_b64\",\"key_id\":\"$KEY_ID\"}")
  if [ "$code" = "201" ] || [ "$code" = "204" ]; then
    echo -e "  ${GREEN}✓${NC} $name"
  else
    echo -e "  ${RED}✗${NC} $name (HTTP $code)"
  fi
}

echo ""
echo -e "${YELLOW}→ Storing individual token secrets...${NC}"

# Read each token from .env and store it
while IFS='=' read -r key value; do
  # Skip comments + empty lines + non-token keys
  case "$key" in
    MODAL_TOKEN_ID|MODAL_TOKEN_SECRET|MODAL_PROXY_KEY|MODAL_PROXY_SECRET|HF_TOKEN|BROWSERLESS_TOKEN)
      if [ -n "$value" ]; then
        store_secret "$key" "$value"
      fi
      ;;
  esac
done < "$ENV_FILE"

echo ""
echo -e "${YELLOW}→ Storing full .env as NEXUS_ENV_BLOB (base64)...${NC}"
ENV_BLOB=$(base64 -w 0 "$ENV_FILE")
store_secret "NEXUS_ENV_BLOB" "$ENV_BLOB"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ .env pushed to GitHub Secrets successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  After a sandbox wipe, restore with:"
echo -e "    ${YELLOW}export GH_PAT=\"github_pat_...\"${NC}"
echo -e "    ${YELLOW}git clone https://github.com/$REPO.git${NC}"
echo -e "    ${YELLOW}cd NEXUS_WEAVER && bun install${NC}"
echo -e "    ${YELLOW}./scripts/restore-env.sh${NC}"
echo -e "    ${YELLOW}bun run db:push${NC}"
echo -e "    ${YELLOW}bun run dev${NC}"
echo ""
