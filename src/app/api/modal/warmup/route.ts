import { NextResponse } from "next/server";
import { checkModalHealth, isModalEnabled, getModalBaseUrl } from "@/lib/modal-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // cold starts can take minutes

/**
 * POST /api/modal/warmup
 *
 * Pre-emptively pings the Modal `/health` endpoint to spin up a container
 * before the user triggers a real generation. This is the recommended
 * pattern for dealing with Modal cold-start latency (1–7 min for FLUX
 * weight load after idle scale-down).
 *
 * Returns the health probe result so the UI can show live status.
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

  const health = await checkModalHealth();

  return NextResponse.json({
    warmed: health.ok,
    enabled: true,
    baseUrl: getModalBaseUrl(),
    reachable: health.ok,
    status: health.status,
    model: health.model ?? null,
    gpu: health.gpu ?? null,
    latencyMs: health.latencyMs,
    error: health.error ?? null,
    message: health.ok
      ? `Modal container warm (${health.latencyMs}ms). Ready for generation.`
      : `Modal probe ${health.status}: ${health.error ?? "container still cold-starting"}`,
  });
}
