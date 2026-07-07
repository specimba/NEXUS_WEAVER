import { NextResponse } from "next/server";
import {
  getCachedModalHealth,
  checkBrainHealth,
  isModalEnabled,
  getModalBaseUrl,
  isBrainEndpointConfigured,
} from "@/lib/modal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/modal/status
 *
 * Returns the status of BOTH the FLUX.2 container AND the AEON brain endpoint.
 * Uses a 60-second server-side cache for FLUX.2 health (getCachedModalHealth).
 * Brain health is checked on each call (lightweight GET /v1/models, <1s when warm).
 *
 * The client may pass ?force=1 to bypass the cache.
 */
export async function GET(req: Request) {
  const enabled = isModalEnabled();
  const baseUrl = getModalBaseUrl();
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  // Check FLUX.2 (cached) + brain (live, lightweight) in parallel
  const [health, brainHealth] = await Promise.all([
    getCachedModalHealth(force),
    isBrainEndpointConfigured() ? checkBrainHealth() : Promise.resolve(null),
  ]);

  return NextResponse.json({
    enabled,
    baseUrl,
    // FLUX.2 status (cached)
    reachable: health.ok,
    status: health.status,
    model: health.model ?? null,
    gpu: health.gpu ?? null,
    latencyMs: health.latencyMs,
    error: health.error ?? null,
    cached: health.cached ?? false,
    cachedAgeSec: health.cachedAgeSec ?? null,
    // AEON brain status (live)
    brain: isBrainEndpointConfigured()
      ? {
          reachable: brainHealth?.ok ?? false,
          status: brainHealth?.status ?? "unknown",
          latencyMs: brainHealth?.latencyMs ?? null,
          error: brainHealth?.error ?? null,
        }
      : null,
    coldStartBudgetSec: Number(process.env.MODAL_COLD_START_TIMEOUT || 240),
    warmTimeoutSec: Number(process.env.MODAL_WARM_TIMEOUT || 60),
    timestamp: new Date().toISOString(),
  });
}
