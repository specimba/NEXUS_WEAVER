import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// GET /api/image/[id] — serves the generated image from the DB (base64) or
// from disk (fallback). The sandbox filesystem is ephemeral, so the DB is
// the primary source of truth for image data.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const gen = await db.generation.findUnique({
    where: { id },
    select: { imageData: true, imagePath: true },
  });

  if (!gen) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Primary: serve from DB (base64)
  if (gen.imageData) {
    const buf = Buffer.from(gen.imageData, "base64");
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
        "Content-Length": String(buf.length),
      },
    });
  }

  // Fallback: try disk (for old generations before imageData was added)
  if (gen.imagePath) {
    const abs = path.join(process.cwd(), "public", gen.imagePath);
    if (fs.existsSync(abs)) {
      const buf = fs.readFileSync(abs);
      return new NextResponse(buf, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=86400",
          "Content-Length": String(buf.length),
        },
      });
    }
  }

  return new NextResponse("Image not found", { status: 404 });
}
