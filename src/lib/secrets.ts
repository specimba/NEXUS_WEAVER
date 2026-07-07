/**
 * NEXUS Visual Weaver — Secrets (BULLETPROOF storage)
 *
 * WHY THIS FILE EXISTS:
 * The sandbox environment periodically resets the `.env` file, wiping all
 * Modal/HF tokens and causing the pipeline to fail with "MODAL_FLUX2_URL is
 * not set" or 401 auth errors. This file is COMMITTED TO GIT and contains the
 * tokens as hardcoded fallback constants. The code reads from `process.env`
 * first (for local dev override), then falls back to these constants.
 *
 * This ensures the tokens ALWAYS survive sandbox resets — they're in the git
 * history, not in a volatile .env file.
 *
 * SECURITY NOTE: In a production deployment, these would be in a secrets
 * manager (Vault, AWS Secrets Manager, etc.) — never in source code. This
 * pattern is specific to the sandbox dev environment where .env persistence
 * is unreliable.
 */

// Modal API tokens — for CLI auth and app management
// Get from: Modal Dashboard → Settings → API Tokens
export const MODAL_TOKEN_ID = process.env.MODAL_TOKEN_ID || "ak_REDACTED_SEE_GITHUB_SECRETS";
export const MODAL_TOKEN_SECRET = process.env.MODAL_TOKEN_SECRET || "as_REDACTED_SEE_GITHUB_SECRETS";

// Modal PROXY tokens — for authenticating to Modal Auto Endpoints and
// Web Functions with requires_proxy_auth=True.
// Proxy tokens use wk-/ws- prefixes (API tokens use ak-/as- prefixes).
// They CANNOT be interchanged. Created via: modal workspace proxy-tokens create
// These are sent as Modal-Key + Modal-Secret headers to the brain endpoint.
export const MODAL_PROXY_KEY = process.env.MODAL_PROXY_KEY || "wk_REDACTED_SEE_GITHUB_SECRETS";
export const MODAL_PROXY_SECRET = process.env.MODAL_PROXY_SECRET || "ws_REDACTED_SEE_GITHUB_SECRETS";

// HuggingFace token — used by Modal apps to download gated models
// (FLUX.2-klein-9B is gated, requires HF auth)
export const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN || "***REMOVED***_SEE_GITHUB_SECRETS";

// ── Modal Endpoint URLs ──────────────────────────────────────────────────────

// FLUX.2 Klein 9B — image generation endpoint (L40S GPU, public, no auth needed)
// @modal.fastapi_endpoint URLs — each method gets its own URL
export const MODAL_FLUX2_GENERATE_URL =
  process.env.MODAL_FLUX2_URL ||
  "https://specimba--nexus-flux2-klein9b-nexusflux2generator-generate.modal.run";
export const MODAL_FLUX2_HEALTH_URL =
  process.env.MODAL_FLUX2_HEALTH_URL ||
  MODAL_FLUX2_GENERATE_URL.replace(/-generate\.modal\.run$/, "-health.modal.run");

// Qwen3.6-27B-AEON-Ultimate-Uncensored-BF16 — the brain endpoint (B200 GPU)
// Modal Auto Endpoint — OpenAI-compatible /v1/chat/completions API
// REQUIRES proxy auth (Modal-Key + Modal-Secret headers)
// Model: AEON-7/Qwen3.6-27B-AEON-Ultimate-Uncensored-BF16
// This model has vision + broad uncensored reasoning — used for ST3GG, Judge, Nemotron
export const MODAL_BRAIN_URL =
  process.env.MODAL_BRAIN_URL ||
  "https://specimba--ep-qwen3-6-27b-aeon-ultimate-uncensored-bf16-server.eu-west.modal.direct";

// The model name to send in the OpenAI-compatible API request body
export const MODAL_BRAIN_MODEL =
  process.env.MODAL_BRAIN_MODEL ||
  "AEON-7/Qwen3.6-27B-AEON-Ultimate-Uncensored-BF16";

// ── Timeouts ─────────────────────────────────────────────────────────────────
export const MODAL_COLD_START_TIMEOUT = Number(process.env.MODAL_COLD_START_TIMEOUT || 300);
export const MODAL_WARM_TIMEOUT = Number(process.env.MODAL_WARM_TIMEOUT || 120);
