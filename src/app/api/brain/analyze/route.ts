import { NextRequest, NextResponse } from "next/server";
import { brainDeepAnalysis, localCompatibilityChecks } from "@/lib/brain-assistant";
import type { ResolvedCalibration } from "@/lib/calibration";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/brain/analyze
// body: { engineId, loraIds, loraWeights, calibration, prompt, style, deep? }
// Returns brain suggestions (local + optional AI deep analysis).
export async function POST(req: NextRequest) {
  let body: {
    engineId?: unknown;
    loraIds?: unknown;
    loraWeights?: unknown;
    calibration?: unknown;
    prompt?: unknown;
    style?: unknown;
    deep?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const engineId = typeof body.engineId === "string" ? body.engineId : "";
  const loraIds = Array.isArray(body.loraIds) ? body.loraIds.filter((x): x is string => typeof x === "string") : [];
  const loraWeights = body.loraWeights && typeof body.loraWeights === "object" ? body.loraWeights as Record<string, number> : {};
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const style = typeof body.style === "string" ? body.style : "cinematic";
  const deep = body.deep !== false; // default: run deep analysis

  if (!engineId) {
    return NextResponse.json({ error: "engineId is required" }, { status: 400 });
  }

  const calibration = body.calibration as ResolvedCalibration | null;

  if (deep) {
    const analysis = await brainDeepAnalysis({
      engineId,
      loraIds,
      loraWeights,
      calibration,
      prompt,
      style,
    });
    return NextResponse.json(analysis);
  }

  // Local-only (instant)
  const suggestions = localCompatibilityChecks({ engineId, loraIds, loraWeights, calibration, prompt });
  return NextResponse.json({
    suggestions,
    summary: "Local compatibility check.",
    confidence: 0.5,
    ms: 0,
  });
}
