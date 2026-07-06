import { NextResponse } from "next/server";
import { BRAIN_MODELS, DEFAULT_BRAIN_ID } from "@/lib/brain";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    models: BRAIN_MODELS,
    defaultId: DEFAULT_BRAIN_ID,
  });
}
