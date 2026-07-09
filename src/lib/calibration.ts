// NEXUS Visual Weaver v4 — Multi-Engine Calibration Engine
// ---------------------------------------------------------------------------
// Studio-level quality presets for the multi-engine catalog (FLUX.2 9B, Krea 2,
// Z-Image, Ideogram 4, Kontext, Qwen Edit, Wan 2.2, LTX 2.3, ...).
// Grounded in a VLM-grounded LORA-vs-Grok baseline comparison.
//
// KEY FINDINGS (VLM review of 4 LoRA attempts vs the Grok baseline):
//   1. DENOISE STRENGTH: LoRA attempts used 0.6-0.7; the Grok baseline lands at
//      0.8-0.9. Low denoise destroys fine detail (hair, skin texture).
//   2. CFG / GUIDANCE SCALE: LoRA attempts used 7-8; baseline uses 9-10. Low
//      CFG weakens prompt adherence and flattens dynamic lighting.
//   3. SAMPLER / RESOLUTION: LoRA attempts used Euler-a @ 512; baseline uses
//      DPM++ 2M @ 1024+. Wrong sampler + low res = compression artifacts.
//
// Every preset encodes the corrected values + targets a specific engine.
// Two execution backends consume these presets:
//   • Modal H100 (real diffusion): receives steps, cfg, sampler, denoise as
//     real params. Full control.
//   • z-ai images.generations (fallback): only accepts prompt + size. The
//     preset's `qualityTokens` are injected into the prompt and `resolution`
//     sets the size. steps/cfg/sampler are recorded as provenance metadata.
// ---------------------------------------------------------------------------

import type { Engine } from "@/lib/engines";

export type FluxModel =
  | "FLUX.1-schnell"
  | "FLUX.1-dev"
  | "FLUX.1-kontext-dev"
  | "FLUX.2-klein-9B"
  | "FLUX.2-dev"
  | "Krea-2-Turbo"
  | "Krea-2-Raw"
  | "Z-Image-Turbo"
  | "Ideogram-4"
  | "Qwen-Image-Edit-2511"
  | "Wan-2.2"
  | "LTX-2.3";

export type FluxSampler =
  | "dpmpp_2m"
  | "dpmpp_2m_sde"
  | "euler"
  | "euler_a"
  | "uni_pc";

export type FluxScheduler =
  | "simple"
  | "karras"
  | "exponential"
  | "sgm_uniform";

export interface CalibrationPreset {
  id: string;
  name: string;
  category: "draft" | "quality" | "cinematic" | "portrait" | "illustration" | "concept" | "video" | "edit";
  description: string;
  // which engine this preset targets (references engines.ts)
  engineId: string;
  model: FluxModel;
  steps: number;
  cfg: number;            // guidance scale
  sampler: FluxSampler;
  scheduler: FluxScheduler;
  denoise: number;        // 0..1 — strength for img2img / refiner pass
  resolution: string;     // WxH base resolution
  loraWeight: number;     // default weight 0..1 for applied LoRAs
  refinerPass: boolean;   // whether to run a second refiner pass
  variationStrength: number; // 0.0-0.3 — latent noise injection for creative variation
  // tokens appended to the prompt for the z-ai backend (which has no step/cfg knobs)
  qualityTokens: string[];
  // expected wall-clock on a warm Modal H100
  estWarmMs: number;
  tag: string;
}

