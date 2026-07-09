import { NextRequest, NextResponse } from "next/server";
import { preWarmAllEndpoints, getEndpointStatuses, pingEndpoint, type EndpointName } from "@/lib/endpoint-warmup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/modal/warm-endpoints
 * Returns the current status of all 3 managed endpoints.
 *
 * POST /api/modal/warm-endpoints
 * Triggers pre-warm of all endpoints (fire-and-forget).
 * Body: { action: "warm" | "status" | "ping", endpoint?: "st3gg"|"judge"|"creative" }
 */
export async function GET() {
  return NextResponse.json({
    endpoints: getEndpointStatuses(),
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  let body: { action?: string; endpoint?: string };
  try {
    body = await req.json();
  } catch {
    body = { action: "warm" };
  }

  const action = body.action || "warm";

  if (action === "status") {
    return NextResponse.json({
      endpoints: getEndpointStatuses(),
      timestamp: new Date().toISOString(),
    });
  }

  if (action === "ping" && body.endpoint) {
    const name = body.endpoint as EndpointName;
    const warm = await pingEndpoint(name);
    return NextResponse.json({
      endpoint: name,
      warm,
      statuses: getEndpointStatuses(),
    });
  }

  // Default: warm all endpoints
  await preWarmAllEndpoints();
  return NextResponse.json({
    message: "Pre-warm triggered for all endpoints",
    endpoints: getEndpointStatuses(),
    timestamp: new Date().toISOString(),
  });
}
