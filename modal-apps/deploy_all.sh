#!/bin/bash
# NEXUS Visual Weaver — One-Command Modal Deployment Script
#
# This script deploys all three Modal apps:
#   1. nexus-flux2-klein9b   — FLUX.2 Klein 9B image generation (L40S GPU)
#   2. nexus-kontext-refine   — FLUX.1 Kontext garment editing (L40S GPU)
#   3. nexus-brain-gemma4     — Uncensored Gemma 4 12B brain (H100 GPU)
#
# Prerequisites:
#   pip install modal
#   modal token set --token-id <YOUR_MODAL_TOKEN_ID> --token-secret <YOUR_MODAL_TOKEN_SECRET>
#
# Usage:
#   chmod +x modal-apps/deploy_all.sh
#   ./modal-apps/deploy_all.sh
#
# After deploy, update .env with the new endpoint URLs (printed at the end).

set -e

echo "=========================================="
echo "NEXUS Visual Weaver — Modal Deployment"
echo "=========================================="
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

echo "Modal authenticated. Workspace: $(modal token info 2>&1 | head -1)"
echo ""

# Create the HuggingFace secret (idempotent — overwrites if exists)
echo "=== Setting HuggingFace secret ==="
export HF_TOKEN="${HF_TOKEN:-hf_YOUR_HF_TOKEN_HERE}"
modal secret create huggingface-secret HF_TOKEN="$HF_TOKEN" 2>&1 || true
echo ""

# Deploy FLUX.2 Klein 9B
echo "=== Deploying FLUX.2 Klein 9B (image generation) ==="
echo "This loads the model on first call (~30-60s cold start)..."
modal deploy modal-apps/nexus_flux2_klein9b.py
echo ""
echo "FLUX.2 Klein 9B deployed!"
echo "  Health:  https://specimba--nexus-flux2-klein9b-web-app.modal.run/health"
echo "  Generate: https://specimba--nexus-flux2-klein9b-web-app.modal.run/generate"
echo ""

# Deploy FLUX.1 Kontext (garment refinement)
echo "=== Deploying FLUX.1 Kontext (garment editing) ==="
echo "Note: FLUX.1-Kontext-dev is a gated model. Ensure your HF token has access."
modal deploy modal-apps/nexus_kontext_refine.py
echo ""
echo "Kontext deployed!"
echo "  Health: https://specimba--nexus-kontext-refine-web-app.modal.run/health"
echo "  Edit:   https://specimba--nexus-kontext-refine-web-app.modal.run/edit"
echo ""

# Deploy Gemma 4 12B Brain
echo "=== Deploying Gemma 4 12B Brain (uncensored) ==="
echo "This loads a 12B model on H100 (~60-120s cold start)..."
modal deploy modal-apps/nexus_brain_gemma4.py
echo ""
echo "Brain deployed!"
echo "  Health: https://specimba--nexus-brain-gemma4-web-app.modal.run/health"
echo "  Chat:   https://specimba--nexus-brain-gemma4-web-app.modal.run/chat"
echo ""

echo "=========================================="
echo "All Modal apps deployed!"
echo "=========================================="
echo ""
echo "Update your .env with these endpoints:"
echo ""
echo "  # FLUX.2 Klein 9B (primary image generation)"
echo "  MODAL_FLUX2_URL=https://specimba--nexus-flux2-klein9b-web-app.modal.run"
echo ""
echo "  # FLUX.1 Kontext (garment refinement)"
echo "  MODAL_KONTEXT_URL=https://specimba--nexus-kontext-refine-web-app.modal.run"
echo ""
echo "  # Gemma 4 12B Brain (uncensored)"
echo "  MODAL_BRAIN_URL=https://specimba--nexus-brain-gemma4-web-app.modal.run"
echo ""
echo "The dashboard will auto-detect these endpoints and route to them."
