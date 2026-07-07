/**
 * Modal client v4 — cost-optimized wrapper around the deployed Modal app.
 *
 * CRITICAL CHANGE (cost optimization): health checks are now CACHED with a
 * 60-second TTL. The previous version hit Modal's /health on every dashboard
 * poll (8 loops × 10-30s intervals = ~310 checks/day), which either kept the
 * H100 container warm (idle waste) or triggered cold starts. Now, repeated
 * /api/modal/status calls within 60s return the cached result without touching
 * Modal at all.
 *
 * Endpoint: https://specimba--nexus-visual-nexusmodel-serve.modal.run
 *   GET  /health  → {"status":"ok","model":"...","gpu":"..."}
 *   POST /generate → {"image": "<base64 PNG>", "ms": int, "size": "WxH"}
 *
 * Backend only. Used by src/lib/pipeline.ts when process.env.MODAL_USE === "true".
 */

import { assessBudgetStatus, DEFAULT_WORKSPACE_BUDGET_USD, DEFAULT_CONTRACT, type SpendRecord, type ModalGpu } from "@/lib/modal-budget";
import {
  MODAL_PROXY_KEY,
  MODAL_PROXY_SECRET,
  MODAL_FLUX2_GENERATE_URL,
  MODAL_FLUX2_HEALTH_URL,
  MODAL_BRAIN_URL,
  MODAL_BRAIN_MODEL,
  MODAL_COLD_START_TIMEOUT as _COLD,
  MODAL_WARM_TIMEOUT as _WARM,
} from "@/lib/secrets";

// FLUX.2 Klein 9B endpoints — from secrets.ts (bulletproof against .env wipes)
const MODAL_FLUX2_URL = MODAL_FLUX2_GENERATE_URL;
const MODAL_FLUX2_HEALTH_URL_FINAL = MODAL_FLUX2_HEALTH_URL;

// Use FLUX.2 generate URL as the primary.
const MODAL_BASE_URL = MODAL_FLUX2_URL;

// FLUX.2-klein-9B is tuned for 4 steps + cfg=1.0 (per Modal app defaults).
// Passing higher values (e.g. steps=24, cfg=10.0 from the Photoreal Portrait
// preset) wastes 15-25s and produces WORSE output. Cap them here so the
// calibration presets don't fight the model.
const FLUX2_MAX_STEPS = 8;   // 4 is ideal, 8 is acceptable, 24 is broken
const FLUX2_DEFAULT_CFG = 1.0; // klein-9B uses near-zero CFG

// Modal is the PRIMARY generation path. Default TRUE even if .env gets reset.
const MODAL_USE = process.env.MODAL_USE !== "false";
const COLD_START_TIMEOUT = _COLD;
const WARM_TIMEOUT = _WARM;

export function isFlux2Deployed(): boolean {
  return MODAL_FLUX2_URL.length > 0;
}

// ── Health cache (60s TTL) ───────────────────────────────────────────────────
// This is the single most important cost optimization: stop hitting Modal every
// 10-15s. The dashboard polls /api/modal/status from 8 places; without this
// cache, each poll either wastes idle H100 time or triggers a cold start.
const HEALTH_CACHE_TTL_MS = 60_000; // 60 seconds

interface CachedHealth {
  data: ModalHealth;
  fetchedAt: number;
}

let _healthCache: CachedHealth | null = null;

export interface ModalHealth {
  ok: boolean;
  status: string;
  model?: string;
  gpu?: string;
  latencyMs: number;
  error?: string;
  cached?: boolean;
  cachedAgeSec?: number;
}

export interface ModalGenerateResult {
  imageBase64: string;
  ms: number;
  size: string;
  latencyMs: number;
}

/**
 * Check whether the Modal backend is reachable + warm.
 * Returns a structured health object; never throws.
 *
 * NOTE: This performs a REAL network call. For dashboard polling, use
 * getCachedModalHealth() instead — it returns a 60s-cached result.
 */
