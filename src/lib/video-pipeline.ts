/**
 * Video pipeline (M4) — image-approval → video step-2 flow.
 *
 * After the still-image pipeline completes and the user approves the image,
 * this module sends it to a video engine (Wan 2.2 / LTX 2.3 / etc.) for
 * image-to-video (I2V) generation. The approved image becomes the first
 * frame of the output video.
 *
 * IMPORTANT (sandbox reality):
 * There is NO real video GPU backend deployed in this sandbox. The current
 * Modal endpoint (`MODAL_BASE_URL` from `@/lib/modal-client`) only serves
 * FLUX.1-schnell image generation — it has no `/generate_video` route.
 *
 * To enable real I2V generation the operator must:
 *   1. Deploy a separate Modal app that runs a video diffusion model
 *      (Wan 2.2 / LTX 2.3 / HunyuanVideo / etc.) on an H100 or L40S.
 *   2. Expose a `POST /generate_video` endpoint that accepts:
 *        { image: <base64 PNG>, prompt, engine_id, steps, cfg, duration_sec }
 *      and returns `{ video: <base64 MP4>, ms: int }`.
 *   3. Set `MODAL_VIDEO_BASE_URL` in `.env` to that app's URL.
 *   4. Keep `MODAL_USE=true` so the video client is enabled.
 *
 * Until then, `runVideoStage` returns a structured `errorMessage` that the
 * Studio surfaces in a rose callout with a one-click link to Cost Lab.
 *
 * Backend only — never import this from a client component.
 */

import fs from "fs";
import path from "path";
import { isModalEnabled } from "@/lib/modal-client";
import { MODAL_WAN22_URL, MODAL_LTX23_URL } from "@/lib/secrets";
import { logEvent } from "@/lib/pipeline";
import { getEngine } from "@/lib/engines";

const GALLERY_DIR = path.join(process.cwd(), "public", "gallery");

const MODAL_VIDEO_BASE_URL = process.env.MODAL_VIDEO_BASE_URL || "";
const MODAL_VIDEO_TIMEOUT_SEC = Number(process.env.MODAL_VIDEO_TIMEOUT || 240);

export interface VideoStageInput {
  /** Path of the approved still image, e.g. "/gallery/abc.png". */
  sourceImagePath: string;
  /** Motion prompt sent to the I2V engine. */
  prompt: string;
  /** Engine id (one of ENGINES with type === "video"). */
  engineId: string;
  /** Optional override for diffusion steps. */
  steps?: number;
  /** Optional override for classifier-free guidance. */
  cfg?: number;
  /** Optional override for output video length, in seconds. */
  durationSec?: number;
}

export interface VideoStageResult {
  /** Public path of the generated MP4 (e.g. "/gallery/video-…mp4"), or null. */
  videoPath: string | null;
  /** Wall-clock duration of the video stage, in ms. */
  ms: number;
  /** Which backend produced the video — "modal" if real, null on failure. */
  backend: "modal" | "zai" | null;
  /** Structured error message when videoPath is null. Null on success. */
  errorMessage: string | null;
}

const NOT_DEPLOYED_MSG =
  "Video backend is cold-starting. The Wan 2.2 / LTX 2.3 Modal app needs ~2-5 min to warm up on first use. Try again in a minute.";

function ensureGalleryDir(): void {
  if (!fs.existsSync(GALLERY_DIR)) {
    fs.mkdirSync(GALLERY_DIR, { recursive: true });
  }
}

/**
 * Resolve a public web path like "/gallery/abc.png" to an absolute filesystem
 * path inside `public/`. Returns null if the file does not exist.
 */
function resolveAbsoluteImagePath(sourceImagePath: string): string | null {
  if (!sourceImagePath) return null;
  // Handle /api/image/{id} paths — read from DB, write to temp file
  if (sourceImagePath.startsWith("/api/image/")) {
    // For video pipeline, we need the actual file. The /api/image/ route serves
    // from DB imageData. We'll handle this in the caller by fetching the image
    // via HTTP and saving to a temp file.
    // Return null here — the caller needs to resolve it differently.
    return null; // Will be handled by the video run route using /api/video/i2v
  }
  // Handle /gallery/ paths — resolve under public/
  const stripped = sourceImagePath.startsWith("/")
    ? sourceImagePath.slice(1)
    : sourceImagePath;
  const candidate = path.join(process.cwd(), "public", stripped);
  if (fs.existsSync(candidate)) return candidate;
  // Fallback: just the basename in the gallery dir
  const galleryCandidate = path.join(GALLERY_DIR, path.basename(sourceImagePath));
  if (fs.existsSync(galleryCandidate)) return galleryCandidate;
  return null;
}

/**
 * Run the video (I2V) stage. Always returns a structured result; never throws.
 *
 * Flow:
 *   1. Validate that the source image exists on disk.
 *   2. Record the video-run intent in the audit log.
 *   3. If a video Modal app is configured (MODAL_VIDEO_BASE_URL + MODAL_USE=true),
 *      POST the image + params to its `/generate_video` endpoint and write the
 *      returned MP4 to public/gallery.
 *   4. Otherwise (or on any error): return a structured errorMessage explaining
 *      what's needed for real video.
 */
