/**
 * NEXUS Visual Weaver — Endpoint Warm-Up Manager
 *
 * Solves the Modal Managed Endpoint cold-start problem properly:
 *
 * PROBLEM:
 * Modal Managed Endpoints scale to zero when idle. When called, they return
 * 503 while the container spins up (30-120s). The old code fell back to z-ai,
 * which masked the problem and produced inconsistent results (sometimes
 * uncensored Modal, sometimes censored z-ai).
 *
 * SOLUTION:
 * 1. Pre-warm: When the user opens the Studio, fire a lightweight GET /v1/models
 *    to each endpoint. This triggers container startup. By the time the user
 *    writes a prompt and clicks Run, the endpoints are warm.
 * 2. Retry with backoff: If an endpoint returns 503, retry 3 times with
 *    increasing delays (5s, 10s, 15s). Total max wait: 30s.
 * 3. No silent fallback: If the endpoint is still cold after retries, return
 *    a clear error. The user sees "brain cold — retry in 30s" instead of
 *    silently getting a different model.
 * 4. Status tracking: Track which endpoints are warm/cold. The UI shows
 *    real-time status so the user knows what to expect.
 */

import { MODAL_BRAIN_URL, MODAL_JUDGE_URL, MODAL_CREATIVE_URL, MODAL_PROXY_KEY, MODAL_PROXY_SECRET, MODAL_FLUX2_HEALTH_URL } from "@/lib/secrets";

export type EndpointName = "st3gg" | "judge" | "creative" | "flux2";
export type EndpointStatus = "warm" | "cold" | "warming" | "error";

interface EndpointState {
  status: EndpointStatus;
  lastChecked: number;
  lastError: string | null;
}

// In-memory status cache (survives for the server session)
const endpointStates: Record<EndpointName, EndpointState> = {
  st3gg: { status: "cold", lastChecked: 0, lastError: null },
  judge: { status: "cold", lastChecked: 0, lastError: null },
  creative: { status: "cold", lastChecked: 0, lastError: null },
  flux2: { status: "cold", lastChecked: 0, lastError: null },
};

const STATUS_TTL_MS = 30_000; // 30s — status is valid for 30s before re-checking

function getEndpointUrl(name: EndpointName): string | null {
  switch (name) {
    case "st3gg": return MODAL_BRAIN_URL || null;
    case "judge": return MODAL_JUDGE_URL || null;
    case "creative": return MODAL_CREATIVE_URL || null;
    case "flux2": return MODAL_FLUX2_HEALTH_URL || null;
  }
}

/**
 * Ping an endpoint to check if it's warm (or trigger warm-up if cold).
 * Returns true if the endpoint responded with 200.
 */
export async function pingEndpoint(name: EndpointName, timeoutMs = 5000): Promise<boolean> {
  const url = getEndpointUrl(name);
  if (!url) {
    endpointStates[name] = { status: "error", lastChecked: Date.now(), lastError: "endpoint not configured" };
    return false;
  }

  // FLUX.2 doesn't need proxy auth — it's a public Web Function
  const needsAuth = name !== "flux2";
  const headers: Record<string, string> = {};
  if (needsAuth && MODAL_PROXY_KEY && MODAL_PROXY_SECRET) {
    headers["Modal-Key"] = MODAL_PROXY_KEY;
    headers["Modal-Secret"] = MODAL_PROXY_SECRET;
  }

  // Brain managed endpoints need /v1/models (the base URL returns 404 with no
  // root handler, which would falsely mark a warm endpoint as "error"). FLUX.2
  // uses its dedicated /health URL (already set in secrets.ts).
  const pingUrl = needsAuth ? `${url}/v1/models` : url;

  try {
    const res = await fetch(pingUrl, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.ok) {
      endpointStates[name] = { status: "warm", lastChecked: Date.now(), lastError: null };
      return true;
    }

    // 503 = cold-starting, not an error — mark as "warming"
    if (res.status === 503) {
      endpointStates[name] = { status: "warming", lastChecked: Date.now(), lastError: null };
      return false;
    }

    // 404 = app is stopped (not just cold) — different from 503
    if (res.status === 404) {
      endpointStates[name] = { status: "error", lastChecked: Date.now(), lastError: "app stopped (404)" };
      return false;
    }

    endpointStates[name] = { status: "error", lastChecked: Date.now(), lastError: `HTTP ${res.status}` };
    return false;
  } catch (err) {
    // Timeout = container is cold-starting (loading weights)
    // This is expected for FLUX.2 (~20-30s) and brain endpoints (~60-120s)
    endpointStates[name] = {
      status: "warming",
      lastChecked: Date.now(),
      lastError: null,
    };
    return false;
  }
}

/**
 * Pre-warm all endpoints. Fire-and-forget — called on page load.
 * Pings each endpoint in parallel. The first ping triggers the container
 * startup. Subsequent calls within 5 min will find the container warm.
 */
