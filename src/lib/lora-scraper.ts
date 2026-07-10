/**
 * LoRA Metadata Scraper — enriches the LoRA library with data from HF + Civitai.
 *
 * ARCHITECTURE:
 * - HuggingFace models: uses the free HF API (https://huggingface.co/api/models/{repo})
 *   Returns structured JSON: tags, downloads, likes, siblings (file list), pipeline_tag.
 * - Civitai (civitai.com): uses the FREE public REST API
 *   (https://civitai.com/api/v1/models/{id}) — no auth required for public models.
 *   Returns structured JSON: name, description, type, baseModel, trainedWords, tags,
 *   stats (download/favorite/rating counts), nsfw flag, preview images.
 * - Civitai.red (NSFW mirror): JS-rendered, no public REST API. Uses Browserless
 *   /scrape endpoint (POST with {url, elements:[{selector}]}) to extract og: meta
 *   tags from the rendered HTML.
 *
 * ROUTING (scrapeCivitaiModel):
 *   - civitai.red URL  → scrapeCivitaiRedModel (Browserless /scrape only)
 *   - civitai.com URL  → scrapeCivitaiByRest (extract model ID, call REST API)
 *
 * BROWSERLESS TOKEN: stored in src/lib/secrets.ts (reads from process.env).
 *
 * This is a backend-only service — called from /api/lora/scrape and
 * /api/lora/import routes.
 */

import { BROWSERLESS_TOKEN } from "@/lib/secrets";

const BROWSERLESS_BASE = "https://production-sfo.browserless.io";

export interface ScrapedLoraMetadata {
  source: "huggingface" | "civitai" | "civitai.red" | "other";
  url: string;
  repo?: string; // HF repo ID (owner/repo)
  name?: string;
  description?: string;
  thumbnailUrl?: string;
  tags?: string[];
  downloads?: number;
  likes?: number;
  pipelineTag?: string;
  // List of .safetensors files in the repo (HF only — Civitai doesn't expose this)
  safetensorsFiles?: string[];
  // Whether this is a LoRA, checkpoint, or other model type
  modelType?: string;
  // Whether the model is NSFW/mature
  mature?: boolean;
  // Base model compatibility (extracted from tags or description)
  baseModels?: string[];
  // Raw error if scraping failed
  error?: string;
}

/**
 * Check if Browserless is configured (token available).
 */
export function isBrowserlessConfigured(): boolean {
  return BROWSERLESS_TOKEN.length > 0;
}

/**
 * Scrape a HuggingFace model page using the free HF API.
 * Returns structured metadata including file list (.safetensors files).
 * Rate limit: ~100 requests/minute (no auth), higher with HF token.
 */