export const CALIBRATION_PRESETS: CalibrationPreset[] = [
  {
    id: "studio-draft",
    name: "Studio Draft",
    category: "draft",
    description:
      "Fast 4-step preview for iteration. Uses schnell defaults — good for composition checks, not final quality.",
    engineId: "flux2-klein-9b",
    model: "FLUX.2-klein-9B",
    steps: 4,
    cfg: 1.0,
    sampler: "euler",
    scheduler: "simple",
    denoise: 0.85,
    resolution: "1024x1024",
    loraWeight: 0.45,
    refinerPass: false,
    variationStrength: 0.10,
    qualityTokens: ["sharp focus", "high detail", "professional composition"],
    estWarmMs: 1800,
    tag: "~2s · iteration",
  },
  {
    id: "studio-quality",
    name: "Studio Quality",
    category: "quality",
    description:
      "Calibrated baseline that closes the gap to the Grok reference. High CFG, DPM++ 2M, 1024+ — the recommended default for delivery.",
    engineId: "flux2-klein-9b",
    model: "FLUX.2-klein-9B",
    steps: 4,
    cfg: 1.0,
    sampler: "euler",
    scheduler: "simple",
    denoise: 0.88,
    resolution: "1024x1024",
    loraWeight: 0.45,
    refinerPass: false,
    variationStrength: 0.10,
    qualityTokens: [
      "ultra detailed",
      "sharp focus",
      "professional composition",
      "high dynamic range",
      "studio lighting",
    ],
    estWarmMs: 2600,
    tag: "★ recommended",
  },
  {
    id: "cinematic-grade",
    name: "Cinematic Grade",
    category: "cinematic",
    description:
      "Film-still aesthetic with strong dynamic lighting. Adds a refiner pass for tonal depth. Pairs with the CINEMATIC LoRA.",
    engineId: "flux2-dev",
    model: "FLUX.2-klein-9B",
    steps: 4,
    cfg: 1.0,
    sampler: "euler",
    scheduler: "simple",
    denoise: 0.9,
    resolution: "1344x768",
    loraWeight: 0.40,
    refinerPass: true,
    variationStrength: 0.15,
    qualityTokens: [
      "cinematic film still",
      "dramatic volumetric lighting",
      "anamorphic lens",
      "shallow depth of field",
      "teal and orange grade",
      "ultra detailed",
    ],
    estWarmMs: 5200,
    tag: "film · refiner",
  },
  {
    id: "photoreal-portrait",
    name: "Photoreal Portrait",
    category: "portrait",
    description:
      "Skin-accurate portraiture. Targets the Grok baseline's natural skin tones and micro-detail. Use with FaceControl/PhotoStyle LoRAs.",
    engineId: "flux2-dev",
    model: "FLUX.2-klein-9B",
    steps: 4,
    cfg: 1.0,
    sampler: "euler",
    scheduler: "simple",
    denoise: 0.9,
    resolution: "864x1152",
    loraWeight: 0.40,
    refinerPass: true,
    variationStrength: 0.15,
    qualityTokens: [
      "photorealistic",
      "natural skin texture",
      "subsurface scattering",
      "85mm portrait lens",
      "soft rim light",
      "ultra detailed pores",
      "accurate color science",
    ],
    estWarmMs: 5800,
    tag: "portrait · refiner",
  },
  {
    id: "anime-illustration",
    name: "Anime / Illustration",
    category: "illustration",
    description:
      "Clean linework and flat color blocks. Lower denoise preserves the LoRA's stylistic intent without over-blending.",
    engineId: "flux2-klein-9b",
    model: "FLUX.2-klein-9B",
    steps: 4,
    cfg: 1.0,
    sampler: "euler",
    scheduler: "simple",
    denoise: 0.8,
    resolution: "1024x1024",
    loraWeight: 0.50,
    refinerPass: false,
    variationStrength: 0.10,
    qualityTokens: [
      "anime key visual",
      "clean linework",
      "cel shading",
      "vibrant flat color",
      "high detail",
    ],
    estWarmMs: 2400,
    tag: "illustration",
  },
  {
    id: "concept-art",
    name: "Concept Art",
    category: "concept",
    description:
      "Painterly concept-art look with broad strokes and atmospheric depth. Wide aspect for environment shots.",
    engineId: "flux2-dev",
    model: "FLUX.2-klein-9B",
    steps: 4,
    cfg: 1.0,
    sampler: "euler",
    scheduler: "exponential",
    denoise: 0.87,
    resolution: "1344x768",
    loraWeight: 0.40,
    refinerPass: false,
    variationStrength: 0.10,
    qualityTokens: [
      "concept art",
      "painterly brushwork",
      "atmospheric perspective",
      "matte painting",
      "ultra detailed",
    ],
    estWarmMs: 4600,
    tag: "concept · wide",
  },
  // ── Krea 2 Turbo presets (trending) ──────────────────────────────
  {
    id: "krea2-turbo-fast",
    name: "Krea 2 Turbo · Fast",
    category: "quality",
    description:
      "Krea 2 Turbo at 6 steps. The most-loved trending model for fast realistic iteration. Pairs with Krea Realism LoRA.",
    engineId: "krea-2-turbo",
    model: "Krea-2-Turbo",
    steps: 4,
    cfg: 7.5,
    sampler: "euler",
    scheduler: "simple",
    denoise: 0.85,
    resolution: "1024x1024",
    loraWeight: 0.45,
    refinerPass: false,
    variationStrength: 0.10,
    qualityTokens: ["photorealistic", "ultra detailed", "natural lighting", "sharp focus", "high dynamic range"],
    estWarmMs: 1600,
    tag: "★ trending",
  },
  {
    id: "krea2-raw-portrait",
    name: "Krea 2 Raw · Portrait",
    category: "portrait",
    description:
      "Krea 2 Raw base for unprocessed photoreal portraiture. Best skin/texture fidelity before stylistic LoRAs.",
    engineId: "krea-2-raw",
    model: "Krea-2-Raw",
    steps: 4,
    cfg: 7.0,
    sampler: "euler",
    scheduler: "simple",
    denoise: 0.86,
    resolution: "832x1216",
    loraWeight: 0.408,
    refinerPass: false,
    variationStrength: 0.10,
    qualityTokens: ["raw photorealistic", "natural skin texture", "85mm portrait", "subsurface scattering", "no makeup filter"],
    estWarmMs: 2400,
    tag: "raw · portrait",
  },
  // ── Z-Image Turbo presets (fastest) ─────────────────────────────
  {
    id: "zimage-turbo-blink",
    name: "Z-Image Turbo · Blink",
    category: "draft",
    description:
      "Z-Image Turbo at 4 steps — the fastest composition engine in the catalog. Alibaba-pai Fun distill LoRA for extra speed.",
    engineId: "z-image-turbo",
    model: "Z-Image-Turbo",
    steps: 4,
    cfg: 6.0,
    sampler: "euler",
    scheduler: "simple",
    denoise: 0.85,
    resolution: "1024x1024",
    loraWeight: 0.40,
    refinerPass: false,
    variationStrength: 0.10,
    qualityTokens: ["ultra detailed", "sharp focus", "professional composition"],
    estWarmMs: 1200,
    tag: "⚡ fastest",
  },
  // ── Video presets (Wan 2.2 / LTX 2.3) ───────────────────────────
  {
    id: "wan22-i2v-lightning",
    name: "Wan 2.2 I2V · Lightning",
    category: "video",
    description:
      "Wan 2.2 image-to-video with the lightx2v Lightning distill LoRA. 4-step video generation. Primary I2V engine.",
    engineId: "wan-2.2",
    model: "Wan-2.2",
    steps: 4,
    cfg: 6.0,
    sampler: "uni_pc",
    scheduler: "simple",
    denoise: 1.0,
    resolution: "832x480",
    loraWeight: 0.5,
    refinerPass: false,
    variationStrength: 0.10,
    qualityTokens: ["cinematic motion", "stable temporal coherence", "high quality video"],
    estWarmMs: 18000,
    tag: "video · I2V",
  },
  {
    id: "ltx23-control-motion",
    name: "LTX 2.3 · Control Motion",
    category: "video",
    description:
      "LTX 2.3 with Pose Control + Motion Track IC-LoRAs. The control-rich video engine for precise camera + subject motion.",
    engineId: "ltx-2.3",
    model: "LTX-2.3",
    steps: 4,
    cfg: 4.0,
    sampler: "euler",
    scheduler: "simple",
    denoise: 1.0,
    resolution: "768x512",
    loraWeight: 0.62,
    refinerPass: false,
    variationStrength: 0.10,
    qualityTokens: ["smooth motion", "camera tracking", "high temporal coherence"],
    estWarmMs: 12000,
    tag: "video · control",
  },
];

