// NEXUS Visual Weaver v4 — Multi-Engine Catalog
// ---------------------------------------------------------------------------
// Replaces the single-FLUX model with a cutting-edge multi-engine system.
// Curated from 20h of HF + Civitai research. The end user selects an engine;
// each engine declares its capabilities, param ranges, LoRA/control support,
// and the HF source for provenance.
//
// ENGINE TIERS (per Canberk's spec):
//   • MAIN IMAGE CREATION: FLUX.2 Klein 9B, Krea 2 (Turbo/Raw), Z-Image Turbo,
//     Ideogram 4 — wide LoRA + control + realism + style range.
//   • CONTEXT/EDIT ONLY: FLUX.1 Kontext-dev, Qwen Image Edit 2511.
//   • VIDEO: Wan 2.2, LTX 2.3 (control crucial), LongCat, JoyAI, Sulphur 2,
//     HunyuanVideo.
//
// The dashboard does NOT host the weights — it references HF sources and the
// end user is responsible for license verification. Generation is routed via
// the Modal H100 backend (real diffusion) or the z-ai fallback (hosted).
// ---------------------------------------------------------------------------

export type EngineType = "image" | "edit" | "video";

export interface EngineParamSpec {
  stepsMin: number;
  stepsMax: number;
  stepsDefault: number;
  cfgMin: number;
  cfgMax: number;
  cfgDefault: number;
  samplerOptions: string[];
  defaultSampler: string;
  resolutionOptions: string[];
  defaultResolution: string;
  denoiseDefault: number; // for img2img / edit / refiner
  supportsRefiner: boolean;
}

export interface Engine {
  id: string;
  name: string;
  shortName: string;
  type: EngineType;
  family: string;
  hfUrl: string;
  description: string;
  // why this engine exists in the stack
  role: string;
  params: EngineParamSpec;
  loraCompatible: boolean;
  controlCompatible: boolean; // ControlNet / reference / regional control
  // this engine can produce mature output (gated by policy)
  matureCapable: boolean;
  // est. warm generation time on Modal H100 (ms)
  estWarmMs: number;
  // whether the z-ai fallback can approximate this engine
  zaiFallback: boolean;
  trend: "rising" | "stable" | "legacy";
  badge?: string;
}

