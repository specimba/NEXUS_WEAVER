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
  "Video generation requires a deployed Modal video app (Wan 2.2 / LTX 2.3). The current Modal endpoint serves FLUX.1-schnell (image only). Deploy a video Modal app and set MODAL_VIDEO_BASE_URL in .env.";

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
  // Strip leading slash, then resolve under public/
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

  // 1. Validate source image exists
  const absImagePath = resolveAbsoluteImagePath(params.sourceImagePath);
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

  // 3. Attempt the Modal video endpoint only when both MODAL_USE=true and
  //    MODAL_VIDEO_BASE_URL are set. Without a dedicated video app, the
  //    current Modal endpoint serves FLUX.1-schnell (image only) and cannot
  //    produce video output — so we don't waste a GPU call on it.
  if (!isModalEnabled() || !MODAL_VIDEO_BASE_URL) {
    const ms = Date.now() - t0;
    await logEvent(
      "video_stage",
      `Video stage aborted — no video Modal app deployed (MODAL_USE=${isModalEnabled()}, MODAL_VIDEO_BASE_URL=${MODAL_VIDEO_BASE_URL ? "set" : "unset"}). The current Modal endpoint serves FLUX.1-schnell (image only).`,
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

  // 4. Real call to the deployed video Modal app
  try {
    const imageBuffer = fs.readFileSync(absImagePath);
    const imageBase64 = imageBuffer.toString("base64");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MODAL_VIDEO_TIMEOUT_SEC * 1000);

    const res = await fetch(`${MODAL_VIDEO_BASE_URL}/generate_video`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        image: imageBase64,
        prompt: params.prompt,
        engine_id: engine.id,
        steps,
        cfg,
        duration_sec: durationSec,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Modal /generate_video HTTP ${res.status}: ${text.slice(0, 240)}`
      );
    }

    const data = (await res.json()) as { video?: string; ms?: number };
    if (!data.video) {
      throw new Error("Modal /generate_video returned no video field");
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
