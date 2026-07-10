import { NextRequest, NextResponse } from "next/server";
import {
  scrapeHuggingFaceModel,
  scrapeCivitaiModel,
  type ScrapedLoraMetadata,
} from "@/lib/lora-scraper";
import type {
  LoraEntry,
  LoraCategory,
  LoraSource,
  EngineFamily,
} from "@/lib/lora-library";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/lora/import
 *
 * Import a LoRA by URL — auto-detects HuggingFace / Civitai / Civitai.red and
 * scrapes the appropriate source, returning a `LoraEntry`-shaped object that
 * the client can add to its local library state.
 *
 * Body: { url: string }
 *
 * Returns on success (200):
 *   { lora: LoraEntry }
 *
 * Returns on error (400/500):
 *   { error: string, details?: string }
 *
 * NOTE: This route does NOT persist anything to Prisma — it just enriches the
 * URL into a LoraEntry shape. The client is responsible for adding the result
 * to its local state (per task 4-civitai-lora-import phase 1 spec).
 */

// All valid EngineFamily values from lora-library.ts — used to safely-cast the
// string labels produced by the baseModel → family mapping.
const VALID_ENGINE_FAMILIES: ReadonlySet<string> = new Set<EngineFamily>([
  "FLUX.1",
  "FLUX.2",
  "Krea 2",
  "Z-Image",
  "Ideogram",
  "Qwen-Image",
  "Wan",
  "LTX",
  "LongCat",
  "JoyAI",
  "Sulphur",
  "Hunyuan",
  "SDXL",
]);

/**
 * Map a scraper "baseModels" array (loose strings like "FLUX", "Krea 2") to
 * the strict EngineFamily union. Drops anything that doesn't match.
 *
 * The scraper uses shorthand ("FLUX" for both FLUX.1/FLUX.2) — we expand that
 * to ["FLUX.1", "FLUX.2"] so the imported LoRA shows up under both engine
 * filters in the Library UI.
 */
function mapBaseLabelsToFamilies(baseLabels: string[] | undefined): EngineFamily[] {
  const out = new Set<EngineFamily>();
  if (!baseLabels) return [];
  for (const label of baseLabels) {
    if (label === "FLUX") {
      out.add("FLUX.1");
      out.add("FLUX.2");
    } else if (label === "Krea 2") {
      out.add("Krea 2");
    } else if (label === "Z-Image") {
      out.add("Z-Image");
    } else if (label === "Ideogram") {
      out.add("Ideogram");
    } else if (label === "Wan") {
      out.add("Wan");
    } else if (label === "LTX") {
      out.add("LTX");
    } else if (label === "LongCat") {
      out.add("LongCat");
    } else if (label === "JoyAI") {
      out.add("JoyAI");
    } else if (label === "Sulphur") {
      out.add("Sulphur");
    } else if (label === "Hunyuan") {
      out.add("Hunyuan");
    } else if (label === "SDXL") {
      out.add("SDXL");
    } else if (VALID_ENGINE_FAMILIES.has(label)) {
      out.add(label as EngineFamily);
    }
  }
  return Array.from(out);
}

/** Infer a LoraCategory from the scraped metadata's tags + model type. */
function inferCategory(meta: ScrapedLoraMetadata): LoraCategory {
  if (meta.mature) return "mature";
  const tags = (meta.tags ?? []).map((t) => t.toLowerCase());
  const modelType = (meta.modelType ?? "").toLowerCase();

  if (modelType === "controlnet" || tags.some((t) => t.includes("control") || t.includes("pose") || t.includes("depth") || t.includes("canny"))) {
    return "control";
  }
  if (tags.some((t) => t.includes("face") || t.includes("identity") || t.includes("character"))) return "face";
  if (tags.some((t) => t.includes("clothes") || t.includes("clothing") || t.includes("outfit") || t.includes("garment"))) return "garment";
  if (tags.some((t) => t.includes("light") || t.includes("lens") || t.includes("film") || t.includes("grain"))) return "light";
  if (tags.some((t) => t.includes("upscale") || t.includes("detail") || t.includes("enhance") || t.includes("sharpen"))) return "detailer";
  if (tags.some((t) => t.includes("video") || t.includes("motion") || t.includes("i2v") || t.includes("t2v"))) return "video";
  if (tags.some((t) => t.includes("ocr") || t.includes("text"))) return "ocr-tool";
  if (tags.some((t) => t.includes("anime") || t.includes("cinematic") || t.includes("style") || t.includes("realism") || t.includes("3d") || t.includes("retro"))) return "style";
  return "style"; // default fallback
}

/** Build a stable-ish ID from the source URL (deterministic per-URL). */
function buildLoraId(source: LoraSource, url: string): string {
  // Use a simple hash of the URL to keep IDs stable + URL-safe.
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  const hashHex = (hash >>> 0).toString(36);
  return `imported-${source}-${hashHex}`;
}

