/**
 * FLUX.1 Kontext client — garment refinement via Modal.
 *
 * Calls the deployed Modal app (modal-apps/nexus_kontext_refine.py) which
 * loads FLUX.1-Kontext-dev for image-to-image editing: garment refinement,
 * wardrobe adjustment, detail enhancement. Used in the multi-loop garment
 * creation workflow (generate → refine wardrobe → refine details → judge).
 *
 * Endpoint: https://specimba--nexus-kontext-refine-web-app.modal.run
 *   GET  /health → {"status":"ok","model":"FLUX.1-Kontext-dev","gpu":"L40S"}
 *   POST /edit   → {"image":"<base64 PNG>","ms":int,"model":str,"lora_status":[]}
 *
 * Backend only — never import this from a client component. Used by
 * src/app/api/kontext/edit/route.ts.
 */

const MODAL_KONTEXT_URL =
  process.env.MODAL_KONTEXT_URL ||
  "https://specimba--nexus-kontext-refine-web-app.modal.run";

// Cold starts loading FLUX.1-Kontext-dev on an L40S can take 60-90s; warm
// edits return in 5-15s. Match the route's maxDuration so the fetch isn't
// killed by the platform before Modal responds.
const KONTEXT_TIMEOUT_MS =
  Number(process.env.MODAL_KONTEXT_TIMEOUT || 300) * 1000;

export interface KontextLora {
  /** HuggingFace repo id, e.g. "black-forest-labs/FLUX.1-dev-LoRA-..." */
  repo: string;
  /** Optional adapter name (for multi-LoRA repos). */
  adapter?: string;
  /** LoRA strength, 0..1. */
  weight: number;
}

export interface KontextEditParams {
  /** Base64-encoded source image PNG (no data: prefix). */
  imageBase64: string;
  /** Edit instruction, e.g. "add detailed fur trim to the collar". */
  prompt: string;
  /** What to avoid in the edit. */
  negativePrompt?: string;
  /** Denoise/strength 0.1..1.0 (0.5-0.9 recommended for garment edits). */
  denoise?: number;
  /** Diffusion steps (20 recommended). */
  steps?: number;
  /** Classifier-free guidance scale. */
  cfg?: number;
  /** Random seed. */
  seed?: number;
  /** Optional LoRA adapters to apply during the edit. */
  loras?: KontextLora[];
}

export interface KontextEditResult {
  /** Base64-encoded refined PNG (no data: prefix). */
  imageBase64: string;
  /** Wall-clock generation time reported by Modal (ms). */
  ms: number;
  /** Model id that produced the image. */
  model: string;
  /** Per-LoRA load status (repo → loaded/failed). */
  loraStatus?: Array<Record<string, unknown>>;
}

export interface KontextHealth {
  ok: boolean;
  status: string;
  model?: string;
  gpu?: string;
  latencyMs: number;
  error?: string;
}

/**
 * Thrown when the Modal Kontext endpoint is unreachable / not deployed.
 * The route handler surfaces this as a clear "deploy your backend" message
 * instead of a cryptic network error.
 */
export class KontextNotDeployedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KontextNotDeployedError";
  }
}

export function getKontextUrl(): string {
  return MODAL_KONTEXT_URL;
}

/**
 * Lightweight health probe — short 8s timeout so we never block on a cold
 * container. Returns a structured result; never throws.
 */