// 5-minute cooldown — prevents duplicate pre-warm calls from React StrictMode
// double-fire + rapid Studio remounts. Each pre-warm pings 4 GPU endpoints and
// can trigger cold-starts (~$0.18-0.55 when all cold). (Cost audit 2-a, fix C-b-4.)
let _lastPreWarmAt = 0;
const PRE_WARM_COOLDOWN_MS = 300_000;

export async function preWarmAllEndpoints(): Promise<void> {
  if (Date.now() - _lastPreWarmAt < PRE_WARM_COOLDOWN_MS) {
    console.log("[warmup] Skipping pre-warm (within 5min cooldown)");
    return;
  }
  _lastPreWarmAt = Date.now();
  console.log("[warmup] Pre-warming all endpoints (FLUX.2 + 3 brain endpoints)...");
  await Promise.allSettled([
    pingEndpoint("flux2", 10000),  // FLUX.2 takes longer to respond (10s timeout)
    pingEndpoint("st3gg"),
    pingEndpoint("judge"),
    pingEndpoint("creative"),
  ]);
  console.log("[warmup] Pre-warm complete:", getEndpointStatuses());
}

/**
 * Call an endpoint with retry+backoff. If the endpoint returns 503
 * (cold-starting), retry up to 3 times with increasing delays.
 *
 * This replaces the old "fall back to z-ai" pattern. Instead of silently
 * using a different model, we wait for the correct model to warm up.
 *
 * @param name Which endpoint to call
 * @param body The request body (chat completions format)
 * @param maxRetries How many times to retry on 503 (default: 3)
 * @returns The response data, or null if the endpoint is still cold after retries
 */
export async function callEndpointWithRetry(
  name: EndpointName,
  body: Record<string, unknown>,
  maxRetries = 3
): Promise<{ ok: boolean; data?: any; error?: string; warm: boolean }> {
  const url = getEndpointUrl(name);
  if (!url || !MODAL_PROXY_KEY || !MODAL_PROXY_SECRET) {
    return { ok: false, error: "endpoint not configured", warm: false };
  }

  const retryDelays = [5000, 10000, 15000]; // 5s, 10s, 15s

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${url}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Modal-Key": MODAL_PROXY_KEY,
          "Modal-Secret": MODAL_PROXY_SECRET,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });

      if (res.ok) {
        const data = await res.json();
        endpointStates[name] = { status: "warm", lastChecked: Date.now(), lastError: null };
        return { ok: true, data, warm: true };
      }

      if (res.status === 503) {
        // Cold-starting — update status and retry
        endpointStates[name] = { status: "warming", lastChecked: Date.now(), lastError: null };
        console.log(`[warmup:${name}] 503 cold-starting, attempt ${attempt + 1}/${maxRetries + 1}`);

        if (attempt < maxRetries) {
          const delay = retryDelays[attempt] || 15000;
          console.log(`[warmup:${name}] Waiting ${delay / 1000}s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Exhausted retries — return clear error
        return {
          ok: false,
          error: `endpoint cold after ${maxRetries + 1} attempts (${retryDelays.reduce((a, b) => a + b, 0) / 1000}s total wait)`,
          warm: false,
        };
      }

      // Other HTTP error — don't retry
      const text = await res.text().catch(() => "");
      endpointStates[name] = { status: "error", lastChecked: Date.now(), lastError: `HTTP ${res.status}: ${text.slice(0, 100)}` };
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}`, warm: false };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[warmup:${name}] attempt ${attempt + 1} failed: ${msg}`);

      if (attempt < maxRetries) {
        const delay = retryDelays[attempt] || 15000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      endpointStates[name] = { status: "error", lastChecked: Date.now(), lastError: msg.slice(0, 100) };
      return { ok: false, error: msg.slice(0, 200), warm: false };
    }
  }

  return { ok: false, error: "exhausted all retries", warm: false };
}

/**
 * Get the current status of all endpoints.
 * If the status is older than STATUS_TTL_MS, it's returned as "cold"
 * (the caller should re-check).
 */
export function getEndpointStatuses(): Record<EndpointName, { status: EndpointStatus; lastChecked: number; lastError: string | null }> {
  const now = Date.now();
  const result: Record<string, any> = {};
  for (const [name, state] of Object.entries(endpointStates)) {
    // If status is stale (> 30s old), mark as cold
    const isStale = now - state.lastChecked > STATUS_TTL_MS;
    result[name] = {
      status: isStale && state.status === "warm" ? "cold" : state.status,
      lastChecked: state.lastChecked,
      lastError: state.lastError,
    };
  }
  return result as any;
}

/**
 * Check if a specific endpoint is warm (or warming).
 */
export function isEndpointWarm(name: EndpointName): boolean {
  const state = endpointStates[name];
  if (!state) return false;
  const now = Date.now();
  if (now - state.lastChecked > STATUS_TTL_MS) return false;
  return state.status === "warm" || state.status === "warming";
}
