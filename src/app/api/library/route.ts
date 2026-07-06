import { NextResponse } from "next/server";
import { LORA_LIBRARY, LORA_CATEGORIES, visibleLoras, countMature } from "@/lib/lora-library";
import { getActivePolicy } from "@/lib/policy";

export const runtime = "nodejs";

// GET /api/library → returns the curated LoRA library, gated by the active policy.
// Mature entries are only included when policy.matureEnabled is true.
//?mature=1 forces inclusion (used only after consent is verified client-side).
export async function GET(req: Request) {
  const policy = await getActivePolicy();
  const url = new URL(req.url);
  const forceMature = url.searchParams.get("mature") === "1";
  const matureUnlocked = policy.matureEnabled || forceMature;
  const entries = visibleLoras(matureUnlocked);
  return NextResponse.json({
    categories: LORA_CATEGORIES,
    entries,
    total: LORA_LIBRARY.length,
    visible: entries.length,
    matureCount: countMature(),
    matureUnlocked,
  });
}
