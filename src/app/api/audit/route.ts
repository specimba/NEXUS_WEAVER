import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "40", 10) || 40, 200);
  const rows = await db.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      message: r.message,
      severity: r.severity,
      generationId: r.generationId,
      meta: r.meta,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