export async function checkKontextHealth(): Promise<KontextHealth> {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    const res = await fetch(`${MODAL_KONTEXT_URL}/health`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return {
        ok: false,
        status: "http_error",
        latencyMs,
        error: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      status?: string;
      model?: string;
      gpu?: string;
    };
    return {
      ok: data.status === "ok",
      status: data.status ?? "unknown",
      model: data.model,
      gpu: data.gpu,
      latencyMs,
    };
  } catch (e) {
    return {
      ok: false,
      status: "unreachable",
      latencyMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Edit an image with FLUX.1 Kontext (garment refinement, wardrobe adjustment).
 *
 * Sends the source image (base64 PNG) + edit prompt to the Modal Kontext
 * endpoint's /edit route. The first call after container scale-down may take
 * 60-90s (cold start loading FLUX.1-Kontext-dev weights on an L40S). Warm
 * calls return in 5-15s.
 *
 * Throws `KontextNotDeployedError` when the endpoint is unreachable (the
 * Modal app hasn't been deployed yet). The caller should surface this as the
 * canonical "FLUX.1 Kontext not deployed. Run modal-apps/deploy_all.sh to
 * deploy." message.
 */
export async function generateKontextEdit(
  params: KontextEditParams
): Promise<KontextEditResult> {
  const {
    imageBase64,
    prompt,
    negativePrompt,
    denoise,
    steps,
    cfg,
    seed,
    loras,
  } = params;

  if (!imageBase64) {
    throw new Error("imageBase64 is required");
  }
  if (!prompt || !prompt.trim()) {
    throw new Error("prompt is required");
  }

  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), KONTEXT_TIMEOUT_MS);

  try {
    const res = await fetch(`${MODAL_KONTEXT_URL}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        image: imageBase64,
        prompt,
        ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
        ...(typeof denoise === "number" ? { denoise } : {}),
        ...(typeof steps === "number" ? { steps } : {}),
        ...(typeof cfg === "number" ? { cfg } : {}),
        ...(typeof seed === "number" ? { seed } : {}),
        ...(loras && loras.length > 0 ? { loras } : {}),
      }),
      signal: ctrl.signal,
    });

    // Distinguish "not deployed" (404 from a non-existent Modal web endpoint,
    // 502/503 from a scaling-down container) from "deployed but errored".
    if (res.status === 404 || res.status === 502 || res.status === 503) {
      const text = await res.text().catch(() => "");
      throw new KontextNotDeployedError(
        `FLUX.1 Kontext endpoint returned HTTP ${res.status}${
          text ? `: ${text.slice(0, 160)}` : ""
        }. The Modal app may not be deployed. Run modal-apps/deploy_all.sh to deploy.`
      );
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Kontext /edit HTTP ${res.status}: ${text.slice(0, 300)}`);
    }

    // The response can be 1-2MB of JSON (base64 image). Read as text first,
    // then parse — avoids streaming/large-body issues in Node fetch.
    const responseText = await res.text();
    if (responseText.length < 100) {
      throw new KontextNotDeployedError(
        `Kontext /edit returned a too-short response (${responseText.length} chars). The container may have crashed mid-edit, or the app is not fully deployed.`
      );
    }

    let data: {
      image?: string;
      ms?: number;
      model?: string;
      error?: string;
      lora_status?: Array<Record<string, unknown>>;
    };
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      throw new Error(
        `Kontext /edit returned non-JSON response (${responseText.length} chars, first 200: ${responseText.slice(
          0,
          200
        )}). Parse error: ${
          parseErr instanceof Error ? parseErr.message : String(parseErr)
        }`
      );
    }

    // Modal app may return 200 + { error: ... } for application-level errors.
    if (data.error) {
      throw new Error(`Kontext app error: ${data.error}`);
    }

    if (!data.image) {
      throw new KontextNotDeployedError(
        `Kontext /edit returned no image field. Response keys: ${Object.keys(
          data
        ).join(", ")}. The app may not be fully deployed.`
      );
    }

    if (data.image.length < 1000) {
      throw new Error(
        `Kontext /edit returned a truncated image (${data.image.length} chars). The edit may have been interrupted.`
      );
    }

    const latencyMs = Date.now() - t0;
    return {
      imageBase64: data.image,
      ms: data.ms ?? latencyMs,
      model: data.model ?? "FLUX.1-Kontext-dev",
      loraStatus: data.lora_status,
    };
  } catch (err) {
    // Already-classified errors pass through.
    if (err instanceof KontextNotDeployedError) throw err;

    const msg = err instanceof Error ? err.message : String(err);

    // AbortController timeout.
    if (msg.toLowerCase().includes("abort")) {
      throw new Error(
        `Kontext /edit timed out after ${Math.round(
          KONTEXT_TIMEOUT_MS / 1000
        )}s. Cold starts loading FLUX.1-Kontext-dev on an L40S can take 60-90s; warm calls return in 5-15s.`
      );
    }

    // fetch throws TypeError on DNS failure / connection refused — the app
    // isn't deployed. Coerce to KontextNotDeployedError so the route handler
    // surfaces the canonical "deploy your backend" message.
    if (
      err instanceof TypeError &&
      /fetch|network|enotfound|econnrefused|getaddrinfo/i.test(msg)
    ) {
      throw new KontextNotDeployedError(
        `Could not reach the FLUX.1 Kontext endpoint at ${MODAL_KONTEXT_URL}: ${msg}. Run modal-apps/deploy_all.sh to deploy.`
      );
    }

    throw new Error(`Kontext /edit failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}