export const ENGINES: Engine[] = [
  // ── MAIN IMAGE CREATION ─────────────────────────────────────────────────────
  {
    id: "flux2-klein-9b",
    name: "FLUX.2 Klein 9B",
    shortName: "FLUX.2 9B",
    type: "image",
    family: "FLUX.2",
    hfUrl: "https://huggingface.co/black-forest-labs/FLUX.2-klein-9B",
    description:
      "Black Forest Labs' 9B flagship. The widest LoRA + control ecosystem (NO8D, refcontrol, DeverStyle). Studio-grade realism and style range.",
    role: "Primary creation engine — broadest adapter support.",
    params: {
      stepsMin: 4, stepsMax: 30, stepsDefault: 10,
      cfgMin: 1, cfgMax: 12, cfgDefault: 9.0,
      samplerOptions: ["dpmpp_2m", "dpmpp_2m_sde", "euler", "uni_pc"],
      defaultSampler: "dpmpp_2m",
      resolutionOptions: ["1024x1024", "1344x768", "768x1344", "1152x864", "864x1152"],
      defaultResolution: "1024x1024",
      denoiseDefault: 0.88,
      supportsRefiner: true,
    },
    loraCompatible: true,
    controlCompatible: true,
    matureCapable: true,
    estWarmMs: 2800,
    zaiFallback: true,
    trend: "stable",
    badge: "primary",
  },
  {
    id: "flux2-dev",
    name: "FLUX.2 Dev",
    shortName: "FLUX.2 Dev",
    type: "image",
    family: "FLUX.2",
    hfUrl: "https://huggingface.co/black-forest-labs/FLUX.2-dev",
    description:
      "FLUX.2 Dev branch — higher fidelity, more steps, refiner-friendly. Use for final-delivery cinematic + portrait work.",
    role: "High-fidelity delivery engine.",
    params: {
      stepsMin: 8, stepsMax: 40, stepsDefault: 20,
      cfgMin: 1, cfgMax: 12, cfgDefault: 9.0,
      samplerOptions: ["dpmpp_2m", "dpmpp_2m_sde", "uni_pc"],
      defaultSampler: "dpmpp_2m",
      resolutionOptions: ["1024x1024", "1344x768", "768x1344", "864x1152"],
      defaultResolution: "1024x1024",
      denoiseDefault: 0.9,
      supportsRefiner: true,
    },
    loraCompatible: true,
    controlCompatible: true,
    matureCapable: true,
    estWarmMs: 5200,
    zaiFallback: false,
    trend: "stable",
  },
  {
    id: "krea-2-turbo",
    name: "Krea 2 Turbo",
    shortName: "Krea 2 Turbo",
    type: "image",
    family: "Krea 2",
    hfUrl: "https://huggingface.co/krea/Krea-2-Turbo",
    description:
      "Most-loved, fast-rising model for realistic image creation. Few-step turbo inference with strong default aesthetics. Pairs with Krea realism + retroanime LoRAs.",
    role: "Trending fast iteration engine.",
    params: {
      stepsMin: 4, stepsMax: 16, stepsDefault: 6,
      cfgMin: 2, cfgMax: 10, cfgDefault: 7.5,
      samplerOptions: ["dpmpp_2m", "euler"],
      defaultSampler: "dpmpp_2m",
      resolutionOptions: ["1024x1024", "1216x832", "832x1216"],
      defaultResolution: "1024x1024",
      denoiseDefault: 0.85,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: true,
    matureCapable: true,
    estWarmMs: 1600,
    zaiFallback: false,
    trend: "rising",
    badge: "trending",
  },
  {
    id: "krea-2-raw",
    name: "Krea 2 Raw",
    shortName: "Krea 2 Raw",
    type: "image",
    family: "Krea 2",
    hfUrl: "https://huggingface.co/krea/Krea-2-Raw",
    description:
      "Krea 2 Raw — unprocessed photoreal base. Best skin/texture fidelity before stylistic LoRAs are layered.",
    role: "Raw photoreal base.",
    params: {
      stepsMin: 6, stepsMax: 24, stepsDefault: 12,
      cfgMin: 2, cfgMax: 10, cfgDefault: 7.0,
      samplerOptions: ["dpmpp_2m", "euler"],
      defaultSampler: "dpmpp_2m",
      resolutionOptions: ["1024x1024", "1216x832", "832x1216"],
      defaultResolution: "1024x1024",
      denoiseDefault: 0.86,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: true,
    matureCapable: true,
    estWarmMs: 2400,
    zaiFallback: false,
    trend: "rising",
  },
  {
    id: "z-image-turbo",
    name: "Z-Image Turbo",
    shortName: "Z-Image",
    type: "image",
    family: "Z-Image",
    hfUrl: "https://huggingface.co/Tongyi-MAI/Z-Image-Turbo",
    description:
      "Tongyi-MAI's turbo model. Extremely fast, strong composition. Alibaba-pai Fun distill LoRA available for extra speed.",
    role: "Ultra-fast composition engine.",
    params: {
      stepsMin: 2, stepsMax: 12, stepsDefault: 4,
      cfgMin: 1, cfgMax: 8, cfgDefault: 6.0,
      samplerOptions: ["dpmpp_2m", "euler"],
      defaultSampler: "euler",
      resolutionOptions: ["1024x1024", "1280x768", "768x1280"],
      defaultResolution: "1024x1024",
      denoiseDefault: 0.85,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: true,
    matureCapable: false,
    estWarmMs: 1200,
    zaiFallback: false,
    trend: "rising",
    badge: "fastest",
  },
  {
    id: "ideogram-4",
    name: "Ideogram 4",
    shortName: "Ideogram 4",
    type: "image",
    family: "Ideogram",
    hfUrl: "https://huggingface.co/ideogram-ai/ideogram-4-fp8",
    description:
      "Best-in-class text-in-image rendering. fp8 + nf4 quantized variants. Pairs with the turbotime LoRA for fewer steps.",
    role: "Text + typography specialist.",
    params: {
      stepsMin: 4, stepsMax: 20, stepsDefault: 8,
      cfgMin: 2, cfgMax: 10, cfgDefault: 7.0,
      samplerOptions: ["dpmpp_2m", "euler"],
      defaultSampler: "dpmpp_2m",
      resolutionOptions: ["1024x1024", "1360x768", "768x1360"],
      defaultResolution: "1024x1024",
      denoiseDefault: 0.85,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: true,
    matureCapable: false,
    estWarmMs: 2200,
    zaiFallback: false,
    trend: "rising",
    badge: "typography",
  },

  // ── CONTEXT / EDIT ONLY ─────────────────────────────────────────────────────
  {
    id: "flux1-kontext-dev",
    name: "FLUX.1 Kontext Dev",
    shortName: "Kontext",
    type: "edit",
    family: "FLUX.1",
    hfUrl: "https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev",
    description:
      "Context-editing engine — inpainting, garment swap, style transfer on an existing image. NOT for from-scratch creation. Pairs with the Overlay/Embroidery/Tattoo LoRAs.",
    role: "Context edit / inpaint only.",
    params: {
      stepsMin: 6, stepsMax: 28, stepsDefault: 14,
      cfgMin: 2, cfgMax: 10, cfgDefault: 7.5,
      samplerOptions: ["dpmpp_2m", "euler"],
      defaultSampler: "dpmpp_2m",
      resolutionOptions: ["1024x1024", "1152x864", "864x1152"],
      defaultResolution: "1024x1024",
      denoiseDefault: 0.75,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: true,
    matureCapable: true,
    estWarmMs: 3000,
    zaiFallback: false,
    trend: "stable",
    badge: "edit",
  },
  {
    id: "qwen-image-edit",
    name: "Qwen Image Edit 2511",
    shortName: "Qwen Edit",
    type: "edit",
    family: "Qwen-Image",
    hfUrl: "https://huggingface.co/Qwen/Qwen-Image-Edit-2511",
    description:
      "Instruction-guided image editing. Natural-language edits + multi-angle synthesis. GGUF + ComfyUI split available. Unblur/Upscale LoRA for restoration.",
    role: "Instruction-guided edit.",
    params: {
      stepsMin: 4, stepsMax: 20, stepsDefault: 10,
      cfgMin: 1, cfgMax: 8, cfgDefault: 5.0,
      samplerOptions: ["dpmpp_2m", "euler"],
      defaultSampler: "euler",
      resolutionOptions: ["1024x1024", "1328x1328"],
      defaultResolution: "1024x1024",
      denoiseDefault: 0.7,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: true,
    matureCapable: true,
    estWarmMs: 2600,
    zaiFallback: false,
    trend: "rising",
    badge: "edit",
  },

  // ── VIDEO ENGINES ───────────────────────────────────────────────────────────
  {
    id: "wan-2.2",
    name: "Wan 2.2",
    shortName: "Wan 2.2",
    type: "video",
    family: "Wan",
    hfUrl: "https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B-Diffusers",
    description:
      "Alibaba's flagship image-to-video (A14B) + text-to-video (5B). Lightning + lightx2v distill LoRAs cut steps to 4. SVI Pro LoRA for motion quality.",
    role: "Primary I2V / T2V engine.",
    params: {
      stepsMin: 4, stepsMax: 40, stepsDefault: 20,
      cfgMin: 1, cfgMax: 10, cfgDefault: 6.0,
      samplerOptions: ["uni_pc", "dpmpp_2m", "euler"],
      defaultSampler: "uni_pc",
      resolutionOptions: ["832x480", "1280x720", "720x1280"],
      defaultResolution: "832x480",
      denoiseDefault: 1.0,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: true,
    matureCapable: true,
    estWarmMs: 18000,
    zaiFallback: false,
    trend: "rising",
    badge: "video",
  },
  {
    id: "ltx-2.3",
    name: "LTX 2.3",
    shortName: "LTX 2.3",
    type: "video",
    family: "LTX",
    hfUrl: "https://huggingface.co/Lightricks/LTX-2.3",
    description:
      "Lightricks' 22B video model. CRUCIAL control system — IC-LoRA Pose Control, Motion Track, Detailer, Transition. Realtime + distilled GGUF variants for fast iteration.",
    role: "Control-rich video engine.",
    params: {
      stepsMin: 4, stepsMax: 30, stepsDefault: 14,
      cfgMin: 1, cfgMax: 8, cfgDefault: 4.0,
      samplerOptions: ["euler", "dpmpp_2m"],
      defaultSampler: "euler",
      resolutionOptions: ["768x512", "1024x576", "576x1024"],
      defaultResolution: "768x512",
      denoiseDefault: 1.0,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: true,
    matureCapable: true,
    estWarmMs: 12000,
    zaiFallback: false,
    trend: "rising",
    badge: "control",
  },
  {
    id: "longcat-video",
    name: "LongCat Video",
    shortName: "LongCat",
    type: "video",
    family: "LongCat",
    hfUrl: "https://huggingface.co/meituan-longcat/LongCat-Video",
    description:
      "Meituan's long-duration video model. Strong temporal coherence over longer clips than Wan/LTX defaults.",
    role: "Long-duration video.",
    params: {
      stepsMin: 6, stepsMax: 30, stepsDefault: 16,
      cfgMin: 1, cfgMax: 8, cfgDefault: 5.0,
      samplerOptions: ["dpmpp_2m", "euler"],
      defaultSampler: "dpmpp_2m",
      resolutionOptions: ["832x480", "1280x720"],
      defaultResolution: "832x480",
      denoiseDefault: 1.0,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: false,
    matureCapable: false,
    estWarmMs: 22000,
    zaiFallback: false,
    trend: "rising",
    badge: "video",
  },
  {
    id: "joyai",
    name: "JoyAI",
    shortName: "JoyAI",
    type: "video",
    family: "JoyAI",
    hfUrl: "https://huggingface.co/jdopensource/JoyAI-Image-Edit-Plus-Diffusers",
    description:
      "JD OpenSource JoyAI — image-edit-plus diffusers + Echo variant. Lightweight edit + short video clips.",
    role: "Lightweight edit + short video.",
    params: {
      stepsMin: 4, stepsMax: 20, stepsDefault: 10,
      cfgMin: 1, cfgMax: 8, cfgDefault: 5.0,
      samplerOptions: ["euler", "dpmpp_2m"],
      defaultSampler: "euler",
      resolutionOptions: ["768x768", "1024x576"],
      defaultResolution: "768x768",
      denoiseDefault: 0.8,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: false,
    matureCapable: false,
    estWarmMs: 9000,
    zaiFallback: false,
    trend: "rising",
    badge: "video",
  },
  {
    id: "sulphur-2",
    name: "Sulphur 2",
    shortName: "Sulphur 2",
    type: "video",
    family: "Sulphur",
    hfUrl: "https://huggingface.co/SulphurAI/Sulphur-2-base",
    description:
      "SulphurAI's base video model. Often merged with LTX for stylized motion (TenStrip LTX2-Sulphur mixes).",
    role: "Stylized video base.",
    params: {
      stepsMin: 6, stepsMax: 30, stepsDefault: 16,
      cfgMin: 1, cfgMax: 8, cfgDefault: 5.0,
      samplerOptions: ["dpmpp_2m", "euler"],
      defaultSampler: "dpmpp_2m",
      resolutionOptions: ["832x480", "768x768"],
      defaultResolution: "832x480",
      denoiseDefault: 1.0,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: false,
    matureCapable: true,
    estWarmMs: 16000,
    zaiFallback: false,
    trend: "rising",
    badge: "video",
  },
  {
    id: "hunyuan-video",
    name: "HunyuanVideo",
    shortName: "Hunyuan",
    type: "video",
    family: "Hunyuan",
    hfUrl: "https://huggingface.co/tencent/HunyuanVideo",
    description:
      "Tencent's open video model. High motion quality, larger footprint. Use when Wan/LTX motion isn't sufficient.",
    role: "High-motion video alternative.",
    params: {
      stepsMin: 8, stepsMax: 40, stepsDefault: 20,
      cfgMin: 1, cfgMax: 9, cfgDefault: 6.0,
      samplerOptions: ["dpmpp_2m", "euler", "uni_pc"],
      defaultSampler: "dpmpp_2m",
      resolutionOptions: ["832x480", "1280x720"],
      defaultResolution: "832x480",
      denoiseDefault: 1.0,
      supportsRefiner: false,
    },
    loraCompatible: true,
    controlCompatible: false,
    matureCapable: false,
    estWarmMs: 26000,
    zaiFallback: false,
    trend: "stable",
    badge: "video",
  },
];

export const DEFAULT_IMAGE_ENGINE_ID = "flux2-klein-9b";
export const DEFAULT_EDIT_ENGINE_ID = "flux1-kontext-dev";
export const DEFAULT_VIDEO_ENGINE_ID = "wan-2.2";

export function getEngine(id: string | null | undefined): Engine {
  if (!id) return ENGINES[0];
  return ENGINES.find((e) => e.id === id) ?? ENGINES[0];
}

export function enginesByType(type: EngineType): Engine[] {
  return ENGINES.filter((e) => e.type === type);
}

export function engineTypeLabel(t: EngineType): string {
  if (t === "image") return "Image Creation";
  if (t === "edit") return "Context / Edit";
  return "Video";
}

export function engineTypeIcon(t: EngineType): string {
  if (t === "image") return "ImageIcon";
  if (t === "edit") return "Wand2";
  return "Film";
}
