/**
 * NEXUS Visual Weaver — Secrets (Professional pattern)
 *
 * HOW THIS WORKS:
 * 1. Token VALUES (Modal API keys, HF token, Browserless token) are stored as
 *    GitHub repo Secrets (encrypted at rest, never in the repo). A recovery
 *    script (scripts/restore-env.sh) pulls them into .env on first setup.
 * 2. This file reads from process.env at runtime — NO hardcoded token values.
 * 3. Endpoint URLs (Modal generate/health/brain/video URLs) are NOT secrets
 *    (they're public Modal Web Function URLs) and stay here as fallbacks.
 * 4. After a sandbox wipe: git clone → scripts/restore-env.sh → bun run dev.
 *
 * SECURITY: Token values never appear in git history → GitHub secret scanning
 * passes → no leaked credentials. The recovery script uses the GitHub API
 * (with a PAT) to read repo secrets and write them to .env.
 */

// ── Token values (read from env — restored by scripts/restore-env.sh) ────────
// These MUST be set in .env (restored from GitHub Secrets after a wipe).
// If missing, the pipeline will throw a clear error pointing to restore-env.sh.

export const MODAL_TOKEN_ID = process.env.MODAL_TOKEN_ID || "";
export const MODAL_TOKEN_SECRET = process.env.MODAL_TOKEN_SECRET || "";

// Modal PROXY tokens — for authenticating to Modal Auto Endpoints and
// Web Functions with requires_proxy_auth=True.
// Proxy tokens use wk-/ws- prefixes (API tokens use ak-/as- prefixes).
// Created via: modal workspace proxy-tokens create
export const MODAL_PROXY_KEY = process.env.MODAL_PROXY_KEY || "";
export const MODAL_PROXY_SECRET = process.env.MODAL_PROXY_SECRET || "";

// HuggingFace token — used by Modal apps to download gated models
// (FLUX.2-klein-9B is gated, requires HF auth)
export const HF_TOKEN =
  process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN || "";

// Browserless token — for headless browser scraping (Civitai, Civitai.red)
export const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || "";

// ── Modal Endpoint URLs (public, NOT secrets — safe as fallbacks) ────────────

// FLUX.2 Klein 9B — image generation endpoint (L40S GPU, public, no auth)
export const MODAL_FLUX2_GENERATE_URL =
  process.env.MODAL_FLUX2_URL ||
  "https://specimba--nexus-flux2-klein9b-nexusflux2generator-generate.modal.run";
export const MODAL_FLUX2_HEALTH_URL =
  process.env.MODAL_FLUX2_HEALTH_URL ||
  MODAL_FLUX2_GENERATE_URL.replace(/-generate\.modal\.run$/, "-health.modal.run");

// ── Brain endpoint ───────────────────────────────────────────────────────────
// v5.31: Switched from AEON BF16 on B200 (expensive Auto Endpoint) to
// AEON FP8 on L40S via vLLM (same model, 85% cheaper, same GPU as FLUX.2).
//
// Model: kasimat/Qwen3.6-27B-AEON-Ultimate-Uncensored-FP8-MTP
//   - Same AEON-7 uncensored fine-tune, FP8 quantized
//   - Full VLM: Qwen3VLProcessor (vision + text + video)
//   - Fits L40S 48GB (~27GB weights + KV cache)
//   - vLLM OpenAI-compatible API (no proxy auth needed)
//
// Deploy: modal deploy modal-apps/nexus_brain_vllm.py
// Then set MODAL_BRAIN_URL to the Web Function URL.
export const MODAL_BRAIN_URL =
  process.env.MODAL_BRAIN_URL ||
  ""; // Set after deploying nexus_brain_vllm.py
export const MODAL_BRAIN_MODEL =
  process.env.MODAL_BRAIN_MODEL ||
  "kasimat/Qwen3.6-27B-AEON-Ultimate-Uncensored-FP8-MTP";

// ── Timeouts ─────────────────────────────────────────────────────────────────
export const MODAL_COLD_START_TIMEOUT = Number(process.env.MODAL_COLD_START_TIMEOUT || 300);
export const MODAL_WARM_TIMEOUT = Number(process.env.MODAL_WARM_TIMEOUT || 120);

// ── Video I2V backends ───────────────────────────────────────────────────────
// Wan 2.2 I2V (H100) — @app.cls pattern, URL includes class name
export const MODAL_WAN22_URL =
  process.env.MODAL_WAN22_URL ||
  "https://specimba--nexus-wan22-i2v-nexuswan22generator-web-app.modal.run";
// LTX 2.3 I2V (H100)
export const MODAL_LTX23_URL =
  process.env.MODAL_LTX23_URL ||
  "https://specimba--nexus-ltx23-i2v-nexusltx23generator-web-app.modal.run";

// ── Additional image generation backends ─────────────────────────────────────
// Krea 2 Turbo (H100) — Krea2Pipeline, Qwen3VL text encoder
// Fast high-quality generation, LoRA-compatible
export const MODAL_KREA2_URL =
  process.env.MODAL_KREA2_URL ||
  "https://specimba--nexus-krea2-turbo-nexuskrea2generator-web-app.modal.run";
// Z-Image Turbo (H100) — ZImagePipeline, Qwen3 text encoder
// Alibaba's fast model (933K downloads), LoRA-compatible
export const MODAL_ZIMAGE_URL =
  process.env.MODAL_ZIMAGE_URL ||
  "https://specimba--nexus-zimage-turbo-nexuszimagegenerator-web-app.modal.run";

// ── Validation helper ────────────────────────────────────────────────────────
/** Returns true if all required tokens are present (for health checks). */
export function areTokensConfigured(): boolean {
  return Boolean(MODAL_TOKEN_ID && MODAL_TOKEN_SECRET);
}
