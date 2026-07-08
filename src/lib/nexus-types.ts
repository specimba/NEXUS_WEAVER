// Shared domain types for NEXUS Visual Weaver pipeline

import { getEngine } from "@/lib/engines";
import { getBrain } from "@/lib/brain";

export const STYLES = [
  "cinematic",
  "photorealistic",
  "anime",
  "digital-art",
  "oil-painting",
  "watercolor",
  "3d-render",
  "concept-art",
  "minimalist",
  "cyberpunk",
] as const;
export type ImageStyle = (typeof STYLES)[number];

export const ASPECTS = [
  { id: "1:1", label: "Square", size: "1024x1024", w: 1, h: 1 },
  { id: "16:9", label: "Landscape", size: "1344x768", w: 16, h: 9 },
  { id: "9:16", label: "Portrait", size: "768x1344", w: 9, h: 16 },
  { id: "4:3", label: "Standard", size: "1152x864", w: 4, h: 3 },
  { id: "3:4", label: "Tall", size: "864x1152", w: 3, h: 4 },
  { id: "2:1", label: "Wide", size: "1440x720", w: 2, h: 1 },
] as const;
export type AspectId = (typeof ASPECTS)[number]["id"];

// Curated prompt template library
export interface PromptTemplate {
  id: string;
  category: string;
  title: string;
  prompt: string;
  style?: string;
  aspect?: string;
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "astro-forest",
    category: "Sci-Fi",
    title: "Alien Bioluminescent Forest",
    prompt:
      "A lone astronaut in a worn white suit discovering a bioluminescent forest on an alien moon, towering glowing mushrooms, floating spores, cinematic volumetric lighting, atmospheric fog, alien twin moons in the sky",
    style: "cinematic",
    aspect: "16:9",
  },
  {
    id: "cyber-vendor",
    category: "Cyberpunk",
    title: "Neon Tokyo Street Vendor",
    prompt:
      "Portrait of a cyberpunk street vendor in neon-lit Tokyo rain, reflective puddles, holographic signage, steam rising from food stall, detailed weathered face, rim lighting in magenta and cyan",
    style: "cyberpunk",
    aspect: "9:16",
  },
  {
    id: "airship-isle",
    category: "Fantasy",
    title: "Floating Island Airship Dock",
    prompt:
      "A majestic brass airship docked at a floating island at golden hour, cascading waterfalls into the clouds, volumetric god rays, distant mountain peaks, intricate art-nouveau architecture",
    style: "digital-art",
    aspect: "16:9",
  },
  {
    id: "bookshop-cat",
    category: "Cozy",
    title: "Cozy Bookshop with Cat",
    prompt:
      "Cozy independent bookshop interior with a sleeping tabby cat on a stack of leather-bound books, warm afternoon light through dusty windows, floating dust motes, rich wood shelves, soft bokeh",
    style: "photorealistic",
    aspect: "4:3",
  },
  {
    id: "samurai-blossom",
    category: "Traditional",
    title: "Samurai in Cherry Blossom Storm",
    prompt:
      "A lone samurai standing still in a violent cherry blossom storm, ink-wash painting style, dramatic black and red armor, petals swirling, negative space composition, ukiyo-e influence",
    style: "oil-painting",
    aspect: "9:16",
  },
  {
    id: "crystal-cave",
    category: "Nature",
    title: "Hidden Crystal Cave",
    prompt:
      "A hidden underground cave filled with giant luminous amethyst crystals, a small figure for scale, underground pool with perfect reflection, ethereal purple and teal glow, ultra detailed",
    style: "concept-art",
    aspect: "1:1",
  },
  {
    id: "desert-ruin",
    category: "Architecture",
    title: "Desert Ruin at Dusk",
    prompt:
      "Ancient sandstone ruins emerging from desert dunes at dusk, golden hour light raking across weathered carvings, lone figure in flowing robes, vast empty sky, cinematic wide shot",
    style: "cinematic",
    aspect: "2:1",
  },
  {
    id: "mecha-pilot",
    category: "Sci-Fi",
    title: "Mecha Pilot Resting",
    prompt:
      "A tired mecha pilot resting against the giant foot of their battle-scarred machine at sunset, oil-stained jumpsuit, distant smoke plumes, warm orange sky, intimate scale contrast",
    style: "anime",
    aspect: "4:3",
  },
  {
    id: "ocean-temple",
    category: "Fantasy",
    title: "Sunken Ocean Temple",
    prompt:
      "A sunken ancient temple beneath crystal-clear ocean, shafts of light piercing the water, schools of bioluminescent fish, coral overgrowth on marble columns, ethereal underwater atmosphere",
    style: "digital-art",
    aspect: "16:9",
  },
  {
    id: "minimal-still",
    category: "Minimal",
    title: "Minimal Still Life",
    prompt:
      "Minimalist still life of a single ceramic vase with one dried flower branch on a textured concrete surface, soft directional window light, muted earth tones, generous negative space, wabi-sabi aesthetic",
    style: "minimalist",
    aspect: "1:1",
  },
];

