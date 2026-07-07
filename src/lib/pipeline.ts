import { db } from "@/lib/db";
import { getZai, isSupportedSize, SUPPORTED_SIZES } from "@/lib/zai";
import {
  isModalEnabled,
  generateImageViaModal,
  checkModalHealth,
  callModalBrain,
  isBrainEndpointConfigured,
  type BrainChatMessage,
} from "@/lib/modal-client";
import type {
  JudgeResult,
  SafetyResult,
} from "@/lib/nexus-types";
import type { TimingMap } from "@/lib/metrics";
import { ASPECTS } from "@/lib/nexus-types";
import {
  resolveCalibration,
  type ResolvedCalibration,
  type CalibrationPreset,
} from "@/lib/calibration";
import {
  getActivePolicy,
  getConsent,
  resolveMaturityTier,
  HARD_BLOCKLIST,
  type ActivePolicy,
  type MaturityTier,
} from "@/lib/policy";
import { getLora } from "@/lib/lora-library";
import { getEngine } from "@/lib/engines";
import { getBrain, BRAIN_ROLE_PROMPTS } from "@/lib/brain";
import fs from "fs";
import path from "path";

const GALLERY_DIR = path.join(process.cwd(), "public", "gallery");

function ensureGalleryDir() {
  if (!fs.existsSync(GALLERY_DIR)) {
    fs.mkdirSync(GALLERY_DIR, { recursive: true });
  }
}

function sizeForAspect(aspect: string): string {
  const found = ASPECTS.find((a) => a.id === aspect);
  if (found && isSupportedSize(found.size)) return found.size;
  return "1024x1024";
}

/** Parse "WxH" → { width, height }. Falls back to 1024x1024. */
function parseSize(size: string): { width: number; height: number } {
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (m) return { width: Number(m[1]), height: Number(m[2]) };
  return { width: 1024, height: 1024 };
}

function nowMs(): number {
  return Date.now();
}

function elapsed(start: number): number {
  return nowMs() - start;
}

