import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/metrics-history?hours=6
 *
 * Returns persisted MetricSample rows for the requested time window.
 * Used by the Monitor view's historical sparkline (replaces the
 * client-only in-memory sparkline that reset on page reload).
 *
 * Default window: 6 hours (matches the MetricSample retention cap).
 * Max window: 24 hours.
 *
 * Note: if the dev server hasn't been restarted since the MetricSample
 * model was added to the Prisma schema, `db.metricSample` may be
 * undefined (stale singleton). We handle that gracefully by returning
 * an empty array so the UI shows "no data" instead of a 500.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const hours = Math.min(Number(url.searchParams.get("hours") || "6"), 24);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Gracefully handle the case where the Prisma client hasn't been
    // regenerated/reloaded yet (dev server needs a restart after schema changes).
    if (!db.metricSample) {
      return NextResponse.json({
        hours,
        count: 0,
        samples: [],
        note: "MetricSample model not yet available — restart the dev server after running `bun run db:push`.",
      });
    }

    const samples = await db.metricSample.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: {
        cpuPercent: true,
        rssMB: true,
        heapUsedMB: true,
        heapTotalMB: true,
        load1m: true,
        dbSizeMB: true,
        galleryImgs: true,
        generations: true,
        auditEvents: true,
        uptimeSec: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      hours,
      count: samples.length,
      samples: samples.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), samples: [], count: 0 },
      { status: 500 }
    );
  }
}