export const TEMPLATE_CATEGORIES = [
  "All",
  ...Array.from(new Set(PROMPT_TEMPLATES.map((t) => t.category))),
];

export type StageId =
  | "prompt"
  | "flux"
  | "st3gg"
  | "judge"
  | "nemotron"
  | "output";

export interface StageDef {
  id: StageId;
  label: string;
  model: string;
  params: string;
  typicalMs: string;
  description: string;
}

export const PIPELINE_STAGES: StageDef[] = [
  {
    id: "prompt",
    label: "Text Prompt Input",
    model: "Tokenizer",
    params: "≤2k tokens",
    typicalMs: "<1s",
    description: "User intent captured and normalized into the generation prompt.",
  },
  {
    id: "flux",
    label: "Image Generation",
    model: "Selected Engine",
    params: "Modal GPU / z-ai fallback",
    typicalMs: "1.5–30s",
    description: "Diffusion engine renders the base image. The actual engine (FLUX.2 9B, Krea 2, Z-Image, etc.) is selected in the Studio.",
  },
  {
    id: "st3gg",
    label: "ST3GG Security Scan",
    model: "Uncensored Brain",
    params: "~12B Gemma 4",
    typicalMs: "5–10s",
    description: "Safety classifier (running on the uncensored Gemma 4 12B brain) flags policy / wardrobe / content risk before judging.",
  },
  {
    id: "judge",
    label: "Visual Judge",
    model: "Uncensored Brain",
    params: "~12B Gemma 4",
    typicalMs: "8–15s",
    description: "Vision judge (running on the uncensored Gemma 4 12B brain) scores prompt adherence, aesthetics and safety.",
  },
  {
    id: "nemotron",
    label: "Evidence Parse",
    model: "Uncensored Brain",
    params: "~12B Gemma 4",
    typicalMs: "3–5s",
    description: "Aggregates scan + judge evidence into a structured JSON verdict.",
  },
  {
    id: "output",
    label: "Structured Output",
    model: "NEXUS-A2A-OS",
    params: "core",
    typicalMs: "<1s",
    description: "Persisted to the gallery with full provenance and audit trail.",
  },
];

/**
 * Returns engine-aware pipeline stages. The "flux" stage's model + params
 * reflect the actually-selected engine (from the Studio engine picker),
 * not a hardcoded "FLUX.1-schnell" label.
 */