/**
 * Convert a ScrapedLoraMetadata into a LoraEntry suitable for display in the
 * Library UI alongside the static LORA_LIBRARY entries.
 */
function metadataToLoraEntry(meta: ScrapedLoraMetadata): LoraEntry {
  const source: LoraSource =
    meta.source === "huggingface" ? "huggingface" :
    meta.source === "civitai.red" ? "civitai" :
    meta.source === "civitai" ? "civitai" :
    "huggingface"; // fallback for "other" — treat as HF-style URL

  const engineFamilies = mapBaseLabelsToFamilies(meta.baseModels);

  // Purpose: prefer description, fall back to name + tagline, truncate
  const description = (meta.description ?? "").trim();
  const purpose = description
    ? description.slice(0, 200) + (description.length > 200 ? "…" : "")
    : `Imported from ${source === "huggingface" ? "HuggingFace" : "Civitai"}${meta.repo ? ` · ${meta.repo}` : ""}`;

  // Tags: keep as-is, capped at 12 for UI cleanliness
  const tags = (meta.tags ?? []).slice(0, 12);

  // Build a notes string with useful context (downloads, files, source)
  const notesParts: string[] = [];
  if (meta.downloads != null) notesParts.push(`${meta.downloads.toLocaleString()} downloads`);
  if (meta.likes != null) notesParts.push(`${meta.likes.toLocaleString()} favorites`);
  if (meta.safetensorsFiles && meta.safetensorsFiles.length > 0) {
    notesParts.push(`files: ${meta.safetensorsFiles.slice(0, 3).join(", ")}${meta.safetensorsFiles.length > 3 ? `, +${meta.safetensorsFiles.length - 3} more` : ""}`);
  }
  if (meta.thumbnailUrl) notesParts.push("preview image available");

  return {
    id: buildLoraId(source, meta.url),
    name: meta.name?.trim() || "Imported LoRA",
    category: inferCategory(meta),
    source,
    url: meta.url,
    engineFamilies,
    purpose,
    recommendedWeight: 0.5, // rule #5 stacking-safe default
    tags,
    mature: meta.mature ?? false,
    license: "verify", // user must verify the license themselves
    isControl: (meta.modelType ?? "").toLowerCase() === "controlnet",
    notes: notesParts.length > 0 ? notesParts.join(" · ") : undefined,
  };
}

interface ImportRequestBody {
  url?: unknown;
}

export async function POST(req: NextRequest) {
  let body: ImportRequestBody;
  try {
    body = (await req.json()) as ImportRequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body — expected { url: string }" },
      { status: 400 },
    );
  }

  const rawUrl = body.url;
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid `url` field — expected a non-empty string" },
      { status: 400 },
    );
  }

  const url = rawUrl.trim();

  // Basic URL validation
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) {
      return NextResponse.json(
        { error: "URL must use http(s) protocol" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid URL — could not parse" },
      { status: 400 },
    );
  }

  // Detect source + dispatch to the right scraper
  let meta: ScrapedLoraMetadata;
  try {
    if (url.includes("huggingface.co/")) {
      const match = url.match(/huggingface\.co\/([^/]+\/[^/?#]+)/);
      if (!match) {
        return NextResponse.json(
          { error: "Could not extract HuggingFace repo ID — expected format: huggingface.co/{owner}/{repo}" },
          { status: 400 },
        );
      }
      meta = await scrapeHuggingFaceModel(match[1]);
    } else if (
      url.includes("civitai.red/models/") ||
      url.includes("civitai.com/models/") ||
      url.includes("civitai.red/") ||
      url.includes("civitai.com/")
    ) {
      meta = await scrapeCivitaiModel(url);
    } else {
      return NextResponse.json(
        {
          error:
            "Unsupported URL — must be a HuggingFace (huggingface.co/{owner}/{repo}) or Civitai (civitai.com/models/{id} or civitai.red/models/{id}) URL",
        },
        { status: 400 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Scrape failed", details: msg },
      { status: 502 },
    );
  }

  if (meta.error) {
    return NextResponse.json(
      { error: `Scrape failed: ${meta.error}`, source: meta.source, url: meta.url },
      { status: 502 },
    );
  }

  // Map to LoraEntry shape
  const lora = metadataToLoraEntry(meta);

  return NextResponse.json({
    lora,
    // Pass through a few extra metadata fields the UI might want to show
    meta: {
      source: meta.source,
      downloads: meta.downloads,
      likes: meta.likes,
      thumbnailUrl: meta.thumbnailUrl,
      safetensorsFiles: meta.safetensorsFiles,
    },
  });
}