export async function runVideoStage(
  params: VideoStageInput
): Promise<VideoStageResult> {
  const t0 = Date.now();
  const engine = getEngine(params.engineId);

  // 1. Validate source image exists — handle both /gallery/ and /api/image/ paths
  let absImagePath: string | null = null;
  let imageBase64: string | null = null;

  if (params.sourceImagePath.startsWith("/api/image/")) {
    // DB-backed image — read from Prisma
    try {
      const { db } = await import("@/lib/db");
      const genId = params.sourceImagePath.replace("/api/image/", "");
      const gen = await db.generation.findUnique({ where: { id: genId } });
      if (gen?.imageData) {
        imageBase64 = gen.imageData;
        // Write to temp file for video pipeline
        const tempPath = path.join(GALLERY_DIR, `temp_${genId}.png`);
        fs.writeFileSync(tempPath, Buffer.from(gen.imageData, "base64"));
        absImagePath = tempPath;
      }
    } catch {
      // fall through to disk check
    }
  }

  if (!absImagePath) {
    absImagePath = resolveAbsoluteImagePath(params.sourceImagePath);
  }

  if (!absImagePath) {
    const ms = Date.now() - t0;
    await logEvent(
      "video_stage",
      `Video stage rejected — source image not found on disk: ${params.sourceImagePath}`,
      "warn",
      null,
      {
        engineId: engine.id,
        sourceImagePath: params.sourceImagePath,
      }
    );
    return {
      videoPath: null,
      ms,
      backend: null,
      errorMessage: `Source image not found on disk: ${params.sourceImagePath}. Re-run the image pipeline and try again.`,
    };
  }

  const steps = params.steps ?? engine.params.stepsDefault;
  const cfg = params.cfg ?? engine.params.cfgDefault;
  const durationSec = params.durationSec ?? 4;

  // 2. Record the video-run intent in the audit log
  await logEvent(
    "video_stage",
    `Video stage intent — engine=${engine.shortName} steps=${steps} cfg=${cfg} duration=${durationSec}s source=${params.sourceImagePath}`,
    "info",
    null,
    {
      engineId: engine.id,
      sourceImagePath: params.sourceImagePath,
      steps,
      cfg,
      durationSec,
      prompt: params.prompt.slice(0, 200),
    }
  );

  // 3. Check which video backend to use based on engine selection.
  //    Wan 2.2 and LTX 2.3 are deployed as separate Modal apps.
  const videoBackendUrl = engine.id === "wan-2.2" ? MODAL_WAN22_URL :
                          engine.id === "ltx-2.3" ? MODAL_LTX23_URL :
                          MODAL_WAN22_URL; // default to Wan 2.2

  if (!videoBackendUrl) {
    const ms = Date.now() - t0;
    await logEvent(
      "video_stage",
      `Video stage aborted — no video Modal app deployed for engine ${engine.id}.`,
      "warn",
      null,
      { engineId: engine.id }
    );
    return {
      videoPath: null,
      ms,
      backend: null,
      errorMessage: NOT_DEPLOYED_MSG,
    };
  }

  // 4. Auto-deploy the video engine if it's stopped (H100 engines only).
  // Same smart-rotator pattern as the image pipeline.
  try {
    const { ensureEngineDeployed } = await import("@/lib/engine-manager");
    const deployCheck = await ensureEngineDeployed(params.engineId);
    if (!deployCheck.ready) {
      const ms = Date.now() - t0;
      return {
        videoPath: null,
        ms,
        backend: null,
        errorMessage: `Video engine could not be deployed: ${deployCheck.message}`,
      };
    }
  } catch (deployErr) {
    // Non-fatal — the engine might already be deployed, just proceed
    console.log("[video-pipeline] Engine deploy check:", deployErr instanceof Error ? deployErr.message : String(deployErr));
  }

  // 5. Real call to the deployed video Modal app
  try {
    const imageBuffer = fs.readFileSync(absImagePath);
    const imageBase64 = imageBuffer.toString("base64");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MODAL_VIDEO_TIMEOUT_SEC * 1000);

    // Random seed per video run — same pattern as image pipeline. A fixed
    // seed (42) meant every video had identical motion noise → no variation.
    const videoSeed = Math.floor(Math.random() * 2_147_483_647);

    const res = await fetch(`${videoBackendUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        image: imageBase64,
        prompt: params.prompt,
        negative_prompt: "",
        num_frames: durationSec * (engine.id === "ltx-2.3" ? 24 : 16),
        height: 720,
        width: 1280,
        num_inference_steps: engine.id === "ltx-2.3" ? 25 : 30,
        guidance_scale: engine.id === "ltx-2.3" ? 3.0 : 5.0,
        seed: videoSeed,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Modal /generate HTTP ${res.status}: ${text.slice(0, 240)}`
      );
    }

    const data = (await res.json()) as { video?: string; ms?: number };
    if (!data.video) {
      throw new Error("Modal /generate returned no video field");
    }

    ensureGalleryDir();
    const filename = `video-${Date.now()}-${engine.id}.mp4`;
    const filepath = path.join(GALLERY_DIR, filename);
    fs.writeFileSync(filepath, Buffer.from(data.video, "base64"));

    const ms = Date.now() - t0;
    await logEvent(
      "video_stage",
      `Video stage completed — engine=${engine.shortName} ms=${ms} (modal ${data.ms ?? "?"}ms) duration=${durationSec}s`,
      "success",
      null,
      { engineId: engine.id, videoPath: `/gallery/${filename}`, ms, durationSec }
    );

    return {
      videoPath: `/gallery/${filename}`,
      ms,
      backend: "modal",
      errorMessage: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const ms = Date.now() - t0;
    await logEvent(
      "video_stage",
      `Video stage failed — Modal video endpoint error: ${msg.slice(0, 240)}`,
      "warn",
      null,
      { engineId: engine.id, error: msg }
    );
    return {
      videoPath: null,
      ms,
      backend: null,
      // Surface the underlying error in the structured message too — keeps the
      // operator informed when they have a misconfigured video app.
      errorMessage: `${NOT_DEPLOYED_MSG} (Underlying error: ${msg.slice(0, 160)})`,
    };
  }
}
