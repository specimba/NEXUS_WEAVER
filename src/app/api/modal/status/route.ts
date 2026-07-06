import { NextResponse } from "next/server";
import {
  getCachedModalHealth,
  isModalEnabled,
  getModalBaseUrl,
} from "@/lib/modal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/modal/status
 *
 * Returns the status of the Modal backend. Uses a 60-second server-side cache
 * (getCachedModalHealth) so that the 8 dashboard polling loops collapse into
 * ~1 actual Modal request per minute — the #1 cost optimization.
 *
 * The client may pass ?force=1 to bypass the cache (used by the Monitor's
 * manual "refresh" button only).
 */
export async function GET(req: Request) {
  const enabled = isModalEnabled();
  const baseUrl = getModalBaseUrl();
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const health = await getCachedModalHealth(force);

  return NextResponse.json({
    enabled,
    baseUrl,
    reachable: health.ok,
    status: health.status,
    model: health.model ?? null,
    gpu: health.gpu ?? null,
    latencyMs: health.latencyMs,
    error: health.error ?? null,
    cached: health.cached ?? false,
    cachedAgeSec: health.cachedAgeSec ?? null,
    coldStartBudgetSec: Number(process.env.MODAL_COLD_START_TIMEOUT || 240),
    warmTimeoutSec: Number(process.env.MODAL_WARM_TIMEOUT || 60),
    timestamp: new Date().toISOString(),
  });
}
