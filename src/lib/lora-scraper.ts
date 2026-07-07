/**
 * LoRA Metadata Scraper — enriches the LoRA library with data from HF + Civitai.
 *
 * ARCHITECTURE:
 * - HuggingFace models: uses the free HF API (https://huggingface.co/api/models/{repo})
 *   Returns structured JSON: tags, downloads, likes, siblings (file list), pipeline_tag.
 * - Civitai + Civitai.red models: uses Browserless /content endpoint to fetch the
 *   rendered HTML, then extracts og:title, og:description, og:image metadata.
 *   Browserless handles JS-rendered pages and NSFW (civitai.red) content.
 *
 * BROWSERLESS TOKEN: stored in src/lib/secrets.ts (committed to git, bulletproof).
 *
 * This is a backend-only service — called from /api/lora/scrape routes.
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

/**
 * Scrape a Civitai or Civitai.red model page using Browserless.
 * Handles both SFW (civitai.com) and NSFW (civitai.red) content.
 *
 * Extracts og:title, og:description, og:image from the rendered HTML.
 */
export async function scrapeCivitaiModel(
  url: string
): Promise<ScrapedLoraMetadata> {
  if (!isBrowserlessConfigured()) {
    return { source: url.includes("civitai.red") ? "civitai.red" : "civitai", url, error: "Browserless not configured" };
  }

  const isRed = url.includes("civitai.red");

  try {
    // Use Browserless /content endpoint — renders the page with a real browser
    const res = await fetch(`${BROWSERLESS_BASE}/content?token=${BROWSERLESS_TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { source: isRed ? "civitai.red" : "civitai", url, error: `Browserless HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    const html = await res.text();

    // Extract metadata from og: tags and meta tags
    const getMetaContent = (property: string): string | undefined => {
      const regex = new RegExp(`(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
      const match = html.match(regex);
      return match?.[1];
    };

    const ogTitle = getMetaContent("og:title");
    const ogDescription = getMetaContent("og:description");
    const ogImage = getMetaContent("og:image");
    const description = getMetaContent("description");

    // Extract model name from og:title (format: "Model Name - Base | Type | Civitai")
    let name = ogTitle;
    if (name && name.includes(" - ")) {
      name = name.split(" - ")[0];
    }
    if (name && name.includes(" | ")) {
      name = name.split(" | ")[0];
    }

    // Determine base model from title/description
    const fullText = `${ogTitle} ${ogDescription} ${description}`.toLowerCase();
    const baseModels: string[] = [];
    if (fullText.includes("flux") || fullText.includes("klein")) baseModels.push("FLUX");
    if (fullText.includes("krea")) baseModels.push("Krea 2");
    if (fullText.includes("z-image") || fullText.includes("zit")) baseModels.push("Z-Image");
    if (fullText.includes("ideogram")) baseModels.push("Ideogram");
    if (fullText.includes("sdxl")) baseModels.push("SDXL");
    if (fullText.includes("wan")) baseModels.push("Wan");

    // Determine model type
    const modelType = fullText.includes("lora") ? "lora" :
                      fullText.includes("checkpoint") ? "checkpoint" :
                      fullText.includes("controlnet") ? "controlnet" : "lora";

    return {
      source: isRed ? "civitai.red" : "civitai",
      url,
      name: name || undefined,
      description: ogDescription || description,
      thumbnailUrl: ogImage,
      modelType,
      mature: isRed, // civitai.red is always NSFW
      baseModels,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source: isRed ? "civitai.red" : "civitai", url, error: msg };
  }
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
