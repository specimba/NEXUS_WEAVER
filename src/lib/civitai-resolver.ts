/**
 * NEXUS Visual Weaver — Civitai URL Resolver
 *
 * Resolves Civitai model URLs to direct CDN download URLs.
 *
 * WHY THIS EXISTS:
 * Modal's IP range is blocked by Civitai (403 Forbidden on API calls).
 * The Next.js backend (running in the Z.ai sandbox) CAN access the Civitai API.
 * So we resolve the Civitai URL → direct CDN download URL HERE, then pass the
 * CDN URL to the Modal app. The Modal app only downloads from the CDN (which
 * is not IP-blocked).
 *
 * Flow:
 * 1. User selects a Civitai LoRA (e.g. civitai.red/models/1098033/...)
 * 2. pipeline.ts calls resolveCivitaiLoraUrl(url)
 * 3. This module calls the Civitai REST API (api.civitai.com/api/v1/models/{id})
 * 4. Gets the downloadUrl (a CDN URL like civitai.com/api/download/models/...)
 * 5. Appends the CIVITAI_API_TOKEN as ?token=... query param
 * 6. Returns { downloadUrl, modelName, sizeMb } to the pipeline
 * 7. The pipeline passes the CDN URL to the Modal app as the `repo` field
 * 8. The Modal app downloads the .safetensors from the CDN URL (no API call)
 *
 * Backend only — never import from a client component.
 */

import { CIVITAI_API_TOKEN } from "@/lib/secrets";

export interface ResolvedCivitaiLora {
  downloadUrl: string;
  modelName: string;
  versionName: string;
  sizeMb: number;
}

/**
 * Resolve a Civitai model URL to a direct CDN download URL.
 *
 * Accepts:
 *   https://civitai.red/models/1098033/realism-lora-by-stable-yogi-pony
 *   https://civitai.com/models/1098033?modelVersionId=2074888
 *   https://civitai.com/models/1098033
 *
 * Returns null if the URL is not a valid Civitai URL or resolution fails.
 */
export async function resolveCivitaiLoraUrl(url: string): Promise<ResolvedCivitaiLora | null> {
  // Extract the model ID from the URL
  const match = url.match(/models\/(\d+)/);
  if (!match) return null;
  const modelId = match[1];

  const token = CIVITAI_API_TOKEN;
  const apiUrl = `https://civitai.com/api/v1/models/${modelId}`;

  try {
    const fetchUrl = token ? `${apiUrl}?token=${token}` : apiUrl;
    const res = await fetch(fetchUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      console.warn(`[civitai-resolver] API returned HTTP ${res.status} for model ${modelId}`);
      return null;
    }

    const data = (await res.json()) as {
      name?: string;
      modelVersions?: Array<{
        name?: string;
        downloadUrl?: string;
        files?: Array<{ name?: string; sizeKB?: number }>;
      }>;
    };

    const versions = data.modelVersions || [];
    if (versions.length === 0) {
      console.warn(`[civitai-resolver] No versions found for model ${modelId}`);
      return null;
    }

    const latest = versions[0];
    const downloadUrl = latest.downloadUrl;
    if (!downloadUrl) {
      console.warn(`[civitai-resolver] No download URL for model ${modelId}`);
      return null;
    }

    // Append token for authenticated download (avoids 403 on the CDN)
    const urlWithToken = token
      ? downloadUrl.includes("?")
        ? `${downloadUrl}&token=${token}`
        : `${downloadUrl}?token=${token}`
      : downloadUrl;

    const sizeKB = latest.files?.[0]?.sizeKB ?? 0;
    const sizeMb = Math.round((sizeKB / 1024) * 10) / 10;

    return {
      downloadUrl: urlWithToken,
      modelName: data.name || `civitai_${modelId}`,
      versionName: latest.name || "unknown",
      sizeMb,
    };
  } catch (err) {
    console.warn(`[civitai-resolver] Failed to resolve model ${modelId}:`, err instanceof Error ? err.message : String(err));
    return null;
  }
}
