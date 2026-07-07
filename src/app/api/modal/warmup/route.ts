import { NextResponse } from "next/server";
import {
  checkModalHealth,
  checkBrainHealth,
  isModalEnabled,
  getModalBaseUrl,
  isBrainEndpointConfigured,
} from "@/lib/modal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // cold starts can take minutes

/**
 * POST /api/modal/warmup
 *
 * Warms BOTH the FLUX.2 image generation container AND the AEON brain endpoint
 * simultaneously. This is the "warm both together" architecture — when the
 * user clicks "Warm up", both containers start cold-loading in parallel.
 *
 * The FLUX.2 container (L40S, ~29GB model) takes ~20-40s to load.
 * The brain endpoint (B200, ~54GB model) takes ~60-120s to load.
 *
 * By pinging both in parallel, the total warm-up time is max(flux, brain) ≈ 120s,
 * not flux + brain ≈ 160s.
 *
 * Returns combined status so the UI can show which services are ready.
 */
export async function POST() {
  if (!isModalEnabled()) {
    return NextResponse.json(
      {
        warmed: false,
        enabled: false,
        message: "Modal routing is disabled (MODAL_USE != true). Nothing to warm up.",
      },
      { status: 200 }
    );
  }

  // Warm BOTH simultaneously using Promise.allSettled — neither blocks the other.
  const [fluxResult, brainResult] = await Promise.allSettled([
    checkModalHealth(),
    isBrainEndpointConfigured() ? checkBrainHealth() : Promise.resolve(null),
  ]);

  const fluxHealth = fluxResult.status === "fulfilled" ? fluxResult.value : null;
  const brainHealth = brainResult.status === "fulfilled" ? brainResult.value : null;

  const fluxOk = fluxHealth?.ok ?? false;
  const brainOk = brainHealth?.ok ?? false;
  const brainConfigured = isBrainEndpointConfigured();

  // "warmed" is true only if FLUX.2 is warm (the critical path).
  // Brain is optional — the pipeline falls through to z-ai if brain is cold.
  const warmed = fluxOk;

  return NextResponse.json({
    warmed,
    enabled: true,
    baseUrl: getModalBaseUrl(),
    // FLUX.2 status
    flux: {
      reachable: fluxOk,
      status: fluxHealth?.status ?? "unknown",
      model: fluxHealth?.model ?? null,
      gpu: fluxHealth?.gpu ?? null,
      latencyMs: fluxHealth?.latencyMs ?? null,
      error: fluxHealth?.error ?? null,
    },
    // AEON brain status
    brain: brainConfigured
      ? {
          reachable: brainOk,
          status: brainHealth?.status ?? "unknown",
          latencyMs: brainHealth?.latencyMs ?? null,
          error: brainHealth?.error ?? null,
        }
      : null,
    // Combined status for the UI
    reachable: fluxOk,
    status: fluxHealth?.status ?? "unknown",
    model: fluxHealth?.model ?? null,
    gpu: fluxHealth?.gpu ?? null,
    latencyMs: fluxHealth?.latencyMs ?? null,
    error: fluxHealth?.error ?? null,
    message: fluxOk
      ? brainOk
        ? `FLUX.2 + AEON brain both warm (flux ${fluxHealth?.latencyMs}ms, brain ${brainHealth?.latencyMs}ms). Ready for generation.`
        : `FLUX.2 warm (${fluxHealth?.latencyMs}ms). Brain still cold-starting — will fall through to z-ai.`
      : `FLUX.2 ${fluxHealth?.status}: ${fluxHealth?.error ?? "cold-starting"}. Brain: ${brainOk ? "warm" : brainConfigured ? "cold-starting" : "not configured"}.`,
  });
}
