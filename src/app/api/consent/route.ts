import { NextRequest, NextResponse } from "next/server";
import { recordConsent, getConsent, MATURE_ACK_TEXT, POLICY_VERSION } from "@/lib/policy";
import type { MaturityTier } from "@/lib/policy";

export const runtime = "nodejs";

// POST /api/consent
// body: { fingerprint: string, action: "check" | "accept" | "reject" | "revoke" }
// Records the user's 18+ consent decision. "check" returns the existing record
// (or {status:"pending"}) without modifying anything.
export async function POST(req: NextRequest) {
  let body: { fingerprint?: unknown; action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fingerprint =
    typeof body.fingerprint === "string" && body.fingerprint.length > 0
      ? body.fingerprint.slice(0, 128)
      : null;
  if (!fingerprint) {
    return NextResponse.json({ error: "fingerprint is required" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "check";

  // "check" — read-only lookup
  if (action === "check") {
    const existing = await getConsent(fingerprint);
    if (!existing) {
      return NextResponse.json({ status: "pending", tier: "safe", policyVersion: POLICY_VERSION });
    }
    return NextResponse.json({
      status: existing.status,
      tier: existing.tier,
      policyVersion: existing.policyVersion,
      acceptedAt: existing.acceptedAt,
    });
  }

  if (action !== "accept" && action !== "reject" && action !== "revoke") {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  // accept → tier "mature" is NOT auto-granted; consent merely records the 18+
  // declaration. Mature generation requires the policy.matureEnabled toggle too.
  const tier: MaturityTier = "safe";
  const status = action === "accept" ? "accepted" : action === "reject" ? "rejected" : "revoked";

  const userAgent = req.headers.get("user-agent") ?? undefined;
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ipHash = fwd ? `iph_${Buffer.from(fwd).toString("base64").slice(0, 16)}` : undefined;

  const rec = await recordConsent({
    fingerprint,
    status: status as "accepted" | "rejected" | "revoked",
    tier,
    userAgent,
    ipHash,
  });

  return NextResponse.json({
    status: rec.status,
    tier: rec.tier,
    policyVersion: rec.policyVersion,
    acceptedAt: rec.acceptedAt,
    ackText: MATURE_ACK_TEXT,
  });
}