export async function checkModalHealth(): Promise<ModalHealth> {
  const t0 = Date.now();
  // Use the DERIVED health URL (not ${MODAL_BASE_URL}/health which 404s on
  // the generate webhook URL).
  const healthUrl = MODAL_FLUX2_HEALTH_URL_FINAL;
  if (!healthUrl) {
    return {
      ok: false,
      status: "not_configured",
      latencyMs: 0,
      error: "No Modal FLUX.2 URL configured (MODAL_FLUX2_URL env var is empty).",
    };
  }
  try {
    const ctrl = new AbortController();
    // 60s timeout: a cold-starting FLUX.2 container takes 20-40s to load the
    // 29GB weights. The old 8s timeout aborted before the model could even
    // respond, so the health check ALWAYS failed on a cold container — making
    // the auto-warmup on page load completely useless. 60s lets the cold
    // container finish loading and report "ok".
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    const res = await fetch(healthUrl, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return { ok: false, status: "http_error", latencyMs, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as { status?: string; model?: string; gpu?: string };
    const result: ModalHealth = {
      ok: data.status === "ok",
      status: data.status ?? "unknown",
      model: data.model,
      gpu: data.gpu,
      latencyMs,
    };
    // Update the cache with the fresh result
    _healthCache = { data: result, fetchedAt: Date.now() };
    return result;
  } catch (e) {
    const result: ModalHealth = {
      ok: false,
      status: "unreachable",
      latencyMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
    // Cache negative results too (but with shorter TTL handled by caller)
    _healthCache = { data: result, fetchedAt: Date.now() };
    return result;
  }
}

/**
 * CACHED health check — the one the dashboard should use.
 * Returns the cached result if fresher than HEALTH_CACHE_TTL_MS.
 * Only performs a real network call when the cache is stale.
 *
 * This is the fix for the budget bleed: 8 polling loops × 15s intervals
 * now collapse into ~1 actual Modal request per 60s.
 */
export async function getCachedModalHealth(forceRefresh = false): Promise<ModalHealth> {
  const now = Date.now();
  if (!forceRefresh && _healthCache && now - _healthCache.fetchedAt < HEALTH_CACHE_TTL_MS) {
    return {
      ..._healthCache.data,
      cached: true,
      cachedAgeSec: Math.round((now - _healthCache.fetchedAt) / 1000),
    };
  }
  return checkModalHealth();
}

/**
 * Generate an image via the Modal FLUX.2 Klein 9B endpoint.
 *
 * STRATEGY (v5 — async pipeline fix):
 * - Calls the FLUX.2 generate webhook directly with the FULL cold-start
 *   timeout. The old 30s hard-coded probe ALWAYS aborted before the model
 *   finished loading, then fell through to FLUX.1 (doubling cold-start cost).
 * - Caps steps to FLUX2_MAX_STEPS (8) and forces cfg to FLUX2_DEFAULT_CFG
 *   (1.0). FLUX.2-klein-9B is tuned for 4 steps / cfg=1.0; passing steps=24
 *   + cfg=10.0 wastes 15-25s and produces worse output.
 * - Sends simple params (prompt, steps, cfg, seed, height, width) as QUERY
 *   parameters and the loras array as the JSON BODY. This matches how
 *   @modal.fastapi_endpoint maps Python function signatures: simple types →
 *   query params, complex types (list[dict]) → request body. Sending
 *   everything as a JSON object body causes HTTP 422 "Field required".
 * - NO FLUX.1 fallback. FLUX.2 is the only path. The async job pattern
 *   surfaces any errors to the UI.
 */
export async function generateImageViaModal(params: {
  prompt: string;
  width: number;
  height: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  loras?: Array<{ repo: string; adapter?: string; weight: number; weightName?: string }>;
  isFirstCall?: boolean;
}): Promise<ModalGenerateResult> {
  const { prompt, width, height, steps, cfg, seed, loras, isFirstCall } = params;
  const timeoutMs = (isFirstCall ? COLD_START_TIMEOUT : WARM_TIMEOUT) * 1000;

  if (!MODAL_FLUX2_URL) {
    throw new Error(
      "MODAL_FLUX2_URL is not set. The FLUX.2 Klein 9B Modal app must be deployed " +
      "and its generate-webhook URL set in .env."
    );
  }

  // Cap steps/cfg to FLUX.2-klein-9B's tuned values.
  const effectiveSteps = Math.min(steps ?? 4, FLUX2_MAX_STEPS);
  const effectiveCfg = FLUX2_DEFAULT_CFG;
  if (steps && steps > FLUX2_MAX_STEPS) {
    console.log(
      `[modal-client] Capping steps ${steps}→${effectiveSteps} and forcing cfg ${cfg}→${effectiveCfg} ` +
      `(FLUX.2-klein-9B is tuned for 4 steps / cfg 1.0; higher values waste time + degrade quality)`
    );
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = Date.now();

  // Build the request for @modal.fastapi_endpoint(method="POST"):
  // FastAPI treats simple types (str, int, float) as QUERY parameters and the
  // single complex type (loras: list[dict]) as the JSON BODY.
  const queryParams = new URLSearchParams({
    prompt,
    negative_prompt: "",
    steps: String(effectiveSteps),
    cfg: String(effectiveCfg),
    seed: String(seed ?? 42),
    height: String(height),
    width: String(width),
  });
  const generateUrl = `${MODAL_FLUX2_URL}?${queryParams.toString()}`;
  // Body = the loras list (JSON array). Convert weightName → weight_name for the
  // Python Modal app (which reads lora.get("weight_name", "")). When no loras,
  // send an empty array.
  const lorasBody = JSON.stringify(
    loras && loras.length > 0
      ? loras.map((l) => ({
          repo: l.repo,
          adapter: l.adapter,
          weight: l.weight,
          ...(l.weightName ? { weight_name: l.weightName } : {}),
        }))
      : []
  );

  try {
    const res = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: lorasBody,
      signal: ctrl.signal,
    });
    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Modal FLUX.2 /generate HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    const responseText = await res.text();
    if (responseText.length < 100) {
      throw new Error(`Modal FLUX.2 returned empty response (${responseText.length} chars)`);
    }

    const data = JSON.parse(responseText) as { image?: string; ms?: number; size?: string; error?: string };
    if (data.error) throw new Error(`Modal FLUX.2 app error: ${data.error}`);
    if (!data.image) throw new Error(`Modal FLUX.2 returned no image. Keys: ${Object.keys(data).join(",")}`);
    if (data.image.length < 1000) throw new Error(`Modal FLUX.2 returned truncated image (${data.image.length} chars)`);

    recordSpend({
      gpu: "L40S",
      durationSec: latencyMs / 1000,
      kind: latencyMs > 10_000 ? "cold_start" : "inference",
    });

    return {
      imageBase64: data.image,
      ms: data.ms ?? latencyMs,
      size: data.size ?? `${width}x${height}`,
      latencyMs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted") || msg.includes("AbortError")) {
      throw new Error(
        `Modal FLUX.2 timed out after ${timeoutMs / 1000}s. The container may still be ` +
        `cold-starting (downloading 29GB weights). Wait 60s and retry — the second call ` +
        `will be warm. Original: ${msg}`
      );
    }
    throw new Error(`Modal FLUX.2 generation failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

export function isModalEnabled(): boolean {
  return MODAL_USE;
}

export function getModalBaseUrl(): string {
  return MODAL_BASE_URL;
}

// ── Modal Brain Endpoint (Qwen3.6-27B-AEON-Ultimate-Uncensored-BF16) ─────────
// Modal Auto Endpoint serving AEON-7/Qwen3.6-27B-AEON-Ultimate-Uncensored-BF16
// on a B200 GPU (EU West). OpenAI-compatible /v1/chat/completions API.
//
// Used as the pipeline "brain" for ST3GG safety scan, visual judge, and
// Nemotron evidence parsing. This model has vision + broad uncensored reasoning
// — it can analyze mature content without refusal AND process images.
//
// AUTH: Modal Auto Endpoints require proxy auth. MODAL_TOKEN_ID and
// MODAL_TOKEN_SECRET are sent as Modal-Key and Modal-Secret headers.
// These are imported from src/lib/secrets.ts (committed to git, bulletproof
// against .env wipes).
//
// The endpoint URL + model name are also from secrets.ts. If the endpoint is
// still provisioning, callModalBrain returns null and the pipeline falls
// through to z-ai — so the pipeline always works, even before the brain is ready.

export function isBrainEndpointConfigured(): boolean {
  // Brain endpoint is "configured" if we have the URL AND proxy auth tokens.
  // Proxy tokens (wk-/ws-) are created via `modal workspace proxy-tokens create`
  // and are DIFFERENT from API tokens (ak-/as-). API tokens don't work for
  // endpoint proxy auth.
  return MODAL_BRAIN_URL.length > 0 && MODAL_PROXY_KEY.length > 0 && MODAL_PROXY_SECRET.length > 0;
}

export function getModalBrainUrl(): string {
  return MODAL_BRAIN_URL;
}

/**
 * Check if the AEON brain endpoint is alive (warm). Sends a lightweight
 * /v1/models request with proxy auth. Returns { ok, latencyMs, error }.
 *
 * Used by /api/modal/warmup to warm BOTH the FLUX.2 container AND the brain
 * endpoint simultaneously — so when the user clicks "Warm up", both are ready.
 *
 * Never throws — returns { ok: false } on any error.
 */
export async function checkBrainHealth(): Promise<{
  ok: boolean;
  latencyMs: number;
  status: string;
  error?: string;
}> {
  if (!isBrainEndpointConfigured()) {
    return { ok: false, latencyMs: 0, status: "not_configured", error: "Brain endpoint not configured" };
  }
  const t0 = Date.now();
  try {
    // Use /v1/models — it's a lightweight GET that vLLM responds to quickly.
    // A 200 means the container is warm and the model is loaded.
    // A 503 means the container is still cold-starting (scale-to-zero).
    const res = await fetch(`${MODAL_BRAIN_URL}/v1/models`, {
      method: "GET",
      headers: {
        "Modal-Key": MODAL_PROXY_KEY,
        "Modal-Secret": MODAL_PROXY_SECRET,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const latencyMs = Date.now() - t0;
    if (res.ok) {
      return { ok: true, latencyMs, status: "ok" };
    }
    if (res.status === 503) {
      return { ok: false, latencyMs, status: "cold_starting", error: "Container still cold-starting" };
    }
    return { ok: false, latencyMs, status: "http_error", error: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, latencyMs: Date.now() - t0, status: "unreachable", error: msg };
  }
}

export interface BrainChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BrainChatResult {
  content: string;
  ms: number;
  model: string;
}

/**
 * Call the Modal brain endpoint (OpenAI-compatible /v1/chat/completions).
 * Has a 60s timeout — if the brain container is cold-starting (vLLM takes
 * 60-120s to load a 27B model), we abort and let the caller fall through to
 * z-ai. Without this, ST3GG hangs forever and the pipeline stalls.
 *
 * Returns null on failure (timeout, HTTP error, network error, endpoint still
 * provisioning) so the caller can gracefully fall through to z-ai. NEVER throws.
 */
export async function callModalBrain(
  messages: BrainChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<BrainChatResult | null> {
  if (!isBrainEndpointConfigured()) return null;
  const temperature = options?.temperature ?? 0.3;
  const maxTokens = options?.maxTokens ?? 2000;
  const t0 = Date.now();
  try {
    const res = await fetch(`${MODAL_BRAIN_URL}/v1/chat/completions`, {
      method: "POST",
      // Modal Auto Endpoints require proxy auth: Modal-Key + Modal-Secret headers.
      // These must be PROXY tokens (wk-/ws-), NOT API tokens (ak-/as-).
      headers: {
        "Content-Type": "application/json",
        "Modal-Key": MODAL_PROXY_KEY,
        "Modal-Secret": MODAL_PROXY_SECRET,
      },
      body: JSON.stringify({
        model: MODAL_BRAIN_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log(`[modal-brain] HTTP ${res.status}: ${text.slice(0, 200)}`);
      return null;
    }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) {
      console.log("[modal-brain] empty response content");
      return null;
    }
    return {
      content,
      ms: Date.now() - t0,
      model: "Qwen3.6-27B-AEON-Ultimate-Uncensored-BF16 (Modal B200)",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[modal-brain] failed (endpoint may still be provisioning): ${msg}`);
    return null;
  }
}

// ── In-process spend tracker (resets on server restart) ──────────────────────
// For persistent tracking, /api/modal/budget persists to the DB. This in-memory
// tracker gives instant reads for the Cost Lab without a DB round-trip.

let _spendRecords: SpendRecord[] = [];
let _cycleStartUsd = 0; // amount already spent before this server session (from Modal dashboard)

/**
 * Initialize the cycle spend from the Modal dashboard value (called once on
 * server boot or when the user enters their current spend in Cost Lab).
 */
export function initCycleSpend(alreadySpentUsd: number): void {
  _cycleStartUsd = alreadySpentUsd;
}

/**
 * Record a spend event (cold start, inference, idle, or health check).
 */
export function recordSpend(params: {
  gpu: ModalGpu;
  durationSec: number;
  kind: "cold_start" | "inference" | "idle" | "health_check";
  generationId?: string;
}): void {
  const gpu = params.gpu;
  const costPerSec =
    gpu === "H100" ? 0.001097 :
    gpu === "L40S" ? 0.000542 :
    gpu === "L4" ? 0.000222 :
    gpu === "A10" ? 0.000306 :
    gpu === "A100-80" ? 0.000694 :
    0.001097; // default H100
  const costUsd = costPerSec * params.durationSec;
  _spendRecords.push({
    timestamp: Date.now(),
    gpu: params.gpu,
    durationSec: params.durationSec,
    costUsd,
    kind: params.kind,
    generationId: params.generationId,
  });
  // Cap the in-memory log at 500 entries (keep recent)
  if (_spendRecords.length > 500) {
    _spendRecords = _spendRecords.slice(-500);
  }
}

/**
 * Get the current budget status for the Cost Lab.
 */
export function getBudgetStatus(spentThisCycleUsd?: number): ReturnType<typeof assessBudgetStatus> {
  // If the user provided their actual Modal dashboard spend, use it.
  // Otherwise estimate from in-memory records + cycle start.
  const actual = spentThisCycleUsd ?? _cycleStartUsd;
  return assessBudgetStatus({
    spentThisCycleUsd: actual,
    workspaceBudgetUsd: DEFAULT_WORKSPACE_BUDGET_USD,
    contract: DEFAULT_CONTRACT,
    recentSpend: _spendRecords,
  });
}

/**
 * Get the raw spend records (for the Cost Lab's spend log table).
 */
export function getSpendRecords(): SpendRecord[] {
  return _spendRecords;
}

/**
 * Count spend events by kind in the last 24h (for the diagnosis dashboard).
 */
export function countSpendByKind(): {
  coldStarts24h: number;
  inferences24h: number;
  healthChecks24h: number;
  idleEvents24h: number;
} {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const recent = _spendRecords.filter((r) => r.timestamp > cutoff);
  return {
    coldStarts24h: recent.filter((r) => r.kind === "cold_start").length,
    inferences24h: recent.filter((r) => r.kind === "inference").length,
    healthChecks24h: recent.filter((r) => r.kind === "health_check").length,
    idleEvents24h: recent.filter((r) => r.kind === "idle").length,
  };
}