export async function scrapeHuggingFaceModel(
  repo: string
): Promise<ScrapedLoraMetadata> {
  const url = `https://huggingface.co/api/models/${repo}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { source: "huggingface", url: `https://huggingface.co/${repo}`, repo, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      id: string;
      tags: string[];
      downloads: number;
      likes: number;
      pipeline_tag: string;
      siblings: Array<{ rfilename: string }>;
    };

    // Extract .safetensors files
    const safetensorsFiles = (data.siblings || [])
      .map((s) => s.rfilename)
      .filter((f) => f.endsWith(".safetensors"));

    // Determine model type from tags
    const tags = data.tags || [];
    const modelType = tags.includes("lora") ? "lora" :
                      tags.includes("checkpoint") ? "checkpoint" :
                      tags.includes("controlnet") ? "controlnet" :
                      data.pipeline_tag === "image-to-image" ? "lora" : "other";

    // Determine base model compatibility from tags
    const baseModels: string[] = [];
    if (tags.some((t) => t.includes("flux"))) baseModels.push("FLUX");
    if (tags.some((t) => t.includes("krea"))) baseModels.push("Krea 2");
    if (tags.some((t) => t.includes("sdxl"))) baseModels.push("SDXL");
    if (tags.some((t) => t.includes("ideogram"))) baseModels.push("Ideogram");
    if (tags.some((t) => t.includes("wan"))) baseModels.push("Wan");

    // Check for NSFW indicators in tags
    const mature = tags.some((t) =>
      t.includes("nsfw") || t.includes("adult") || t.includes("mature")
    );

    return {
      source: "huggingface",
      url: `https://huggingface.co/${repo}`,
      repo,
      name: repo,
      tags,
      downloads: data.downloads,
      likes: data.likes,
      pipelineTag: data.pipeline_tag,
      safetensorsFiles,
      modelType,
      mature,
      baseModels,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source: "huggingface", url: `https://huggingface.co/${repo}`, repo, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Civitai REST API — FREE public endpoint (no auth for public models)
// Docs: https://github.com/civitai/civitai/wiki/REST-API-Howto
//
// GET https://civitai.com/api/v1/models/{modelId}
// Returns: { id, name, description, type, baseModel, modelVersions[], tags[],
//            stats, nsfw, images[] }
//   - modelVersions[0].baseModel is the authoritative base model string
//     (e.g. "Flux.1", "Flux.2", "SDXL 1.0", "Krea 2", "Z-Image")
//   - modelVersions[0].trainedWords[] are trigger words to inject in prompts
//   - modelVersions[0].images[0].url is the primary preview image
//   - stats: { downloadCount, favoriteCount, commentCount, rating, ratingCount }
// ---------------------------------------------------------------------------

interface CivitaiModelResponse {
  id: number;
  name: string;
  description?: string;
  type?: string; // "LORA", "Checkpoint", "Controlnet", "TextualInversion", "VAE", "AestheticGradient"
  nsfw?: boolean;
  tags?: string[];
  stats?: {
    downloadCount?: number;
    favoriteCount?: number;
    commentCount?: number;
    rating?: number;
    ratingCount?: number;
  };
  modelVersions?: Array<{
    baseModel?: string; // e.g. "Flux.1", "Flux.2", "SDXL 1.0", "Krea 2", "Z-Image"
    trainedWords?: string[];
    images?: Array<{ url?: string; nsfw?: string }>;
    files?: Array<{ name?: string }>;
  }>;
  images?: Array<{ url?: string }>;
}

/** Map a Civitai baseModel string → our internal EngineFamily-ish label. */
function mapCivitaiBaseModel(baseModel?: string): string[] {
  if (!baseModel) return [];
  const bm = baseModel.toLowerCase();
  const out: string[] = [];
  if (bm.includes("flux") || bm.includes("klein")) out.push("FLUX");
  if (bm.includes("krea")) out.push("Krea 2");
  if (bm.includes("z-image") || bm.includes("zimage") || bm.includes("zit")) out.push("Z-Image");
  if (bm.includes("ideogram")) out.push("Ideogram");
  if (bm.includes("sdxl") || bm.includes("sd 1.") || bm.includes("sd1.")) out.push("SDXL");
  if (bm.includes("wan")) out.push("Wan");
  if (bm.includes("ltx")) out.push("LTX");
  if (bm.includes("hunyuan")) out.push("Hunyuan");
  if (bm.includes("longcat")) out.push("LongCat");
  if (bm.includes("joyai")) out.push("JoyAI");
  if (bm.includes("sulphur")) out.push("Sulphur");
  if (bm.includes("qwen")) out.push("Qwen-Image");
  return out;
}

/**
 * Scrape a Civitai (civitai.com) model via the FREE public REST API.
 * No auth required for public models.
 *
 * @param modelId  Numeric Civitai model ID (e.g. "123456" from /models/123456/...)
 */
export async function scrapeCivitaiByRest(
  modelId: string
): Promise<ScrapedLoraMetadata> {
  const apiUrl = `https://civitai.com/api/v1/models/${modelId}`;
  const pageUrl = `https://civitai.com/models/${modelId}`;
  try {
    const res = await fetch(apiUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        source: "civitai",
        url: pageUrl,
        error: `Civitai REST HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as CivitaiModelResponse;

    // Pick the latest (first) model version for baseModel + trainedWords + images
    const latestVersion = data.modelVersions?.[0];
    const baseModels = mapCivitaiBaseModel(latestVersion?.baseModel);
    const trainedWords = latestVersion?.trainedWords ?? [];
    const thumbnailUrl =
      latestVersion?.images?.[0]?.url ?? data.images?.[0]?.url;
    const safetensorsFiles = (latestVersion?.files ?? [])
      .map((f) => f.name ?? "")
      .filter((n) => n.endsWith(".safetensors"));

    // Determine model type from the `type` field
    const rawType = (data.type ?? "").toLowerCase();
    const modelType =
      rawType === "lora" ? "lora" :
      rawType === "checkpoint" ? "checkpoint" :
      rawType === "controlnet" ? "controlnet" :
      rawType === "textualinversion" ? "embedding" :
      rawType === "vae" ? "vae" : "lora";

    // Tags: combine model-level tags + trainedWords (deduped, capped)
    const tagSet = new Set<string>();
    for (const t of data.tags ?? []) tagSet.add(t);
    for (const tw of trainedWords) {
      // Skip overly-long trained-word phrases (they're prompt fragments, not tags)
      if (tw.length <= 32) tagSet.add(tw);
    }
    const tags = Array.from(tagSet).slice(0, 30);

    // Downloads/likes from stats
    const downloads = data.stats?.downloadCount;
    const likes = data.stats?.favoriteCount;

    // Build a clean description (strip HTML if present, cap length)
    let description = data.description ?? "";
    if (description) {
      description = description
        .replace(/<[^>]*>/g, " ") // strip HTML tags
        .replace(/&[a-z]+;/gi, " ") // strip HTML entities
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 600);
    }

    return {
      source: "civitai",
      url: pageUrl,
      repo: String(data.id ?? modelId),
      name: data.name,
      description: description || undefined,
      thumbnailUrl,
      tags,
      downloads,
      likes,
      modelType,
      mature: Boolean(data.nsfw),
      baseModels,
      // Trained words are stored as a custom field for the import route to
      // surface as a triggerWord on the resulting LoraEntry.
      safetensorsFiles: safetensorsFiles.length ? safetensorsFiles : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source: "civitai", url: pageUrl, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Browserless /scrape endpoint — for JS-rendered pages (civitai.red).
// POST https://production-sfo.browserless.io/scrape?token=TOKEN
// Body: { url, elements: [{ selector }] }
// Response: { data: { results: [ { selector, html, text, ... } ] } }
// We request selector "head" to grab the <head> (which contains all og: meta
// tags), then parse with regex.
// ---------------------------------------------------------------------------

/** Extract the first capture group from a meta-tag regex against raw HTML. */
function extractMeta(html: string, property: string): string | undefined {
  // Match either property="X" or name="X" attribute, then capture content="..."
  const re = new RegExp(
    `(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  return html.match(re)?.[1];
}

/** Pull the HTML string out of a Browserless /scrape JSON response. */
function extractBrowserlessHtml(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const obj = json as Record<string, unknown>;
  // Browserless /scrape returns { data: { results: [{ html, ... }] } }
  const data = obj.data as { results?: Array<{ html?: string }> } | undefined;
  if (data?.results?.[0]?.html) return data.results[0].html;
  // Some Browserless versions return { results: [...] } at top level
  const topResults = obj.results as Array<{ html?: string }> | undefined;
  if (topResults?.[0]?.html) return topResults[0].html;
  // Fallback: if the whole response is a string (HTML), return it
  if (typeof json === "string") return json;
  return "";
}

/**
 * Scrape a Civitai.red (NSFW mirror) model page using Browserless /scrape.
 * civitai.red is fully JS-rendered and has no public REST API, so we MUST
 * use a headless browser to extract og:title / og:description / og:image.
 *
 * Gated behind BROWSERLESS_TOKEN — returns a clear error if not configured.
 */
export async function scrapeCivitaiRedModel(
  url: string
): Promise<ScrapedLoraMetadata> {
  if (!isBrowserlessConfigured()) {
    return {
      source: "civitai.red",
      url,
      error: "BROWSERLESS_TOKEN not configured",
    };
  }

  try {
    const res = await fetch(
      `${BROWSERLESS_BASE}/scrape?token=${BROWSERLESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          elements: [{ selector: "head" }],
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        source: "civitai.red",
        url,
        error: `Browserless /scrape HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    // Response is JSON; extract the head HTML
    const json = await res.json().catch(() => null);
    const headHtml = extractBrowserlessHtml(json);
    if (!headHtml) {
      return {
        source: "civitai.red",
        url,
        error: "Browserless /scrape returned no HTML",
      };
    }

    const ogTitle = extractMeta(headHtml, "og:title");
    const ogDescription = extractMeta(headHtml, "og:description");
    const ogImage = extractMeta(headHtml, "og:image");
    const descriptionMeta = extractMeta(headHtml, "description");

    // Extract model name from og:title (format: "Model Name - Base | Type | Civitai")
    let name = ogTitle;
    if (name && name.includes(" - ")) name = name.split(" - ")[0];
    if (name && name.includes(" | ")) name = name.split(" | ")[0];

    // Determine base model from title/description
    const fullText = `${ogTitle ?? ""} ${ogDescription ?? ""} ${descriptionMeta ?? ""}`.toLowerCase();
    const baseModels: string[] = [];
    if (fullText.includes("flux") || fullText.includes("klein")) baseModels.push("FLUX");
    if (fullText.includes("krea")) baseModels.push("Krea 2");
    if (fullText.includes("z-image") || fullText.includes("zimage")) baseModels.push("Z-Image");
    if (fullText.includes("ideogram")) baseModels.push("Ideogram");
    if (fullText.includes("sdxl")) baseModels.push("SDXL");
    if (fullText.includes("wan")) baseModels.push("Wan");

    // Determine model type
    const modelType = fullText.includes("lora") ? "lora" :
                      fullText.includes("checkpoint") ? "checkpoint" :
                      fullText.includes("controlnet") ? "controlnet" : "lora";

    return {
      source: "civitai.red",
      url,
      name: name || undefined,
      description: ogDescription || descriptionMeta,
      thumbnailUrl: ogImage,
      modelType,
      mature: true, // civitai.red is always NSFW
      baseModels,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source: "civitai.red", url, error: msg };
  }
}

/**
 * Scrape a Civitai model page.
 *
 * ROUTING:
 *   - civitai.red URL  → scrapeCivitaiRedModel (Browserless /scrape)
 *   - civitai.com URL  → scrapeCivitaiByRest (FREE REST API, extract model ID
 *                        from URL via regex /civitai\.com\/models\/(\d+)/)
 *
 * Civitai.com has a free public REST API, so we use that as the primary path
 * (fast, structured, no auth). Civitai.red (the NSFW mirror) has no public REST
 * API, so it MUST go through Browserless.
 */
export async function scrapeCivitaiModel(
  url: string
): Promise<ScrapedLoraMetadata> {
  const isRed = url.includes("civitai.red");

  if (isRed) {
    return scrapeCivitaiRedModel(url);
  }

  // civitai.com — try REST first (extract numeric model ID)
  const idMatch = url.match(/civitai\.com\/models\/(\d+)/);
  if (idMatch) {
    return scrapeCivitaiByRest(idMatch[1]);
  }

  return {
    source: "civitai",
    url,
    error: "Could not extract Civitai model ID from URL (expected /models/{id})",
  };
}

/**
 * Batch scrape multiple URLs. Processes in parallel with a concurrency limit
 * to avoid rate limiting.
 *
 * @param urls Array of URLs to scrape
 * @param concurrency Max parallel requests (default 5)
 * @param onProgress Optional callback called after each URL is scraped
 */
export async function batchScrapeLoraMetadata(
  urls: string[],
  concurrency = 5,
  onProgress?: (completed: number, total: number, current: ScrapedLoraMetadata) => void
): Promise<ScrapedLoraMetadata[]> {
  const results: ScrapedLoraMetadata[] = [];
  let completed = 0;

  // Process in chunks of `concurrency`
  for (let i = 0; i < urls.length; i += concurrency) {
    const chunk = urls.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (url) => {
        if (url.includes("huggingface.co/")) {
          const match = url.match(/huggingface\.co\/([^/]+\/[^/?#]+)/);
          if (match) return scrapeHuggingFaceModel(match[1]);
        }
        if (url.includes("civitai.red/models/") || url.includes("civitai.com/models/")) {
          return scrapeCivitaiModel(url);
        }
        return { source: "other" as const, url, error: "Unknown URL type" };
      })
    );

    for (const result of chunkResults) {
      results.push(result);
      completed++;
      onProgress?.(completed, urls.length, result);
    }

    // Small delay between chunks to avoid rate limiting
    if (i + concurrency < urls.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}