export function getPipelineStages(engineId?: string, brainId?: string): StageDef[] {
  const engine = engineId ? getEngine(engineId) : null;
  const brain = brainId ? getBrain(brainId) : null;
  return PIPELINE_STAGES.map((stage) => {
    if (stage.id === "flux" && engine) {
      return {
        ...stage,
        label: `${engine.name} Generation`,
        model: engine.shortName,
        params: `${engine.family} · ${(engine.estWarmMs / 1000).toFixed(1)}s warm`,
        description: engine.description,
      };
    }
    if ((stage.id === "st3gg" || stage.id === "judge" || stage.id === "nemotron") && brain) {
      return {
        ...stage,
        model: brain.shortName,
        params: `${brain.params} · ${brain.reasoning}`,
      };
    }
    return stage;
  });
}

export type StageStatus = "idle" | "running" | "done" | "error" | "skipped";

export interface StageState {
  id: StageId;
  status: StageStatus;
  ms?: number;
  message?: string;
}

// ---- API request / response shapes ----

export interface RunPipelineRequest {
  prompt: string;
  style?: string;
  aspect?: string;
  wardrobe?: string;
  // v3 additions: calibration + LoRA + maturity
  calibrationId?: string;
  calibrationOverrides?: Record<string, unknown>;
  loraIds?: string[];
  consentFingerprint?: string;
  // Task 15: per-request Modal GPU opt-in. When true, the route handler
  // temporarily sets MODAL_USE=true for THIS request only (restored in finally).
  // When false/undefined, the run uses z-ai SDK (always warm, reliable).
  modalBoost?: boolean;
}

// Re-export the calibration + library + policy types for convenience
export type { CalibrationPreset, ResolvedCalibration, FluxModel, FluxSampler, FluxScheduler } from "@/lib/calibration";
export type { LoraEntry, LoraCategory, LoraSource } from "@/lib/lora-library";
export type { ActivePolicy, MaturityTier } from "@/lib/policy";

export interface SafetyResult {
  passed: boolean;
  score: number;
  riskLevel: "safe" | "low" | "medium" | "high" | "critical";
  flags: string[];
  rationale: string;
  stageMs: number;
}

export interface JudgeResult {
  promptAdherence: number;
  visualQuality: number;
  aestheticScore: number;
  safetyScore: number;
  wardrobeMatch: number;
  overallScore: number;
  verdict: "approved" | "rejected" | "needs_review";
  observations: string[];
  strengths: string[];
  weaknesses: string[];
  stageMs: number;
}

export interface PipelineResponse {
  id: string;
  status: "completed" | "failed" | "blocked";
  prompt: string;
  style: string;
  aspect: string;
  wardrobe: string | null;
  size: string;
  imagePath: string | null;
  verdict: string | null;
  overallScore: number | null;
  safety: SafetyResult | null;
  judge: JudgeResult | null;
  evidence: Record<string, unknown> | null;
  timings: Record<StageId, number> | null;
  // v3: calibration + LoRA + maturity provenance
  calibration: import("@/lib/calibration").ResolvedCalibration | null;
  loraIds: string[];
  maturityTier: import("@/lib/policy").MaturityTier | null;
  blockReason: string | null;
  errorMessage: string | null;
  // v4: engine + backend provenance
  engineId: string | null;
  backend: "modal" | "zai" | null;
  backendMismatch: boolean;
  // The random seed used for this generation (randomized per run)
  seed: number | null;
  createdAt: string;
}

export interface GenerationListItem {
  id: string;
  prompt: string;
  style: string;
  aspect: string;
  wardrobe: string | null;
  status: string;
  verdict: string | null;
  overallScore: number | null;
  imagePath: string | null;
  createdAt: string;
}

export interface MetricsResponse {
  total: number;
  completed: number;
  failed: number;
  approved: number;
  rejected: number;
  needsReview: number;
  avgScore: number | null;
  avgTotalMs: number | null;
  successRate: number;
  recent: { id: string; message: string; severity: string; createdAt: string }[];
  byStage: Record<StageId, { count: number; avgMs: number }>;
}

export type ViewId =
  | "studio"
  | "command"
  | "pipeline"
  | "compliance"
  | "costlab"
  | "gallery"
  | "monitor"
  | "library";
