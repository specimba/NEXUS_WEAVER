#!/bin/bash
# =============================================================================
# NEXUS Visual Weaver — Safe Modal Deployment Script
# =============================================================================
# Deploys ONLY the L40S image apps (FLUX.2 + Kontext inpaint).
#
# ⚠️  AGENTS.md RULE #3: NEVER deploy H100 Modal apps unless explicitly asked.
#     H100 video engines (Wan 2.2, LTX 2.3) and H100 image engines (Z-Image,
#     Krea 2) are deployed ON-DEMAND via the Studio UI engine picker, which
#     uses src/lib/engine-manager.ts to deploy/stop them per-session. They
#     scale to zero (min_containers=0, 5min scaledown) so they cost $0 idle.
#
# ⚠️  The 3 brain stages (ST3GG/Judge/Creative) are Modal MANAGED ENDPOINTS
#     (created via `modal endpoint create`), NOT Modal Apps. They are NOT
#     deployed by this script. See HANDOFF.md §2.
#
# This script was rewritten (cost audit 2-a) to remove:
#   - nexus_brain_gemma4.py (H100, 15min scaledown, fully replaced by managed
#     endpoints — deploying it was a rule #3 violation + $0.99/cycle waste)
#   - nexus_kontext_refine.py (redundant with the deployed nexus_kontext_inpaint)
#
# Prerequisites:
#   pip install modal
#   modal token set --token-id <ID> --token-secret <SECRET>
#   export HF_TOKEN=<your_hf_token>  # for gated FLUX.2-klein-9B downloads
# =============================================================================

set -e

echo "=========================================="
echo "NEXUS Visual Weaver — Safe Modal Deployment (L40S only)"
echo "=========================================="
echo ""
echo "⚠️  This deploys ONLY L40S image apps (FLUX.2 + Kontext inpaint)."
echo "    H100 engines are deployed on-demand via the Studio UI (rule #3)."
echo "    Brain stages use Modal Managed Endpoints (not apps)."
echo ""

# Check if Modal is installed
if ! command -v modal &> /dev/null; then
    echo "Installing Modal..."
    pip install modal
fi

# Check if Modal is authenticated
if ! modal token info &> /dev/null; then
    echo "ERROR: Modal is not authenticated."
    echo "Run: modal token set --token-id <ID> --token-secret <SECRET>"
    echo "Get your token from: https://modal.com/settings"
    exit 1
fi

echo "Modal authenticated. Workspace: $(modal profile current 2>&1 | head -1)"
echo ""

# Create the HuggingFace secret (idempotent — overwrites if exists)
# Required for FLUX.2-klein-9B (gated) + Kontext-dev (gated) weight downloads.
# The hf-hub-cache Volume means this is only needed on FIRST deploy.
if [ -z "${HF_TOKEN:-}" ]; then
    echo "⚠️  HF_TOKEN not set. FLUX.2-klein-9B is gated — first cold start will fail"
    echo "    without it. Set: export HF_TOKEN=hf_xxx  (https://huggingface.co/settings/tokens)"
else
    echo "=== Setting HuggingFace secret ==="
    modal secret create huggingface-secret HF_TOKEN="$HF_TOKEN" 2>&1 || true
fi
echo ""

# Deploy FLUX.2 Klein 9B (primary image generation, L40S)
echo "=== Deploying FLUX.2 Klein 9B (image generation, L40S) ==="
echo "min_containers=0, scaledown=5min → $0 idle. First cold start ~24s (weights cached)."
modal deploy modal-apps/nexus_flux2_klein9b.py
echo ""
echo "FLUX.2 Klein 9B deployed!"
echo "  Generate: https://specimba--nexus-flux2-klein9b-nexusflux2generator-generate.modal.run"
echo ""

# Deploy Kontext inpaint (L40S)
echo "=== Deploying FLUX.1 Kontext inpaint (L40S) ==="
echo "Used by the NO8D inpainting canvas (mask + redraw). min_containers=0, 5min scaledown."
modal deploy modal-apps/nexus_kontext_inpaint.py
echo ""
echo "Kontext inpaint deployed!"
echo "  Inpaint:  https://specimba--nexus-kontext-inpaint-nexuskontextinpaint-web-app.modal.run"
echo ""

echo "=========================================="
echo "✅ Safe deployment complete (2 L40S apps)"
echo "=========================================="
echo ""
echo "H100 engines (Wan 2.2, LTX 2.3, Z-Image, Krea 2) are deployed on-demand"
echo "via the Studio UI engine picker — they cost $0 when idle."
echo ""
echo "Brain stages (ST3GG/Judge/Creative) are Modal Managed Endpoints:"
echo "  modal endpoint list"
echo "  Verify min_containers=0 on the Modal dashboard (Endpoins → Scaling)."
