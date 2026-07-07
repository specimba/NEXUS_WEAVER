import { NextRequest, NextResponse } from "next/server";
import { batchScrapeLoraMetadata, scrapeHuggingFaceModel, scrapeCivitaiModel } from "@/lib/lora-scraper";

export const runtime = "nodejs";
export const maxDuration = 300; // batch scraping can take a while
export const dynamic = "force-dynamic";

/**
 * POST /api/lora/scrape
 *
 * Scrape LoRA metadata from HuggingFace and Civitai URLs.
 *
 * Body:
 *   { urls: string[] } — array of URLs to scrape
 *   { url: string } — single URL to scrape
 *
 * Returns:
 *   { results: ScrapedLoraMetadata[] } — enriched metadata for each URL
 *
 * HuggingFace URLs use the free HF API (structured JSON, fast).
 * Civitai/Civitai.red URLs use Browserless (headless browser, handles NSFW).
 */
export async function POST(req: NextRequest) {
  let body: { urls?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let urls: string[] = [];
  if (Array.isArray(body.urls)) {
    urls = body.urls.filter((x): x is string => typeof x === "string");
  } else if (typeof body.url === "string") {
    urls = [body.url];
  }

  if (urls.length === 0) {
    return NextResponse.json({ error: "urls or url is required" }, { status: 400 });
  }

  if (urls.length === 1) {
    // Single URL — scrape directly
    const url = urls[0];
    let result;
    if (url.includes("huggingface.co/")) {
      const match = url.match(/huggingface\.co\/([^/]+\/[^/?#]+)/);
      if (match) {
        result = await scrapeHuggingFaceModel(match[1]);
      } else {
        result = { source: "huggingface", url, error: "Could not extract repo ID" };
      }
    } else if (url.includes("civitai.red/models/") || url.includes("civitai.com/models/")) {
      result = await scrapeCivitaiModel(url);
    } else {
      result = { source: "other", url, error: "Unknown URL type" };
    }
    return NextResponse.json({ result });
  }

  // Batch scrape — process in parallel with concurrency limit
  const results = await batchScrapeLoraMetadata(urls, 5);

  return NextResponse.json({
    results,
    total: results.length,
    successful: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).length,
  });
}