export const DEFAULT_CALIBRATION_ID = "studio-quality";

export function getPreset(id: string | null | undefined): CalibrationPreset {
  if (!id) return CALIBRATION_PRESETS[1];
  return CALIBRATION_PRESETS.find((p) => p.id === id) ?? CALIBRATION_PRESETS[1];
}

export function presetCategoryLabel(c: CalibrationPreset["category"]): string {
  switch (c) {
    case "draft": return "Draft";
    case "quality": return "Quality";
    case "cinematic": return "Cinematic";
    case "portrait": return "Portrait";
    case "illustration": return "Illustration";
    case "concept": return "Concept";
    case "video": return "Video";
    case "edit": return "Edit";
  }
}

// Resolve the effective generation params for a run, merging a preset with
// any per-run overrides the user applied in the studio.
export interface ResolvedCalibration {
  presetId: string;
  engineId: string;
  model: FluxModel;
  steps: number;
  cfg: number;
  sampler: FluxSampler;
  scheduler: FluxScheduler;
  denoise: number;
  resolution: string;
  loraWeight: number;
  refinerPass: boolean;
  qualityTokens: string[];
  appliedOverrides: string[];
}

export function resolveCalibration(
  presetId: string,
  overrides?: Partial<CalibrationPreset>
): ResolvedCalibration {
  const base = getPreset(presetId);
  const applied: string[] = [];
  const merged: CalibrationPreset = { ...base };
  if (overrides) {
    for (const k of Object.keys(overrides) as (keyof CalibrationPreset)[]) {
      const v = overrides[k];
      if (v !== undefined && v !== base[k]) {
        (merged as unknown as Record<string, unknown>)[k] = v;
        applied.push(`${k}: ${String(base[k])} → ${String(v)}`);
      }
    }
  }
  return {
    presetId: merged.id,
    engineId: merged.engineId,
    model: merged.model,
    steps: merged.steps,
    cfg: merged.cfg,
    sampler: merged.sampler,
    scheduler: merged.scheduler,
    denoise: merged.denoise,
    resolution: merged.resolution,
    loraWeight: merged.loraWeight,
    refinerPass: merged.refinerPass,
    qualityTokens: merged.qualityTokens,
    appliedOverrides: applied,
  };
}

// Return presets compatible with a given engine (by engineId or family match).
export function presetsForEngine(engineId: string): CalibrationPreset[] {
  return CALIBRATION_PRESETS.filter((p) => p.engineId === engineId);
}

// Suppress unused-import warning for the Engine type (kept for future
// engine↔preset cross-validation).
export type { Engine };
