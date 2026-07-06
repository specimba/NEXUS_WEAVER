import { NextResponse } from "next/server";
import { CALIBRATION_PRESETS, DEFAULT_CALIBRATION_ID } from "@/lib/calibration";

export const runtime = "nodejs";

// GET /api/calibration → returns the FLUX.1 calibration presets
export async function GET() {
  return NextResponse.json({
    presets: CALIBRATION_PRESETS,
    defaultId: DEFAULT_CALIBRATION_ID,
  });
}
