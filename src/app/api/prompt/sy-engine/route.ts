import { NextRequest, NextResponse } from "next/server";
import { STABLE_YOGI_API_KEY } from "@/lib/secrets";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * POST /api/prompt/sy-engine
 *
 * Stable Yogi Prompt Engine — curated, tested prompts designed specifically
 * for Pony/SDXL/Illustrious checkpoints. These prompts are Danbooru tag format
 * (1girl, olive skin, aqua hair, etc.) which is what Pony V6 was trained on.
 *
 * Body:  { subjects?: string, count?: number }
 *   subjects: "Solo Female" | "Solo Male" (Free plan). Pro adds Couples, etc.
 *   count: 1-10 (default 1)
 * Returns: { prompts: string[], rating: string, remaining: number, quota: object }
 *
 * The result is shown in an EDITABLE textarea (NO8D "auto off" pattern) before
 * the user sends it to the Studio. The AI never writes directly to the prompt.
 */
export async function POST(req: NextRequest) {
  let body: { subjects?: string; count?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!STABLE_YOGI_API_KEY) {
    return NextResponse.json(
      { error: "STABLE_YOGI_API_KEY not configured. Get a free key at stableyogi.com → Settings → API." },
      { status: 503 }
    );
  }

  const subjects = body.subjects || "Solo Female";
  const count = Math.min(body.count || 1, 10);

  try {
    const params = new URLSearchParams({
      subjects,
      count: String(count),
    });
    const res = await fetch(
      `https://stableyogi.com/api/prompt-engine/prompt?${params}`,
      {
        headers: { "X-API-Key": STABLE_YOGI_API_KEY },
        signal: AbortSignal.timeout(12_000),
      }
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Stable Yogi API returned HTTP ${res.status}: ${text.slice(0, 200)}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as {
      prompts?: string[];
      rating?: string;
      remaining?: number;
      quota?: { hourly?: { limit: number; remaining: number; resetsInSec: number }; daily?: { limit: number; remaining: number; resetsInSec: number } };
    };

    return NextResponse.json({
      prompts: data.prompts || [],
      rating: data.rating || "sfw",
      remaining: data.remaining ?? 0,
      quota: data.quota,
      subjects,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Stable Yogi Prompt Engine request failed: ${msg.slice(0, 200)}` },
      { status: 502 }
    );
  }
}
