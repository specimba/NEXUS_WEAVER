import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { GenerationListItem } from "@/lib/nexus-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "24", 10) || 24, 100);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);

  const rows = await db.generation.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
    select: {
      id: true,
      prompt: true,
      style: true,
      aspect: true,
      wardrobe: true,
      status: true,
      verdict: true,
      overallScore: true,
      imagePath: true,
      createdAt: true,
    },
  });

  const total = await db.generation.count();

  const items: GenerationListItem[] = rows.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    style: r.style,
    aspect: r.aspect,
    wardrobe: r.wardrobe,
    status: r.status,
    verdict: r.verdict,
    overallScore: r.overallScore,
    imagePath: r.imagePath,
    createdAt: r.createdAt.toISOString(),
  }));

  return NextResponse.json({ items, total, limit, offset });
}
