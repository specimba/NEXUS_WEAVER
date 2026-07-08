import { NextRequest, NextResponse } from "next/server";
import { aeonGenerationAdvice } from "@/lib/aeon/client";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/aeon/advice
 *
 * Pre-generation AEON advice. Analyzes prompt + LoRA stack + params and
 * proposes concrete changes. Advisory only, never blocks.
 *
 * Body: { prompt, loraStack, engine, params }
 * Returns: { advice: AEONGenerationAdvice, meta: AEONCallMeta }
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userContext = JSON.stringify(body, null, 2);
  const result = await aeonGenerationAdvice(userContext);

  return NextResponse.json(result);
}
