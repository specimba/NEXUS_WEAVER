import { NextRequest, NextResponse } from "next/server";
import { getActivePolicy, saveActivePolicy, LEGAL_DISCLAIMER, EU_COMPLIANCE_NOTES, HARD_BLOCKLIST, POLICY_CATEGORIES, POLICY_VERSION } from "@/lib/policy";

export const runtime = "nodejs";

// GET /api/policy → returns the active safety/legal policy + reference data
export async function GET() {
  const policy = await getActivePolicy();
  return NextResponse.json({
    ...policy,
    disclaimer: LEGAL_DISCLAIMER,
    euNotes: EU_COMPLIANCE_NOTES,
    hardBlocklist: HARD_BLOCKLIST,
    categories: POLICY_CATEGORIES,
    policyVersion: POLICY_VERSION,
  });
}

// PUT /api/policy → update the active policy (mature toggle, block/flag lists, etc.)
export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.matureEnabled === "boolean") patch.matureEnabled = body.matureEnabled;
  if (Array.isArray(body.blockCategories)) patch.blockCategories = body.blockCategories.filter((x): x is string => typeof x === "string");
  if (Array.isArray(body.flagCategories)) patch.flagCategories = body.flagCategories.filter((x): x is string => typeof x === "string");
  if (typeof body.minSafetyScore === "number") patch.minSafetyScore = Math.max(0, Math.min(100, body.minSafetyScore));
  if (typeof body.policyMode === "string" && ["conservative", "permissive", "strict"].includes(body.policyMode)) patch.policyMode = body.policyMode;
  if (typeof body.jurisdiction === "string") patch.jurisdiction = body.jurisdiction.slice(0, 16);
  if (typeof body.disclaimerOverride === "string") patch.disclaimerOverride = body.disclaimerOverride.slice(0, 4000);

  const updated = await saveActivePolicy(patch);
  return NextResponse.json({
    ...updated,
    disclaimer: LEGAL_DISCLAIMER,
    policyVersion: POLICY_VERSION,
  });
}
