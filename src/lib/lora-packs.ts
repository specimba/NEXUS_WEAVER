// NEXUS Visual Weaver — ComfyUI-style Workflow Packs
// ---------------------------------------------------------------------------
// A "pack" = ComfyUI-style bundle: base engine + calibration preset + LoRA
// stack (with per-LoRA role + weight + advice) + prompt template + bestFor /
// avoidFor + description. The PacksView renders these as one-click cards that
// batch-apply the full configuration to the Studio via `applyPack(packId)` in
// the nexus store.
//
// COMPATIBILITY: this `LoraPack` interface is structurally aligned with the
// existing `AEONWorkflowPreset` (src/types/aeon.ts). Field mapping:
//   • LoraPack.name        ↔ AEONWorkflowPreset.label
//   • LoraPack.engineId    ↔ AEONWorkflowPreset.engineConfig.engine
//   • LoraPack.promptTemplate ↔ AEONWorkflowPreset.examplePrompt
//   • LoraPack.loras[i].{loraId, role, weight, notes}
//                         ↔ AEONWorkflowPreset.loras[i].{loraId, role, weight, notes}
// We deliberately diverge on `engineId`/`calibrationId` (flat strings vs. the
// nested engineConfig object) so the store can wire them directly into the
// multi-engine + multi-calibration state.
//
// RULE #5 COMPLIANCE (AGENTS.md):
//   • Every per-LoRA weight in every pack is ≤ 0.5.
//   • Most packs use ≤ 3 LoRAs. The few that use 3 LoRAs sit at the
//     recommended ceiling — applying them is safe.
//
// All LoRA IDs referenced below were verified to exist in
// src/lib/lora-library.ts (80 entries). Engine IDs verified in
// src/lib/engines.ts. Calibration IDs verified in src/lib/calibration.ts.
// ---------------------------------------------------------------------------

export type LoraPackSource = "aeon" | "curated" | "civitai" | "hf" | "user";

export interface LoraPackLoRA {
  loraId: string;
  role: string;
  weight: number; // ≤ 0.5 (rule #5)
  notes?: string;
}

export interface LoraPack {
  id: string;
  name: string;
  description: string;
  source: LoraPackSource;
  engineId: string;
  calibrationId?: string;
  loras: LoraPackLoRA[];
  promptTemplate?: string;
  bestFor: string[];
  avoidFor: string[];
  mature: boolean;
  /** Visual marker — we have no image-gen for pack thumbnails. */
  thumbnailEmoji?: string;
}

