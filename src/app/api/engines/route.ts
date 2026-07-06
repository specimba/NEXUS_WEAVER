import { NextResponse } from "next/server";
import { ENGINES, DEFAULT_IMAGE_ENGINE_ID, DEFAULT_EDIT_ENGINE_ID, DEFAULT_VIDEO_ENGINE_ID } from "@/lib/engines";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    engines: ENGINES,
    defaultImageEngineId: DEFAULT_IMAGE_ENGINE_ID,
    defaultEditEngineId: DEFAULT_EDIT_ENGINE_ID,
    defaultVideoEngineId: DEFAULT_VIDEO_ENGINE_ID,
  });
}
