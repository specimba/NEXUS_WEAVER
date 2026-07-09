import { NextRequest, NextResponse } from "next/server";
import {
  getEngineStatuses,
  deployEngine,
  stopEngine,
  ensureEngineDeployed,
  ENGINE_APPS,
} from "@/lib/engine-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // deploy can take up to 2 min

/**
 * GET /api/modal/engine-manager
 * Returns the deploy status of all engines.
 */
export async function GET() {
  try {
    const statuses = await getEngineStatuses();
    return NextResponse.json({
      engines: statuses,
      engines_config: ENGINE_APPS.map((a) => ({
        engineId: a.engineId,
        appName: a.appName,
        gpu: a.gpu,
        alwaysOn: a.alwaysOn,
        family: a.family,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get engine statuses" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/modal/engine-manager
 * Body: { action: "deploy" | "stop" | "ensure", engineId: string }
 *
 * - deploy: deploy the Modal app for this engine
 * - stop: stop the Modal app (H100 engines only)
 * - ensure: check if deployed, deploy if not (auto-deploy on select)
 */
export async function POST(req: NextRequest) {
  let body: { action?: string; engineId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, engineId } = body;
  if (!action || !engineId) {
    return NextResponse.json(
      { error: "action and engineId are required" },
      { status: 400 }
    );
  }

  try {
    switch (action) {
      case "deploy": {
        const result = await deployEngine(engineId);
        return NextResponse.json(result);
      }
      case "stop": {
        const result = await stopEngine(engineId);
        return NextResponse.json(result);
      }
      case "ensure": {
        const result = await ensureEngineDeployed(engineId);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use deploy, stop, or ensure.` },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Engine operation failed",
      },
      { status: 500 }
    );
  }
}