export const LORA_PACKS: LoraPack[] = [
  // ════════════════════════════════════════════════════════════════════════
  // AEON CANONICAL PRESETS — ported from the fallback fixture in
  // src/app/api/aeon/workflow-advice/route.ts (lines 83-178). LoRA IDs
  // normalised to the real entries in lora-library.ts:
  //   • "analog-photography-klein9b" → agbr-analog
  //   • "cinematic-film-still-klein9b" → agbr-cinematic
  // Weights already satisfied rule #5 in the original fixture (0.35-0.50).
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "flux2_high_end_editorial",
    name: "High-End Editorial Portrait",
    description:
      "Single-subject fashion/editorial portraits with strong wardrobe adherence, shallow depth of field, and cinematic lighting. Best for high-fashion magazine work; avoid for large crowds or tiny props. Pair with the Wardrobe field for garment-accurate renders.",
    source: "aeon",
    engineId: "flux2-klein-9b",
    calibrationId: "studio-draft",
    loras: [
      {
        loraId: "no8d-photostyle",
        role: "style",
        weight: 0.45,
        notes: "Core photographic rendering; improves skin, fabrics, and contrast.",
      },
      {
        loraId: "agbr-analog",
        role: "style",
        weight: 0.4,
        notes: "Adds analog depth and film-like tonal rolloff.",
      },
      {
        loraId: "agbr-cinematic",
        role: "style",
        weight: 0.4,
        notes: "Encodes film-still framing and color grading.",
      },
    ],
    promptTemplate:
      "Ultra photorealistic luxury fashion editorial portrait in a grand interior, single model, sharp facial features, dramatic rim light and soft fill, clean background separation.",
    bestFor: ["single-subject editorial fashion", "wardrobe-heavy prompts", "cinematic interiors"],
    avoidFor: ["large crowds", "small intricate props"],
    mature: false,
    thumbnailEmoji: "📸",
  },
  {
    id: "flux2_commercial_fashion_ad",
    name: "Commercial Fashion Ad",
    description:
      "Clean, high-contrast commercial fashion images suitable for ads and lookbooks. Best for product-focused fashion and simple backgrounds; avoid for heavily stylized cinematic scenes. Pair with a single LoRA stack — over-stacking flattens the commercial clarity.",
    source: "aeon",
    engineId: "flux2-klein-9b",
    calibrationId: "studio-quality",
    loras: [
      {
        loraId: "no8d-photostyle",
        role: "style",
        weight: 0.4,
        notes: "Keeps skin and materials realistic while preserving brand-safe clarity.",
      },
    ],
    promptTemplate:
      "Clean commercial fashion ad shot, studio lighting, single model, branded apparel, white seamless background, sharp focus on garment detail.",
    bestFor: ["product-focused fashion", "lookbook shots", "simple backgrounds"],
    avoidFor: ["heavily stylized cinematic scenes"],
    mature: false,
    thumbnailEmoji: "👔",
  },
  {
    id: "flux2_cinematic_concept_frame",
    name: "Cinematic Concept Frame",
    description:
      "Wide, cinematic frames for concept art and narrative fashion scenes. Best for storytelling compositions; avoid for tight headshots or micro-product details. Pair with the 16:9 aspect ratio for full cinematic framing.",
    source: "aeon",
    engineId: "flux2-klein-9b",
    calibrationId: "studio-draft",
    loras: [
      {
        loraId: "agbr-cinematic",
        role: "style",
        weight: 0.5,
        notes: "Primary cinematic driver — color grade + framing.",
      },
      {
        loraId: "agbr-analog",
        role: "style",
        weight: 0.35,
        notes: "Adds subtle grain and depth without overpowering the cinematic grade.",
      },
    ],
    promptTemplate:
      "Wide cinematic frame, lone figure in a rain-soaked alley at night, neon signage reflected in puddles, volumetric god rays, anamorphic lens flare, film grain.",
    bestFor: ["wide cinematic scenes", "narrative fashion storytelling"],
    avoidFor: ["tight headshots", "micro-product details"],
    mature: false,
    thumbnailEmoji: "🎬",
  },

  // ════════════════════════════════════════════════════════════════════════
  // CURATED PACKS — 7 new packs covering diverse use-cases across the
  // multi-engine catalog. Every per-LoRA weight is ≤0.5 (rule #5).
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "flux2_editorial_fashion",
    name: "Editorial Fashion FLUX.2",
    description:
      "Magazine-cover editorial portraiture with identity lock, soft window light, and a controlled focal length. Best for couture editorials and model portfolio shots; avoid for group frames (the face-swap LoRA is single-subject). Pair with the 4:3 aspect ratio and a structured Wardrobe field.",
    source: "curated",
    engineId: "flux2-klein-9b",
    calibrationId: "studio-quality",
    loras: [
      {
        loraId: "no8d-photostyle",
        role: "style",
        weight: 0.45,
        notes: "Anchors the photographic look — skin, fabric, contrast.",
      },
      {
        loraId: "bfs-face-swap",
        role: "face_control",
        weight: 0.35,
        notes: "Locks subject identity. Requires a consented reference image.",
      },
      {
        loraId: "nkd-focal",
        role: "light",
        weight: 0.3,
        notes: "Dial toward 85mm for portrait compression.",
      },
    ],
    promptTemplate:
      "Editorial fashion magazine cover, single model in couture gown, soft window light, shallow depth of field, 85mm lens, elegant pose, refined color palette.",
    bestFor: ["editorial portraiture", "fashion magazine covers", "model portfolio shots"],
    avoidFor: ["group shots", "scenery-only frames"],
    mature: false,
    thumbnailEmoji: "👗",
  },
  {
    id: "flux2_cinematic_concept",
    name: "Cinematic Concept FLUX.2",
    description:
      "Narrative concept frames with cinematic color grade, regional light placement, and an 80s-90s cult-film undertone. Best for music video stills and concept frames; avoid for product shots and flat backgrounds. Pair with directional light prompts (key from left, fill from right).",
    source: "curated",
    engineId: "flux2-klein-9b",
    calibrationId: "studio-draft",
    loras: [
      {
        loraId: "agbr-cinematic",
        role: "style",
        weight: 0.45,
        notes: "Primary cinematic grade + framing.",
      },
      {
        loraId: "no8d-8090-cult-film",
        role: "style",
        weight: 0.35,
        notes: "Adds the retro cult-film aesthetic — warm blacks, halation.",
      },
      {
        loraId: "no8d-lightcontrol",
        role: "light",
        weight: 0.3,
        notes: "Regional light placement for dramatic key/fill.",
      },
    ],
    promptTemplate:
      "Cinematic concept frame, dramatic side lighting, deep shadows, teal-orange grade, character in period costume, smoke and atmosphere, anamorphic framing.",
    bestFor: ["concept frames", "narrative scenes", "music video stills"],
    avoidFor: ["product shots", "flat backgrounds"],
    mature: false,
    thumbnailEmoji: "🎥",
  },
  {
    id: "krea2_realism",
    name: "Krea 2 Realism",
    description:
      "Photorealistic Krea 2 stack tuned for golden-hour exteriors and natural skin texture. Best for lifestyle and outdoor portraiture; avoid for anime or illustration styles. Pair with the 4:3 aspect ratio and warm color prompts.",
    source: "curated",
    engineId: "krea-2-turbo",
    calibrationId: "krea2-turbo-fast",
    loras: [
      {
        loraId: "krea2-realism-gokay",
        role: "detailer",
        weight: 0.45,
        notes: "Boosts skin texture + micro-detail — the go-to realism anchor for Krea 2.",
      },
      {
        loraId: "krea2-moody-golden-hour",
        role: "style",
        weight: 0.35,
        notes: "Editorial golden-hour lighting with moody atmosphere.",
      },
    ],
    promptTemplate:
      "Photorealistic portrait at golden hour, warm directional sunlight, soft skin texture, shallow depth of field, natural bokeh, 50mm lens.",
    bestFor: ["realistic portraits", "golden-hour exteriors", "lifestyle photography"],
    avoidFor: ["anime/illustration styles", "abstract concepts"],
    mature: false,
    thumbnailEmoji: "🌅",
  },
  {
    id: "zimage_speedrun",
    name: "Z-Image Speedrun",
    description:
      "Fast iteration stack for Z-Image Turbo — distilled + realism boosters for batch exploration. Best for rapid drafts and previews; avoid for final hero shots (use a higher-quality engine for the final render). Pair with the Cost Lab to monitor step-count budget.",
    source: "curated",
    engineId: "z-image-turbo",
    calibrationId: "zimage-turbo-blink",
    loras: [
      {
        loraId: "zimage-lora-nphsi",
        role: "detailer",
        weight: 0.45,
        notes: "Most popular Z-Image LoRA — sharper details, better composition.",
      },
      {
        loraId: "zimage-fun-lora-distill",
        role: "detailer",
        weight: 0.3,
        notes: "Official Alibaba distill — fewer steps, maintained quality.",
      },
    ],
    promptTemplate:
      "Rapid preview of a cyberpunk city street at night, neon reflections, rain, atmospheric fog, dynamic composition.",
    bestFor: ["rapid iteration", "draft previews", "batch exploration"],
    avoidFor: ["final-quality hero shots", "fine art prints"],
    mature: false,
    thumbnailEmoji: "⚡",
  },
  {
    id: "flux2_anime_illustration",
    name: "Anime Illustration",
    description:
      "Clean anime key-visual stack with two complementary anime style LoRAs. Best for character design sheets and illustration commissions; avoid for photoreal portraits and product photography. Pair with the Anime style preset and 9:16 aspect for vertical key visuals.",
    source: "curated",
    engineId: "flux2-klein-9b",
    calibrationId: "anime-illustration",
    loras: [
      {
        loraId: "agbr-anime",
        role: "style",
        weight: 0.45,
        notes: "Clean anime key-visual style — primary aesthetic driver.",
      },
      {
        loraId: "artificialguybr-anime",
        role: "style",
        weight: 0.4,
        notes: "Secondary anime style adapter — adds cel-shading crispness.",
      },
    ],
    promptTemplate:
      "Anime key visual, character in dynamic pose, vibrant cel-shaded colors, dramatic lighting, detailed background, studio-grade illustration.",
    bestFor: ["anime key visuals", "character design sheets", "illustration commissions"],
    avoidFor: ["photoreal portraits", "product photography"],
    mature: false,
    thumbnailEmoji: "🎨",
  },
  {
    id: "flux2_analog_film",
    name: "Analog Film",
    description:
      "Vintage 35mm film stack — analog tonal rolloff, standalone grain, and an 80s-90s cult-film undertone. Best for retro portrait sessions and nostalgia-driven visuals; avoid for clinical product shots and clean commercial ads. Pair with the 4:3 aspect ratio for the classic photo-frame feel.",
    source: "curated",
    engineId: "flux2-klein-9b",
    calibrationId: "studio-draft",
    loras: [
      {
        loraId: "agbr-analog",
        role: "style",
        weight: 0.45,
        notes: "Analog film look — grain, halation, warm blacks.",
      },
      {
        loraId: "agbr-filmgrain",
        role: "style",
        weight: 0.3,
        notes: "Standalone grain texture LoRA for post-grade integration.",
      },
      {
        loraId: "no8d-8090-cult-film",
        role: "style",
        weight: 0.35,
        notes: "80s-90s cult-film aesthetic — retro cinematic undertone.",
      },
    ],
    promptTemplate:
      "Analog 35mm film photograph, grainy texture, warm faded tones, halation on highlights, candid street scene, 1970s aesthetic.",
    bestFor: ["vintage film aesthetics", "retro portrait sessions", "nostalgia-driven visuals"],
    avoidFor: ["clinical product shots", "clean commercial ads"],
    mature: false,
    thumbnailEmoji: "📼",
  },
  {
    id: "flux2_portrait_detail",
    name: "Portrait Detail",
    description:
      "High-fidelity portrait headshot stack — face-identity lock + photographic style + detail enhancement. Best for character identity locks and fine-skin-texture work; avoid for landscape scenes and abstract style experiments. Pair with a consented reference image for the FaceControl LoRA.",
    source: "curated",
    engineId: "flux2-klein-9b",
    calibrationId: "studio-quality",
    loras: [
      {
        loraId: "no8d-facecontrol",
        role: "face_control",
        weight: 0.45,
        notes: "Regional face-identity control — locks subject across generations.",
      },
      {
        loraId: "no8d-photostyle",
        role: "style",
        weight: 0.4,
        notes: "Photographic realism anchor — skin, fabric, contrast.",
      },
      {
        loraId: "dx8152-enhanced-details",
        role: "detailer",
        weight: 0.3,
        notes: "Detail enhancement pass — recovers fine texture (hair, pores).",
      },
    ],
    promptTemplate:
      "Ultra-detailed portrait headshot, sharp eye detail, natural skin pores, soft studio key light, hair strand definition, 100mm macro lens.",
    bestFor: ["high-detail portrait headshots", "character identity locks", "fine-skin-texture work"],
    avoidFor: ["landscape scenes", "abstract style experiments"],
    mature: false,
    thumbnailEmoji: "👁️",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getPack(id: string): LoraPack | undefined {
  return LORA_PACKS.find((p) => p.id === id);
}

/** Sum of all per-LoRA weights in a pack (informational — used by PacksView). */
export function packWeightSum(pack: LoraPack): number {
  return pack.loras.reduce((sum, l) => sum + l.weight, 0);
}