// Robustly extract a JSON object from an LLM response that may contain
// prose / markdown fences around the JSON.
function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  // strip code fences
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // find first { ... last }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  // also try first [ ... last ]
  if (first === -1) {
    const a = s.indexOf("[");
    const b = s.lastIndexOf("]");
    if (a !== -1 && b !== -1 && b > a) s = s.slice(a, b + 1);
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function clamp(n: unknown, lo = 0, hi = 100): number {
  const v = typeof n === "number" ? n : typeof n === "string" ? parseFloat(n) : NaN;
  if (Number.isNaN(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function strArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

// ----------------------------------------------------------------------------
// Stage 1 — FLUX image generation
// ----------------------------------------------------------------------------
// Two backends, selected by MODAL_USE env var:
//   • Modal (default when MODAL_USE=true): calls the user's deployed
//     `nexus-visual` Modal app → real FLUX.1-schnell on H100 GPU.
//     Warm calls ~1.5–2s; cold start up to ~7min.
//   • z-ai-web-dev-sdk (fallback): calls zai.images.generations.create.
//     No GPU, hosted inference, ~20–30s per call.
// ----------------------------------------------------------------------------
export async function stageFlux(
  prompt: string,
  style: string,
  aspect: string,
  wardrobe: string | null,
  generationId: string,
  calibration: ResolvedCalibration,
  loraIds: string[],
  loraWeights: Record<string, number>,
  engineId?: string
): Promise<{ imagePath: string; imageBase64: string; size: string; ms: number; backend: "modal" | "zai"; engineId: string; backendMismatch: boolean }> {
  const start = nowMs();
  const selectedEngine = getEngine(engineId);

  // Resolve the target size: prefer the calibration resolution when supported,
  // otherwise fall back to the aspect-derived size.
  const aspectSize = sizeForAspect(aspect);
  const size = isSupportedSize(calibration.resolution) ? calibration.resolution : aspectSize;

  // Build the enriched prompt: base intent + style + wardrobe + LoRA triggers
  // + the preset's quality tokens (these carry the CFG/sampler intent for the
  // z-ai backend, which has no step/cfg knobs).
  const loraTriggers = loraIds
    .map((id) => getLora(id))
    .filter(Boolean)
    .map((l) => l!.name.toLowerCase());

  const enriched = [
    prompt,
    `style: ${style}`,
    wardrobe ? `wardrobe: ${wardrobe}` : "",
    loraTriggers.length ? `lora triggers: ${loraTriggers.join(", ")}` : "",
    ...calibration.qualityTokens,
  ]
    .filter(Boolean)
    .join(", ");

  ensureGalleryDir();
  const filename = `${generationId}.png`;
  const filepath = path.join(GALLERY_DIR, filename);

  let backend: "modal" | "zai" = "modal";
  let base64: string | null = null;

  // Build the LoRA array for Modal: map our library IDs to HF repo IDs + weights
  const modalLoras: Array<{ repo: string; adapter: string; weight: number; weightName?: string } | null> = loraIds
    .map((id) => {
      const lora = getLora(id);
      if (!lora) return null;
      // Extract HF repo ID from the URL: https://huggingface.co/NO8D/BodyControl → NO8D/BodyControl
      const repoMatch = lora.url.match(/huggingface\.co\/([^\/]+\/[^\/\?#]+)/);
      if (!repoMatch) return null;
      const entry: { repo: string; adapter: string; weight: number; weightName?: string } = {
        repo: repoMatch[1],
        adapter: lora.id, // use our id as the adapter name
        weight: loraWeights[id] ?? lora.recommendedWeight,
      };
      // Pass weight_name for repos with multiple .safetensors files — prevents
      // diffusers from loading the wrong weights (quality bug).
      if (lora.weightName) entry.weightName = lora.weightName;
      return entry;
    });
  const validModalLoras = modalLoras.filter((l): l is { repo: string; adapter: string; weight: number; weightName?: string } => l !== null);

  // Modal is the PRIMARY and ONLY image generation path.
  // The H100 serves FLUX.1-schnell with LoRA support.
  // Cold starts take 10-60s; warm calls return in 2-5s.
  if (isModalEnabled()) {
    try {
      const { width, height } = parseSize(size);
      const result = await generateImageViaModal({
        prompt: enriched,
        width,
        height,
        steps: calibration.steps,
        cfg: calibration.cfg,
        loras: validModalLoras,
        isFirstCall: true, // allow long cold-start timeout (300s)
      });
      base64 = result.imageBase64;
      backend = "modal";
      await logEvent(
        "stage_complete",
        `Modal /generate ok — ${result.ms}ms (round-trip ${result.latencyMs}ms) · engine=${selectedEngine.shortName} steps=${calibration.steps} cfg=${calibration.cfg} loras=${validModalLoras.length}`,
        "success",
        generationId
      );
    } catch (modalErr) {
      const msg = modalErr instanceof Error ? modalErr.message : String(modalErr);
      await logEvent(
        "error",
        `Modal /generate failed: ${truncate(msg, 300)}`,
        "error",
        generationId
      );
      // NO z-ai fallback for image generation. The user wants real GPU + LoRAs.
      // If Modal fails, throw a clear error so the user knows to retry or warm up.
      throw new Error(`Modal GPU generation failed: ${msg}. The GPU may be cold-starting (wait 30-60s and retry) or the LoRAs may have loading errors. Click "Warm up" first, then try again.`);
    }
  } else {
    throw new Error("MODAL_USE is not true. Modal GPU is the only generation path. Set MODAL_USE=true in .env.");
  }

  if (!base64) throw new Error("Image generation returned no base64 payload (both Modal + z-ai failed)");

  fs.writeFileSync(filepath, Buffer.from(base64, "base64"));

  // Detect backend mismatch: the user selected an engine (e.g. Krea 2 Turbo)
  // but the Modal endpoint serves FLUX.1-schnell. This is recorded as
  // provenance so the user knows the actual model used ≠ the selected one.
  // When they deploy the optimized app from Cost Lab, the endpoint will serve
  // the selected engine and this mismatch disappears.
  const backendMismatch = backend === "modal" && selectedEngine.id !== "flux1-schnell" && selectedEngine.family !== "FLUX.1";
  if (backendMismatch) {
    await logEvent(
      "warn",
      `Backend mismatch: selected engine "${selectedEngine.name}" but Modal endpoint serves FLUX.1-schnell. The generated image uses FLUX.1-schnell weights. Deploy the optimized app from Cost Lab to serve ${selectedEngine.name}.`,
      "warn",
      generationId
    );
  }

  return {
    imagePath: `/gallery/${filename}`,
    imageBase64: base64, // store in DB so images persist across dev server restarts
    size,
    ms: elapsed(start),
    backend,
    engineId: selectedEngine.id,
    backendMismatch,
  };
}

// ----------------------------------------------------------------------------
// Stage 2 — ST3GG security scan (z-ai chat completions, structured)
// ----------------------------------------------------------------------------
export async function stageSt3gg(
  prompt: string,
  style: string,
  wardrobe: string | null,
  brainId?: string
): Promise<SafetyResult> {
  const start = nowMs();
  const zai = await getZai();
  const brain = getBrain(brainId);
  const sys = BRAIN_ROLE_PROMPTS.safety + " (Running on " + brain.shortName + ".)";
  const user = `Evaluate this image generation request for safety.
Prompt: "${prompt}"
Style: ${style}
Wardrobe notes: ${wardrobe || "none"}

Consider: violence, explicit sexual content, real-person likeness abuse, self-harm,
hate symbols, CSAM risk, and wardrobe/undress risk. Score 0-100 where 100 is perfectly safe.

Emit flags from this catalogue when relevant (use these exact slugs):
- HARD BLOCK (always refused): csam, minors, underage, nonconsensual, deepfake-real-person, real-person-likeness, extreme-violence, gore, hate-symbol, self-harm, bestiality, terrorism
- POLICY CATEGORIES: explicit-nudity, suggestual, wardrobe-risk, violence-mild, violence-graphic, weapons, substance, political, religious

Respond as JSON exactly in this shape:
{
  "passed": boolean,            // true if risk is low/medium or below and no critical flags
  "score": number,              // 0-100 safety score
  "riskLevel": "safe"|"low"|"medium"|"high"|"critical",
  "flags": string[],            // flag codes from the catalogue above
  "rationale": string           // one short sentence
}`;

  // Try the Modal brain endpoint first (Huihui-Qwen-35B-A3B-abliterated,
  // uncensored). Falls through to z-ai on failure (timeout, cold-start, error).
  const brainMessages: BrainChatMessage[] = [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
  let raw = "";
  if (isBrainEndpointConfigured()) {
    const brainResult = await callModalBrain(brainMessages, { temperature: 0.3 });
    if (brainResult) {
      raw = brainResult.content;
    }
  }
  // Fallback: z-ai chat completions (always available, reliable)
  if (!raw) {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: sys },
        { role: "user", content: user },
      ],
      thinking: { type: "disabled" },
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const parsed = extractJson<{
    passed?: boolean;
    score?: number;
    riskLevel?: string;
    flags?: unknown;
    rationale?: string;
  }>(raw);

  const score = clamp(parsed?.score ?? 60);
  const riskLevel = (parsed?.riskLevel ?? "low") as SafetyResult["riskLevel"];
  const passed =
    parsed?.passed ?? (riskLevel === "safe" || riskLevel === "low" || riskLevel === "medium");

  return {
    passed: !!passed,
    score,
    riskLevel,
    flags: strArr(parsed?.flags),
    rationale: parsed?.rationale ?? "No rationale provided.",
    stageMs: elapsed(start),
  };
}

// ----------------------------------------------------------------------------
// Stage 3 — MiniCPM-V visual judge (z-ai vision completions on generated image)
// ----------------------------------------------------------------------------
export async function stageJudge(
  imagePath: string,
  prompt: string,
  style: string,
  wardrobe: string | null,
  brainId?: string
): Promise<JudgeResult> {
  const start = nowMs();
  const zai = await getZai();
  const brain = getBrain(brainId);

  // Read the generated PNG from disk and base64-encode it
  const abs = path.join(process.cwd(), "public", imagePath);
  const buf = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  if (!buf) throw new Error(`Judge stage: image not found at ${abs}`);
  const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;

  const sys = BRAIN_ROLE_PROMPTS.judge + " (Running on " + brain.shortName + ".)";

  const user = `You are judging a generated image.
Original prompt: "${prompt}"
Intended style: ${style}
Wardrobe notes: ${wardrobe || "none"}

Score each dimension 0-100:
- promptAdherence: how faithfully the image matches the prompt
- visualQuality: sharpness, artifacts, coherence
- aestheticScore: composition, color, appeal
- safetyScore: presence of unsafe content (100 = clean)
- wardrobeMatch: how well wardrobe notes (if any) are reflected
- overallScore: weighted overall

Then set verdict: "approved" (overall >= 70 and safety >= 80), "rejected" (overall < 45 or safety < 50), else "needs_review".
Provide 2-4 short observations, strengths and weaknesses arrays.

Respond as JSON exactly:
{
  "promptAdherence": number,
  "visualQuality": number,
  "aestheticScore": number,
  "safetyScore": number,
  "wardrobeMatch": number,
  "overallScore": number,
  "verdict": "approved"|"rejected"|"needs_review",
  "observations": string[],
  "strengths": string[],
  "weaknesses": string[]
}`;

  const response = await zai.chat.completions.createVision({
    model: "glm-4.6v",
    messages: [
      { role: "assistant", content: sys },
      {
        role: "user",
        content: [
          { type: "text", text: user },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    thinking: { type: "disabled" },
  });

  const raw = response.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson<{
    promptAdherence?: number;
    visualQuality?: number;
    aestheticScore?: number;
    safetyScore?: number;
    wardrobeMatch?: number;
    overallScore?: number;
    verdict?: string;
    observations?: unknown;
    strengths?: unknown;
    weaknesses?: unknown;
  }>(raw);

  const overall = clamp(parsed?.overallScore ?? 0);
  const safety = clamp(parsed?.safetyScore ?? 0);
  let verdict = parsed?.verdict as JudgeResult["verdict"];
  if (verdict !== "approved" && verdict !== "rejected" && verdict !== "needs_review") {
    verdict = overall >= 70 && safety >= 80 ? "approved" : overall < 45 || safety < 50 ? "rejected" : "needs_review";
  }

  return {
    promptAdherence: clamp(parsed?.promptAdherence),
    visualQuality: clamp(parsed?.visualQuality),
    aestheticScore: clamp(parsed?.aestheticScore),
    safetyScore: safety,
    wardrobeMatch: clamp(parsed?.wardrobeMatch),
    overallScore: overall,
    verdict,
    observations: strArr(parsed?.observations),
    strengths: strArr(parsed?.strengths),
    weaknesses: strArr(parsed?.weaknesses),
    stageMs: elapsed(start),
  };
}

// ----------------------------------------------------------------------------
// Stage 4 — Nemotron evidence parse (aggregate into structured evidence)
// ----------------------------------------------------------------------------
export async function stageNemotron(
  prompt: string,
  style: string,
  aspect: string,
  wardrobe: string | null,
  safety: SafetyResult,
  judge: JudgeResult,
  brainId?: string
): Promise<{ evidence: Record<string, unknown>; ms: number }> {
  const start = nowMs();
  const zai = await getZai();
  const brain = getBrain(brainId);

  const sys = BRAIN_ROLE_PROMPTS.evidence + " (Running on " + brain.shortName + ".)";

  const user = `Aggregate this pipeline run into structured evidence.

INPUTS:
- prompt: "${prompt}"
- style: ${style}
- aspect: ${aspect}
- wardrobe: ${wardrobe || "none"}

SAFETY_SCAN:
${JSON.stringify(safety, null, 2)}

VISUAL_JUDGE:
${JSON.stringify(judge, null, 2)}

Produce evidence JSON exactly:
{
  "summary": string,                  // one sentence executive summary
  "modelChain": ["FLUX.2","ST3GG","MiniCPM-V","Nemotron"],
  "provenance": {
    "generator": "FLUX.2 Klein (via z-ai images.generations)",
    "safetyModel": "ST3GG (via z-ai chat completions)",
    "judgeModel": "MiniCPM-V 2.6 (via z-ai vision)",
    "aggregator": "Nemotron-Nano (via z-ai chat completions)"
  },
  "finalVerdict": "approved"|"rejected"|"needs_review",
  "confidence": number,               // 0-100
  "keyFindings": string[],            // 3-5 bullets
  "recommendations": string[],        // 1-3 next-step suggestions
  "riskProfile": {
    "contentRisk": "low"|"medium"|"high",
    "qualityRisk": "low"|"medium"|"high",
    "overallRisk": "low"|"medium"|"high"
  },
  "metrics": {
    "safetyScore": number,
    "overallScore": number,
    "promptAdherence": number,
    "aestheticScore": number
  }
}`;

  // Try Modal brain first, fall through to z-ai
  const brainMessagesNem: BrainChatMessage[] = [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
  let raw = "";
  if (isBrainEndpointConfigured()) {
    const brainResult = await callModalBrain(brainMessagesNem, { temperature: 0.3 });
    if (brainResult) {
      raw = brainResult.content;
    }
  }
  if (!raw) {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: sys },
        { role: "user", content: user },
      ],
      thinking: { type: "disabled" },
    });
    raw = completion.choices?.[0]?.message?.content ?? "";
  }

  const evidence = (extractJson(raw) ?? { rawResponse: raw }) as Record<string, unknown>;

  return { evidence, ms: elapsed(start) };
}

// ----------------------------------------------------------------------------
// Full pipeline orchestration
// ----------------------------------------------------------------------------
export interface PipelineRunInput {
  prompt: string;
  style: string;
  aspect: string;
  wardrobe: string | null;
  // v3
  calibrationId: string;
  calibrationOverrides?: Record<string, unknown>;
  loraIds: string[];
  loraWeights?: Record<string, number>;
  consentFingerprint?: string;
  // v4
  engineId?: string;
  brainId?: string;
  videoEnabled?: boolean;
  // M3: artistic-override — lowers minSafetyScore for artistic/editorial work.
  // The hard blocklist (csam, nonconsensual, real-person, etc.) is ALWAYS enforced.
  artisticOverride?: boolean;
  // Task 15: per-request Modal GPU opt-in. The route handler applies this as
  // a temporary MODAL_USE=true env override before calling runPipeline; this
  // field is carried through for provenance/logging only — stageFlux reads
  // isModalEnabled() (which reads the env var) at call time.
  modalBoost?: boolean;
}

// v5: async job progress reporting. The pipeline worker passes an onProgress
// callback that updates the PipelineJob row after each stage boundary, so the
// frontend's poll loop can render live stage transitions.
export type StageName = "st3gg" | "flux" | "judge" | "nemotron" | "output";
export type StageState = "running" | "done" | "error" | "skipped";
export interface StageProgress {
  status: StageState;
  ms?: number;
  message?: string;
}
export type ProgressCallback = (stage: StageName, progress: StageProgress) => void;

export interface PipelineRunOutput {
  id: string;
  status: "completed" | "failed" | "blocked";
  imagePath: string | null;
  safety: SafetyResult | null;
  judge: JudgeResult | null;
  evidence: Record<string, unknown> | null;
  timings: TimingMap;
  verdict: string | null;
  overallScore: number | null;
  // v3
  calibration: ResolvedCalibration | null;
  loraIds: string[];
  maturityTier: MaturityTier | null;
  blockReason: string | null;
  errorMessage: string | null;
  // v4: engine + backend provenance
  engineId: string | null;
  backend: "modal" | "zai" | null;
  backendMismatch: boolean;
}

// Quick heuristic: does the prompt text itself signal mature intent?
// (The authoritative gate is the ST3GG scan; this is a cheap pre-filter for
// logging and the mature-signal path in resolveMaturityTier.)
const MATURE_SIGNAL_RE = /\b(nude|nudity|nsfw|explicit|18\+|adult|mature|erotic|lingerie|undress|topless|bottomless)\b/i;
function promptHasMatureSignal(prompt: string): boolean {
  return MATURE_SIGNAL_RE.test(prompt);
}

export async function runPipeline(
  input: PipelineRunInput,
  onProgress?: ProgressCallback
): Promise<PipelineRunOutput> {
  const progress = (stage: StageName, p: StageProgress) => {
    try { onProgress?.(stage, p); } catch { /* never let progress reporting fail the pipeline */ }
  };
  const timings: TimingMap = {};
  const promptStart = nowMs();

  // Resolve calibration up-front (so even a blocked run records what was intended).
  const calibration = resolveCalibration(
    input.calibrationId,
    input.calibrationOverrides as Partial<CalibrationPreset> | undefined
  );

  // 0. create the Generation row (pending) with calibration + lora provenance
  const gen = await db.generation.create({
    data: {
      prompt: input.prompt,
      style: input.style,
      aspect: input.aspect,
      wardrobe: input.wardrobe,
      size: isSupportedSize(calibration.resolution) ? calibration.resolution : sizeForAspect(input.aspect),
      status: "running",
      calibrationId: input.calibrationId,
      calibration: JSON.stringify(calibration),
      loraIds: input.loraIds.join(","),
    },
  });
  await logEvent("pipeline_start", `Pipeline started for "${truncate(input.prompt, 60)}" · engine=${input.engineId ?? "flux2-klein-9b"} preset=${input.calibrationId} brain=${input.brainId ?? "gemma4"} loras=${input.loraIds.length}${input.videoEnabled ? " +video" : ""}`, "info", gen.id);

  try {
    // Stage: ST3GG safety scan — RUN FIRST so blocked prompts never reach the GPU.
    progress("st3gg", { status: "running", message: "ST3GG scanning prompt for safety…" });
    const safety = await stageSt3gg(input.prompt, input.style, input.wardrobe, input.brainId);
    progress("st3gg", { status: "done", ms: safety.stageMs, message: `${safety.riskLevel} risk · score ${safety.score}` });
    timings.st3gg = safety.stageMs;
    await db.safetyScan.create({
      data: {
        generationId: gen.id,
        passed: safety.passed,
        score: safety.score,
        riskLevel: safety.riskLevel,
        flags: JSON.stringify(safety.flags),
        rationale: safety.rationale,
        stageMs: safety.stageMs,
      },
    });
    await logEvent(
      "stage_complete",
      `ST3GG safety scan: ${safety.riskLevel} (score ${safety.score}) flags=[${safety.flags.join(",")}]`,
      safety.passed ? "success" : "warn",
      gen.id
    );

    // Maturity gate: resolve the tier from consent + policy + flags.
    const policy = await getActivePolicy();
    let consentStatus: "accepted" | "rejected" | "pending" | "revoked" | null = "pending";
    if (input.consentFingerprint) {
      const consent = await getConsent(input.consentFingerprint);
      consentStatus = (consent?.status as "accepted" | "rejected" | "pending" | "revoked" | null) ?? "pending";
    }
    const matureSignal = promptHasMatureSignal(input.prompt);
    const tier = resolveMaturityTier({
      consentStatus,
      policy,
      safetyFlags: safety.flags,
      promptHasMatureSignal: matureSignal,
    });

    // Enforce min safety score as a secondary gate.
    // M3: artistic-override lowers the effective min score to 30 (from 60 default)
    // for artistic/editorial work. The HARD blocklist always applies — only the
    // tunable min-score threshold is relaxed.
    const effectiveMinScore = input.artisticOverride ? Math.min(30, policy.minSafetyScore) : policy.minSafetyScore;
    const belowMinScore = safety.score < effectiveMinScore && safety.riskLevel !== "safe";

    if (tier === "blocked" || belowMinScore) {
      const blockReason = tier === "blocked"
        ? `Maturity gate blocked this request (tier=blocked). Flags: ${safety.flags.join(",") || "none"}. Mature-enabled=${policy.matureEnabled}, consent=${consentStatus}.`
        : `Safety score ${safety.score} below minimum ${effectiveMinScore}${input.artisticOverride ? " (artistic override applied)" : ""} (risk ${safety.riskLevel}).`;
      await db.generation.update({
        where: { id: gen.id },
        data: {
          status: "failed",
          verdict: "rejected",
          maturityTier: tier,
          timings: JSON.stringify(timings),
          errorMessage: blockReason,
        },
      });
      await logEvent("policy_block", blockReason, "error", gen.id);
      timings.output = elapsed(promptStart) - (timings.st3gg ?? 0);
      if (timings.output < 0) timings.output = 0;
      // Mark all downstream stages as skipped (blocked by policy)
      progress("flux", { status: "skipped", message: "Skipped — blocked by policy" });
      progress("judge", { status: "skipped", message: "Skipped — blocked by policy" });
      progress("nemotron", { status: "skipped", message: "Skipped — blocked by policy" });
      progress("output", { status: "done", ms: 1, message: "Blocked — no image generated" });
      return {
        id: gen.id,
        status: "blocked",
        imagePath: null,
        safety,
        judge: null,
        evidence: null,
        timings,
        verdict: "rejected",
        overallScore: null,
        calibration,
        loraIds: input.loraIds,
        maturityTier: tier,
        blockReason,
        errorMessage: blockReason,
        engineId: input.engineId ?? null,
        backend: null,
        backendMismatch: false,
      };
    }

    // Stage: FLUX image generation (Modal H100 or z-ai fallback) with calibration
    progress("flux", { status: "running", message: "Modal FLUX.2 generating on L40S GPU…" });
    const flux = await stageFlux(input.prompt, input.style, input.aspect, input.wardrobe, gen.id, calibration, input.loraIds, input.loraWeights ?? {}, input.engineId);
    progress("flux", { status: "done", ms: flux.ms, message: `Image rendered via ${flux.backend}` });
    timings.flux = flux.ms;
    await db.generation.update({
      where: { id: gen.id },
      data: { imagePath: flux.imagePath, imageData: flux.imageBase64, maturityTier: tier },
    });
    await logEvent(
      "stage_complete",
      `FLUX image generated via ${flux.backend.toUpperCase()} (${flux.ms}ms) · tier=${tier}`,
      "success",
      gen.id
    );

    // Stage: MiniCPM-V visual judge
    progress("judge", { status: "running", message: "Visual judge analyzing generated image…" });
    const judge = await stageJudge(flux.imagePath, input.prompt, input.style, input.wardrobe, input.brainId);
    progress("judge", { status: "done", ms: judge.stageMs, message: `${judge.verdict} · ${judge.overallScore}` });
    timings.judge = judge.stageMs;
    await db.judgeReport.create({
      data: {
        generationId: gen.id,
        promptAdherence: judge.promptAdherence,
        visualQuality: judge.visualQuality,
        aestheticScore: judge.aestheticScore,
        safetyScore: judge.safetyScore,
        wardrobeMatch: judge.wardrobeMatch,
        overallScore: judge.overallScore,
        verdict: judge.verdict,
        observations: JSON.stringify(judge.observations),
        strengths: JSON.stringify(judge.strengths),
        weaknesses: JSON.stringify(judge.weaknesses),
        stageMs: judge.stageMs,
      },
    });
    await logEvent(
      "stage_complete",
      `MiniCPM-V judged: ${judge.verdict} (overall ${judge.overallScore})`,
      judge.verdict === "approved" ? "success" : judge.verdict === "rejected" ? "warn" : "info",
      gen.id
    );

    // Stage: Nemotron evidence parse
    progress("nemotron", { status: "running", message: "Nemotron structuring evidence…" });
    const nem = await stageNemotron(input.prompt, input.style, input.aspect, input.wardrobe, safety, judge, input.brainId);
    progress("nemotron", { status: "done", ms: nem.ms, message: "Evidence structured" });
    timings.nemotron = nem.ms;
    await logEvent("stage_complete", `Nemotron structured evidence parsed (${nem.ms}ms)`, "success", gen.id);

    timings.prompt = elapsed(promptStart) - (timings.flux + timings.st3gg + timings.judge + timings.nemotron);
    if (timings.prompt < 0) timings.prompt = 0;
    timings.output = 1;

    await db.generation.update({
      where: { id: gen.id },
      data: {
        status: "completed",
        verdict: judge.verdict,
        overallScore: judge.overallScore,
        evidence: JSON.stringify(nem.evidence),
        timings: JSON.stringify(timings),
      },
    });
    await logEvent(
      "pipeline_complete",
      `Pipeline complete — verdict: ${judge.verdict}, score: ${judge.overallScore}, tier: ${tier}`,
      "success",
      gen.id
    );

    progress("output", { status: "done", ms: 1, message: "Persisted to gallery" });

    return {
      id: gen.id,
      status: "completed",
      imagePath: `/api/image/${gen.id}`, // DB-backed URL — survives dev server restarts
      safety,
      judge,
      evidence: nem.evidence,
      timings,
      verdict: judge.verdict,
      overallScore: judge.overallScore,
      calibration,
      loraIds: input.loraIds,
      maturityTier: tier,
      blockReason: null,
      errorMessage: null,
      engineId: flux.engineId,
      backend: flux.backend,
      backendMismatch: flux.backendMismatch,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    timings.output = elapsed(promptStart);
    // Report the error to the most likely stage based on which timings have been set.
    const failedStage: StageName =
      !timings.flux ? "flux" :
      !timings.judge ? "judge" :
      !timings.nemotron ? "nemotron" :
      "output";
    progress(failedStage, { status: "error", message: message.slice(0, 200) });
    await db.generation.update({
      where: { id: gen.id },
      data: {
        status: "failed",
        timings: JSON.stringify(timings),
        errorMessage: message,
      },
    });
    await logEvent("error", `Pipeline failed: ${truncate(message, 200)}`, "error", gen.id);
    return {
      id: gen.id,
      status: "failed",
      imagePath: null,
      safety: null,
      judge: null,
      evidence: null,
      timings,
      verdict: null,
      overallScore: null,
      calibration,
      loraIds: input.loraIds,
      maturityTier: null,
      blockReason: null,
      errorMessage: message,
      engineId: input.engineId ?? null,
      backend: null,
      backendMismatch: false,
    };
  }
}

export async function logEvent(
  kind: string,
  message: string,
  severity: "info" | "warn" | "error" | "success" = "info",
  generationId: string | null = null,
  meta: Record<string, unknown> | null = null
) {
  try {
    await db.auditEvent.create({
      data: {
        kind,
        message,
        severity,
        generationId,
        meta: meta ? JSON.stringify(meta) : null,
      },
    });
  } catch {
    // never let logging fail the pipeline
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
