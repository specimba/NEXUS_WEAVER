import { NextResponse } from "next/server";
import { computeMetrics } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const metrics = await computeMetrics();
  return NextResponse.json(metrics);
}
