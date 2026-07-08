import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { MODAL_WAN22_URL, MODAL_LTX23_URL } from "@/lib/secrets";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/video/i2v
 *
 * Image-to-Video generation. Takes an approved gallery image + motion prompt
 * and sends it to a video generation backend (Wan 2.2 or LTX 2.3).
 *
 * The video backends are separate Modal apps that need to be deployed:
 *   - Wan 2.2: modal deploy modal-apps/nexus_wan22_i2v.py
 *   - LTX 2.3: modal deploy modal-apps/nexus_ltx23_i2v.py
 *
 * Body:
 *   { imagePath: string, prompt: string, engine: "wan22" | "ltx23", duration?: number }
 *
 * Returns:
 *   { jobId: string, status: "queued" }
 *
 * The job is tracked in the PipelineJob table (same as image generation).
 * The frontend polls /api/pipeline/jobs/[id] for status.
 */
export async function POST(req: NextRequest) {
  let body: {
    imagePath?: string;
    prompt?: string;
    engine?: string;
    duration?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imagePath, prompt: motionPrompt, engine = "wan22", duration = 4 } = body;

  if (!imagePath) {
    return NextResponse.json({ error: "imagePath is required" }, { status: 400 });
  }
  if (!motionPrompt) {
    return NextResponse.json({ error: "prompt (motion prompt) is required" }, { status: 400 });
  }

  // Validate imagePath — must be a gallery path or /api/image/ path
  if (!imagePath.startsWith("/gallery/") && !imagePath.startsWith("/api/image/")) {
    return NextResponse.json(
      { error: "sourceImagePath must start with /gallery/ or /api/image/" },
      { status: 400 }
    );
  }
  if (imagePath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Load the image as base64
  let imageBase64: string | null = null;
  if (imagePath.startsWith("/api/image/")) {
    const genId = imagePath.replace("/api/image/", "");
    const gen = await db.generation.findUnique({ where: { id: genId } });
    if (gen?.imageData) {
      imageBase64 = gen.imageData;
    }
  } else if (imagePath.startsWith("/gallery/")) {
    const filePath = path.join(process.cwd(), "public", imagePath);
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      imageBase64 = buf.toString("base64");
    }
  }

  if (!imageBase64) {
    return NextResponse.json({ error: "Could not load image" }, { status: 404 });
  }

  // Determine video backend URL (from secrets.ts — bulletproof)
  const videoBackendUrl = engine === "ltx23" ? MODAL_LTX23_URL : MODAL_WAN22_URL;

  if (!videoBackendUrl) {
    return NextResponse.json({
      error: `Video backend "${engine}" is not deployed. Deploy it with: modal deploy modal-apps/nexus_${engine === "ltx23" ? "ltx23" : "wan22"}_i2v.py`,
    }, { status: 503 });
  }

  // Create a PipelineJob for tracking
  const createdAtMs = Date.now();
  const job = await db.pipelineJob.create({
    data: {
      status: "queued",
      currentStage: "video",
      input: JSON.stringify({
        type: "video_i2v",
        imagePath,
        prompt: motionPrompt,
        engine,
        duration,
      }),
    },
  });

  // Fire the video generation in the background (NOT awaited)
  void (async () => {
    try {
      await db.pipelineJob.update({
        where: { id: job.id },
        data: { status: "running", currentStage: "video" },
      });

      const numFrames = duration * (engine === "ltx23" ? 24 : 16); // 24fps for LTX, 16fps for Wan
      const height = 720;
      const width = 1280;
      // Random seed per video run — a fixed seed (42) produced identical
      // motion noise across runs, killing creative variation.
      const videoSeed = Math.floor(Math.random() * 2_147_483_647);

      const res = await fetch(`${videoBackendUrl}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageBase64,
          prompt: motionPrompt,
          negative_prompt: "",
          num_frames: numFrames,
          height,
          width,
          num_inference_steps: engine === "ltx23" ? 25 : 30,
          guidance_scale: engine === "ltx23" ? 3.0 : 5.0,
          seed: videoSeed,
        }),
        signal: AbortSignal.timeout(300_000), // 5 min timeout
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Video backend HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json() as { video?: string; frames?: number; fps?: number };
      if (!data.video) {
        throw new Error("Video backend returned no video data");
      }

      // Save the video to the gallery
      const videoDir = path.join(process.cwd(), "public", "gallery", "videos");
      if (!fs.existsSync(videoDir)) {
        fs.mkdirSync(videoDir, { recursive: true });
      }
      const videoPath = `/gallery/videos/${job.id}.mp4`;
      const videoFilePath = path.join(process.cwd(), "public", videoPath);
      fs.writeFileSync(videoFilePath, Buffer.from(data.video, "base64"));

      await db.pipelineJob.update({
        where: { id: job.id },
        data: {
          status: "completed",
          currentStage: "done",
          totalMs: Date.now() - createdAtMs,
          errorMessage: null,
        },
      });

      console.log(`[video/i2v] Video generated: ${videoPath} (${data.frames} frames, ${data.fps}fps)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[video/i2v] failed for job ${job.id}:`, msg);
      await db.pipelineJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          currentStage: "error",
          errorMessage: `Video generation failed: ${msg.slice(0, 300)}`,
          totalMs: Date.now() - createdAtMs,
        },
      }).catch(() => {});
    }
  })();

  return NextResponse.json({
    jobId: job.id,
    status: "queued",
    message: "Video generation queued. Poll /api/pipeline/jobs/[id] for progress.",
    engine,
    duration,
  }, { status: 202 });
}
