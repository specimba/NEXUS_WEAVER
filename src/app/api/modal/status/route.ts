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
 * Returns the status of BOTH the FLUX.2 container AND the brain endpoint.
 * Both are cached server-side with a 5-minute TTL to avoid cold-starting GPU
 * containers on every dashboard poll (6 views call this route). The client may
 * pass ?force=1 to bypass both caches. (Cost audit 2-a, fix C-b-3.)
 */

// Brain health cache (5min TTL) — mirrors the FLUX.2 health cache pattern in
// modal-client.ts. Without this, every /api/modal/status call triggers a live
// ping to the brain managed endpoint, which can cold-start a GPU container.
let _brainHealthCache: { data: Awaited<ReturnType<typeof checkBrainHealth>>; fetchedAt: number } | null = null;
const BRAIN_HEALTH_TTL_MS = 300_000;

async function getCachedBrainHealth(force: boolean) {
  if (!force && _brainHealthCache && Date.now() - _brainHealthCache.fetchedAt < BRAIN_HEALTH_TTL_MS) {
    return _brainHealthCache.data;
  }
  const data = await checkBrainHealth();
  _brainHealthCache = { data, fetchedAt: Date.now() };
  return data;
}

export async function GET(req: Request) {
  const enabled = isModalEnabled();
  const baseUrl = getModalBaseUrl();
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  // Check FLUX.2 (cached) + brain (cached) in parallel — both respect ?force=1
  const [health, brainHealth] = await Promise.all([
    getCachedModalHealth(force),
    isBrainEndpointConfigured()
      ? getCachedBrainHealth(force)
      : Promise.resolve(null),
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
