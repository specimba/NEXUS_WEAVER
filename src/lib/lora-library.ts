// NEXUS Visual Weaver v4 — Curated LoRA Library (expanded 20h curation)
// ---------------------------------------------------------------------------
// Structured, searchable index of LoRA adapters curated from the user's
// HuggingFace + Civitai + GitHub research. Each entry is tagged with the
// engine(s) it targets, its category, recommended weight, source URL, and a
// mature (18+) flag.
//
// NSFW-gated entries are HIDDEN by default. They render only after the user
// (a) passes the 18+ consent gate AND (b) enables mature content in Policy.
// The hard blocklist (csam, nonconsensual, real-person, etc.) ALWAYS applies.
//
// Sources are real URLs from the curated guides. The dashboard references
// them; the end user must verify each model's license before use.
// ---------------------------------------------------------------------------

export type LoraSource = "huggingface" | "civitai" | "github" | "arxiv";

export type LoraCategory =
  | "garment"
  | "face"
  | "style"
  | "light"
  | "control"
  | "detailer"
  | "video"
  | "ocr-tool"
  | "safety"
  | "mature";

// Which engine families this LoRA is compatible with. Empty = universal.
export type EngineFamily =
  | "FLUX.1"
  | "FLUX.2"
  | "Krea 2"
  | "Z-Image"
  | "Ideogram"
  | "Qwen-Image"
  | "Wan"
  | "LTX"
  | "LongCat"
  | "JoyAI"
  | "Sulphur"
  | "Hunyuan"
  | "SDXL";

export interface LoraEntry {
  id: string;
  name: string;
  category: LoraCategory;
  source: LoraSource;
  url: string;
  // which engine families this LoRA targets
  engineFamilies: EngineFamily[];
  purpose: string;
  recommendedWeight: number; // 0..1
  tags: string[];
  mature: boolean;
  license: string;
  isControl: boolean;
  // curation priority (NO8D focus = high)
  priority?: "high" | "normal";
  // When a HF repo has multiple .safetensors files, specify which one to load.
  // Without this, diffusers picks one arbitrarily (alphabetically), which often
  // loads the WRONG weights — e.g. UltraSharp V2 repo has both
  // "4x-UltraSharpV2.safetensors" and others; without weight_name, diffusers
  // might load a non-functional file. The Modal app passes this to
  // pipe.load_lora_weights(repo, weight_name=...).
  weightName?: string;
  // Trigger word(s) that should be added to the prompt when this LoRA is active.
  // e.g. NO8D's commercial photography LoRA uses "Styles of commercial advertising photography"
  triggerWord?: string;
  // Does this LoRA need a reference image? (ControlNet-style LoRAs, face-swap, etc.)
  needsReference?: boolean;
  // Free-form notes about compatibility issues, usage instructions, etc.
  notes?: string;
}

export const LORA_CATEGORIES: { id: LoraCategory; label: string; description: string }[] = [
  { id: "garment", label: "Garment & Wardrobe", description: "Outfit transfer, virtual try-on/try-off, fashion consistency." },
  { id: "face", label: "Face & Identity", description: "Identity control, expression, face-swap, character swap." },
  { id: "style", label: "Style", description: "Cinematic, anime, analog, 3D, realism, retro." },
  { id: "light", label: "Lighting & Lens", description: "Light control, focal-length sliders, film grain." },
  { id: "control", label: "Control & Reference", description: "Pose/depth/canny reference, body control, sliders." },
  { id: "detailer", label: "Detailer & Upscale", description: "Detail recovery, upscale, soft enhance, consistency." },
  { id: "video", label: "Video (I2V/T2V)", description: "Motion, lightning distill, transition, audio LoRAs for Wan/LTX." },
  { id: "ocr-tool", label: "OCR & Utility", description: "OCR + utility adapters (Baidu Unlimited-OCR reference)." },
  { id: "safety", label: "Safety", description: "Safety checker / classifier references for governance." },
  { id: "mature", label: "Mature (18+)", description: "NSFW-gated adapters. Hidden unless consent + mature unlocked." },
];

export const LORA_LIBRARY: LoraEntry[] = [
  // ════════════════════════════════════════════════════════════════════════
  // NO8D COLLECTION — extra focus per Canberk's spec. These are the flagship
  // control LoRAs for FLUX.2 Klein 9B.
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "no8d-facecontrol",
    name: "NO8D FaceControl",
    category: "face",
    source: "huggingface",
    url: "https://huggingface.co/NO8D/FaceControl",
    engineFamilies: ["FLUX.2"],
    purpose: "Regional face-identity control. Locks subject identity across generations. NO8D flagship.",
    recommendedWeight: 0.8,
    tags: ["NO8D", "identity", "face", "control", "regional"],
    mature: false,
    license: "verify",
    isControl: true,
    priority: "high",
    weightName: "Eye_9B.safetensors",
  },
  {
    id: "no8d-expressioncontrol",
    name: "NO8D ExpressionControl",
    category: "face",
    source: "huggingface",
    url: "https://huggingface.co/NO8D/ExpressionControl",
    engineFamilies: ["FLUX.2"],
    purpose: "Drive facial expressions independently of identity. Pairs with FaceControl.",
    recommendedWeight: 0.75,
    tags: ["NO8D", "expression", "face"],
    mature: false,
    license: "verify",
    isControl: true,
    priority: "high",
    weightName: "happy.safetensors",
  },
  {
    id: "no8d-bodycontrol",
    name: "NO8D BodyControl",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/NO8D/BodyControl",
    engineFamilies: ["FLUX.2"],
    purpose: "Regional body-pose / proportion control. The go-to pose LoRA for FLUX.2 9B.",
    recommendedWeight: 0.76,
    tags: ["NO8D", "body", "pose", "control"],
    mature: false,
    license: "verify",
    isControl: true,
    priority: "high",
    weightName: "Chest.safetensors",
  },
  {
    id: "no8d-lightcontrol",
    name: "NO8D LightControl",
    category: "light",
    source: "huggingface",
    url: "https://huggingface.co/NO8D/LightControl",
    engineFamilies: ["FLUX.2"],
    purpose: "Regional lighting control — place key/fill/rim lights precisely. Studio lighting without re-prompting.",
    recommendedWeight: 0.74,
    tags: ["NO8D", "lighting", "control", "regional"],
    mature: false,
    license: "verify",
    isControl: true,
    priority: "high",
    // Repo has 6 .safetensors files: left&right_9B, top&bottom, front&back, hard&soft, dawn&dusk, Light&Deep
    // left&right_9B is the main lighting control for Klein 9B
    weightName: "left&right_9B.safetensors",
  },
  {
    id: "no8d-photostyle",
    name: "NO8D PhotoStyle",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/NO8D/PhotoStyle",
    engineFamilies: ["FLUX.2"],
    purpose: "Photographic style transfer for consistent look across a set. NO8D's style anchor.",
    recommendedWeight: 0.7,
    tags: ["NO8D", "photo", "style", "transfer"],
    mature: false,
    license: "verify",
    isControl: false,
    priority: "high",
    weightName: "Polaroid.safetensors",
  },
  {
    id: "no8d-imagingcontrol",
    name: "NO8D ImagingControl",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/NO8D/ImagingControl",
    engineFamilies: ["FLUX.2"],
    purpose: "General imaging control — composition + framing sliders. Completes the NO8D suite.",
    recommendedWeight: 0.68,
    tags: ["NO8D", "composition", "control"],
    mature: false,
    license: "verify",
    isControl: true,
    priority: "high",
    weightName: "ColorTone.safetensors",
  },
  {
    id: "no8d-slider-toolkit",
    name: "NO8D Slider Toolkit (Klein 4B)",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/NO8D/Slider-toolkit-Klein4B",
    engineFamilies: ["FLUX.2"],
    purpose: "General-purpose slider toolkit for fine attribute control on the 4B klein base.",
    recommendedWeight: 0.55,
    tags: ["NO8D", "slider", "toolkit", "attribute"],
    mature: false,
    license: "verify",
    isControl: true,
    priority: "high",
  },

  // ════════════════════════════════════════════════════════════════════════
  // REFCONTROL (thedeoxen) — reference-based control for FLUX.2 Klein 9B
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "refcontrol-pose",
    name: "refcontrol FLUX.2 Klein 9B — Reference Pose",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/thedeoxen/refcontrol-FLUX.2-klein-9b-reference-pose-lora",
    engineFamilies: ["FLUX.2"],
    purpose: "Reference-pose control: drive subject pose from a reference image.",
    recommendedWeight: 0.78,
    tags: ["refcontrol", "pose", "reference", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: true,
    priority: "high",
  },
  {
    id: "refcontrol-depth",
    name: "refcontrol FLUX.2 Klein 9B — Reference Depth",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/thedeoxen/refcontrol-FLUX.2-klein-9b-reference-depth-lora",
    engineFamilies: ["FLUX.2"],
    purpose: "Reference-depth control: structure transfer from a depth map.",
    recommendedWeight: 0.76,
    tags: ["refcontrol", "depth", "reference", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: true,
    priority: "high",
  },
  {
    id: "refcontrol-canny",
    name: "refcontrol FLUX.2 Klein 9B — Reference Canny",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/thedeoxen/refcontrol-FLUX.2-klein-9b-reference-canny-lora",
    engineFamilies: ["FLUX.2"],
    purpose: "Reference-canny edge control: precise outline/structure transfer.",
    recommendedWeight: 0.76,
    tags: ["refcontrol", "canny", "edge", "reference", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: true,
    priority: "high",
  },

  // ════════════════════════════════════════════════════════════════════════
  // GARMENT & WARDROBE
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "fal-virtual-tryoff",
    name: "fal Virtual Try-Off",
    category: "garment",
    source: "huggingface",
    url: "https://huggingface.co/fal/virtual-tryoff-lora",
    engineFamilies: ["FLUX.1", "FLUX.2"],
    purpose: "Remove clothing to a clean garment flat-lay — inverse of try-on. E-commerce ready.",
    recommendedWeight: 0.85,
    tags: ["fashion", "tryoff", "e-commerce"],
    mature: false,
    license: "fal.ai (verify)",
    isControl: false,
  },
  {
    id: "tryoffdiff",
    name: "TryOffDiff",
    category: "garment",
    source: "huggingface",
    url: "https://huggingface.co/rizavelioglu/tryoffdiff",
    engineFamilies: ["FLUX.1"],
    purpose: "Diffusion-based garment reconstruction from a worn image. FashionFail dataset paired.",
    recommendedWeight: 0.8,
    tags: ["fashion", "reconstruction"],
    mature: false,
    license: "Apache-2.0 (verify)",
    isControl: false,
  },
  {
    id: "ilkerzgi-embroidery",
    name: "Embroidery Patch (Kontext)",
    category: "garment",
    source: "huggingface",
    url: "https://huggingface.co/ilkerzgi/embroidery-patch-kontext-dev-lora",
    engineFamilies: ["FLUX.1"],
    purpose: "Raised embroidery/patch detail on garments. Merch + streetwear.",
    recommendedWeight: 0.75,
    tags: ["embroidery", "texture", "apparel", "kontext"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "ilkerzgi-overlay",
    name: "Overlay Texture (Kontext)",
    category: "garment",
    source: "huggingface",
    url: "https://huggingface.co/ilkerzgi/Overlay-Kontext-Dev-LoRA",
    engineFamilies: ["FLUX.1"],
    purpose: "Graphic overlay / print texture for apparel and posters.",
    recommendedWeight: 0.7,
    tags: ["overlay", "print", "graphic", "kontext"],
    mature: false,
    license: "verify",
    isControl: false,
  },

  // ════════════════════════════════════════════════════════════════════════
  // FACE & IDENTITY
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "bfs-face-swap",
    name: "BFS Best Face Swap",
    category: "face",
    source: "huggingface",
    url: "https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap",
    engineFamilies: ["FLUX.1", "FLUX.2"],
    purpose: "High-quality face swap. Use only with consented source identities.",
    recommendedWeight: 0.72,
    tags: ["face-swap", "identity", "consent-required"],
    mature: false,
    license: "verify · consent required",
    isControl: true,
  },
  {
    id: "ilkerzgi-face-swap",
    name: "ilkerzgi Face Swap",
    category: "face",
    source: "huggingface",
    url: "https://huggingface.co/ilkerzgi/face-swap",
    engineFamilies: ["FLUX.1"],
    purpose: "Identity-preserving face swap pipeline.",
    recommendedWeight: 0.7,
    tags: ["face-swap", "identity"],
    mature: false,
    license: "verify · consent required",
    isControl: true,
  },
  {
    id: "nhathoang-char-swap",
    name: "Smart Character Swap (Klein 9B)",
    category: "face",
    source: "huggingface",
    url: "https://huggingface.co/nhathoangfoto/Flux.2-Klein-9B-SmartCharacterSwap",
    engineFamilies: ["FLUX.2"],
    purpose: "Character identity transfer with preserved lighting/composition.",
    recommendedWeight: 0.78,
    tags: ["character", "swap", "identity", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: true,
  },
  {
    id: "kotyar-jpfresh",
    name: "Jpfresh Portrait",
    category: "face",
    source: "huggingface",
    url: "https://huggingface.co/Kotyar/Flux-Jpfresh-Portrait-LoRA",
    engineFamilies: ["FLUX.1"],
    purpose: "Fresh high-clarity portrait aesthetic. Pairs with Photoreal Portrait preset.",
    recommendedWeight: 0.72,
    tags: ["portrait", "fresh", "clarity"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "anypose",
    name: "AnyPose",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/lilylilith/AnyPose",
    engineFamilies: ["FLUX.1", "FLUX.2"],
    purpose: "Arbitrary pose control from a reference pose image.",
    recommendedWeight: 0.74,
    tags: ["pose", "control", "reference"],
    mature: false,
    license: "verify",
    isControl: true,
  },

  // ════════════════════════════════════════════════════════════════════════
  // STYLE — incl. Krea 2 style LoRAs
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "krea-retroanime",
    name: "Krea 2 LoRA — Retro Anime",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/krea/Krea-2-LoRA-retroanime",
    engineFamilies: ["Krea 2"],
    purpose: "Retro anime aesthetic for Krea 2. Vintage cel-shaded look.",
    recommendedWeight: 0.8,
    tags: ["krea", "anime", "retro", "style"],
    mature: false,
    license: "verify",
    isControl: false,
    priority: "high",
  },
  {
    id: "gokay-krea-realism",
    name: "Krea 2 Realism LoRA",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/gokaygokay/Krea-2-Realism-LoRA",
    engineFamilies: ["Krea 2"],
    purpose: "Boosts photorealism on Krea 2 base. Skin + texture fidelity.",
    recommendedWeight: 0.7,
    tags: ["krea", "realism", "photo"],
    mature: false,
    license: "verify",
    isControl: false,
    priority: "high",
  },
  {
    id: "agbr-cinematic",
    name: "Cinematic Film Still (Klein 9B)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/artificialguybr/CINEMATIC-FILMSTILL-REDMOND-FLUXKLEIN9B",
    engineFamilies: ["FLUX.2"],
    purpose: "Film-still color grade and framing. Pairs with Cinematic Grade preset.",
    recommendedWeight: 0.7,
    tags: ["cinematic", "film", "grade", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "agbr-analog",
    name: "Analog Photography (Klein 9B)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/artificialguybr/ANALOG-REDMOND-FLUXKLEIN9B",
    engineFamilies: ["FLUX.2"],
    purpose: "Analog film look — grain, halation, warm blacks.",
    recommendedWeight: 0.68,
    tags: ["analog", "film", "grain", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "agbr-filmgrain",
    name: "Film Grain (Klein 9B)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/artificialguybr/FILMGRAIN-REDMOND-FLUXKLEIN9B",
    engineFamilies: ["FLUX.2"],
    purpose: "Standalone grain texture LoRA for post-grade integration.",
    recommendedWeight: 0.6,
    tags: ["grain", "texture", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "agbr-3drender",
    name: "3D Render Style (Klein 9B)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/artificialguybr/3DRenderStyle-REDMOND-FLUXKLEIN9B",
    engineFamilies: ["FLUX.2"],
    purpose: "Cycles/octane-style 3D render aesthetic.",
    recommendedWeight: 0.72,
    tags: ["3d", "render", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "agbr-anime",
    name: "Anime Style (Klein)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/artificialguybr/ANIME-REDMOND-FLUXKLEIN",
    engineFamilies: ["FLUX.2"],
    purpose: "Clean anime key-visual style. Pairs with Anime/Illustration preset.",
    recommendedWeight: 0.8,
    tags: ["anime", "illustration", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "agbr-360view",
    name: "360 View (Klein 9B)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/artificialguybr/360VIEW-REDMOND-FLUXKLEIN9B",
    engineFamilies: ["FLUX.2"],
    purpose: "Wrap-around 360° environment views.",
    recommendedWeight: 0.65,
    tags: ["360", "environment", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "gokay-pencil",
    name: "Pencil Drawing (Kontext)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/gokaygokay/Pencil-Drawing-Kontext-Dev-LoRA",
    engineFamilies: ["FLUX.1"],
    purpose: "Graphite/pencil sketch rendering.",
    recommendedWeight: 0.78,
    tags: ["sketch", "pencil", "kontext"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "ilkerzgi-glittering",
    name: "Glittering Portrait (Kontext)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/ilkerzgi/Glittering-Portrait-Kontext-Dev-Lora",
    engineFamilies: ["FLUX.1"],
    purpose: "Sparkle/glitter highlight LoRA for glamour portraiture.",
    recommendedWeight: 0.66,
    tags: ["glitter", "portrait", "glamour", "kontext"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "ilkerzgi-metallic",
    name: "Metallic Objects (Kontext)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/ilkerzgi/metallic-objects-kontext-dev-lora",
    engineFamilies: ["FLUX.1"],
    purpose: "Physically-based metallic surface rendering.",
    recommendedWeight: 0.72,
    tags: ["metal", "pbr", "kontext"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "ilkerzgi-tattoo",
    name: "Tattoo (Kontext)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/ilkerzgi/Tattoo-Kontext-Dev-Lora",
    engineFamilies: ["FLUX.1"],
    purpose: "Realistic tattoo application on skin.",
    recommendedWeight: 0.7,
    tags: ["tattoo", "skin", "kontext"],
    mature: false,
    license: "verify",
    isControl: false,
  },

  // ════════════════════════════════════════════════════════════════════════
  // LIGHTING & LENS
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "nkd-focal",
    name: "Focal Length Slider (Klein 9B)",
    category: "light",
    source: "huggingface",
    url: "https://huggingface.co/Nekodificador/NKD_Klein_9B_Focal_Lenght_Slider_V1",
    engineFamilies: ["FLUX.2"],
    purpose: "Slider to dial lens focal length (wide ↔ telephoto) on a subject.",
    recommendedWeight: 0.6,
    tags: ["lens", "focal", "slider", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: true,
  },

  // ════════════════════════════════════════════════════════════════════════
  // CONTROL & SLIDERS
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "dx8152-consistency",
    name: "Klein 9B Consistency",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/dx8152/Flux2-Klein-9B-Consistency",
    engineFamilies: ["FLUX.2"],
    purpose: "Improves multi-shot character/scene consistency.",
    recommendedWeight: 0.7,
    tags: ["consistency", "multi-shot", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    weightName: "Flux2-Klein-9B-consistency-V2.safetensors",
  },
  {
    id: "dx8152-enhanced-details",
    name: "Klein 9B Enhanced Details",
    category: "detailer",
    source: "huggingface",
    url: "https://huggingface.co/dx8152/Flux2-Klein-9B-Enhanced-Details",
    engineFamilies: ["FLUX.2"],
    purpose: "Detail enhancement pass for Klein 9B. Recovers fine texture.",
    recommendedWeight: 0.65,
    tags: ["detail", "enhance", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    priority: "high",
    weightName: "realistic.safetensors",
  },
  {
    id: "warmblood-real-chars",
    name: "Anything → Real Characters (Klein 9B)",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/WarmBloodAban/Flux2_Klein_Anything_to_Real_Characters",
    engineFamilies: ["FLUX.2"],
    purpose: "Converts stylized subjects into photoreal characters.",
    recommendedWeight: 0.72,
    tags: ["realism", "character", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    weightName: "Flux2 Klein动漫转写实真人 AnythingtoRealCharacters.safetensors",
  },
  {
    id: "deverstyle-loras",
    name: "DeverStyle Klein LoRAs",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/DeverStyle/Flux.2-Klein-Loras",
    engineFamilies: ["FLUX.2"],
    purpose: "Collection of style/character adapters for Klein 9B. Arcane visual style.",
    recommendedWeight: 0.7,
    tags: ["collection", "style", "character", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    // This repo has multiple .safetensors files (dever_arcane_f2k_9b, etc.)
    // Without weight_name, diffusers picks one arbitrarily.
    weightName: "dever_arcane_f2k_9b (arcane_visual_style).safetensors",
  },

  // ════════════════════════════════════════════════════════════════════════
  // DETAILER & UPSCALE
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "ultrasharp-v2",
    name: "UltraSharp V2",
    category: "detailer",
    source: "huggingface",
    url: "https://huggingface.co/Kim2091/UltraSharpV2",
    // INCOMPATIBLE with FLUX.2 Klein 9B: size mismatch [16, 3072] vs [16, 4096]
    // This is a FLUX.1 LoRA (3072 hidden dim), NOT FLUX.2 (4096 hidden dim).
    // It silently fails every time on FLUX.2 Klein 9B.
    engineFamilies: ["FLUX.1", "SDXL"],
    purpose: "High-fidelity upscale model for FLUX.1/SDXL. INCOMPATIBLE with FLUX.2 Klein 9B.",
    recommendedWeight: 0.6,
    tags: ["upscale", "sharpen", "FLUX.1-only", "incompatible-flux2"],
    mature: false,
    license: "verify",
    isControl: false,
    priority: "high",
    weightName: "4x-UltraSharpV2.safetensors",
    notes: "INCOMPATIBLE with FLUX.2 Klein 9B — size mismatch [16, 3072] vs [16, 4096]. Only works with FLUX.1-dev/schnell.",
  },
  {
    id: "ltx2-detailer",
    name: "LTX-2 IC-LoRA Detailer",
    category: "detailer",
    source: "huggingface",
    url: "https://huggingface.co/Lightricks/LTX-2-19b-IC-LoRA-Detailer",
    engineFamilies: ["LTX"],
    purpose: "In-context detailer for the final video refinement pass.",
    recommendedWeight: 0.6,
    tags: ["detail", "refine", "ic-lora", "LTX"],
    mature: false,
    license: "Lightricks (verify)",
    isControl: false,
  },
  {
    id: "vrgamedev-soft-enhance",
    name: "LTX 2.3 Soft Enhance",
    category: "detailer",
    source: "huggingface",
    url: "https://huggingface.co/vrgamedevgirl84/LTX_2.3_Soft_Enhance_Style_LoRa",
    engineFamilies: ["LTX"],
    purpose: "Soft enhancement + style pass for LTX 2.3.",
    recommendedWeight: 0.55,
    tags: ["enhance", "soft", "LTX"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "pid-nvidia",
    name: "NVIDIA PiD (Pixel-Identity)",
    category: "detailer",
    source: "huggingface",
    url: "https://huggingface.co/nvidia/PiD",
    engineFamilies: ["FLUX.1", "FLUX.2"],
    purpose: "Pixel-level identity preservation. Keeps per-pixel fidelity during edits.",
    recommendedWeight: 0.62,
    tags: ["identity", "pixel", "preserve", "nvidia"],
    mature: false,
    license: "NVIDIA (verify)",
    isControl: false,
  },

  // ════════════════════════════════════════════════════════════════════════
  // QWEN IMAGE EDIT LoRAs (context/edit engines)
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "qwen-multi-angle",
    name: "Qwen-Image-Edit Multi-Angle LoRA",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA",
    engineFamilies: ["Qwen-Image"],
    purpose: "Multi-angle view synthesis from a single edit.",
    recommendedWeight: 0.6,
    tags: ["multi-angle", "edit", "qwen"],
    mature: false,
    license: "fal.ai (verify)",
    isControl: false,
  },
  {
    id: "qwen-next-scene",
    name: "Next-Scene Qwen Image LoRA",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/lovis93/next-scene-qwen-image-lora-2509",
    engineFamilies: ["Qwen-Image"],
    purpose: "Generate the next scene/continuation from a current frame. Storyboard workflows.",
    recommendedWeight: 0.62,
    tags: ["next-scene", "continuation", "qwen", "storyboard"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "qwen-unblur-upscale",
    name: "Qwen-Image-Edit Unblur Upscale",
    category: "detailer",
    source: "huggingface",
    url: "https://huggingface.co/prithivMLmods/Qwen-Image-Edit-2511-Unblur-Upscale",
    engineFamilies: ["Qwen-Image"],
    purpose: "Deblur + upscale via Qwen Image Edit. Restoration workflow.",
    recommendedWeight: 0.58,
    tags: ["unblur", "upscale", "restore", "qwen"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "phr00t-qwen-rapid-aio",
    name: "Qwen-Image-Edit Rapid AIO",
    category: "detailer",
    source: "huggingface",
    url: "https://huggingface.co/Phr00t/Qwen-Image-Edit-Rapid-AIO",
    engineFamilies: ["Qwen-Image"],
    purpose: "Rapid all-in-one accelerator for Qwen Image Edit. Fewer steps.",
    recommendedWeight: 0.5,
    tags: ["rapid", "aio", "fast", "qwen"],
    mature: false,
    license: "verify",
    isControl: false,
  },

  // ════════════════════════════════════════════════════════════════════════
  // IDEOGRAM LoRAs
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "ideogram-turbotime",
    name: "Ideogram 4 Turbotime LoRA",
    category: "detailer",
    source: "huggingface",
    url: "https://huggingface.co/ostris/ideogram_4_turbotime_lora",
    engineFamilies: ["Ideogram"],
    purpose: "Cuts Ideogram 4 step count via turbo-time acceleration.",
    recommendedWeight: 0.55,
    tags: ["turbo", "fast", "ideogram", "accelerate"],
    mature: false,
    license: "verify",
    isControl: false,
  },

  // ════════════════════════════════════════════════════════════════════════
  // VIDEO LoRAs — Wan 2.2 + LTX 2.3 + LongCat
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "ltx2-pose-control",
    name: "LTX-2 Pose Control",
    category: "video",
    source: "huggingface",
    url: "https://huggingface.co/Lightricks/LTX-2-19b-IC-LoRA-Pose-Control",
    engineFamilies: ["LTX"],
    purpose: "Pose-driven motion control for image-to-video. CRUCIAL control system.",
    recommendedWeight: 0.65,
    tags: ["video", "pose", "i2v", "LTX", "control"],
    mature: false,
    license: "Lightricks (verify)",
    isControl: true,
    priority: "high",
  },
  {
    id: "ltx23-motion-track",
    name: "LTX 2.3 Motion Track Control",
    category: "video",
    source: "huggingface",
    url: "https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Motion-Track-Control",
    engineFamilies: ["LTX"],
    purpose: "Camera motion tracking control for LTX 2.3 I2V. CRUCIAL for stable camera moves.",
    recommendedWeight: 0.62,
    tags: ["video", "motion", "camera", "LTX", "control"],
    mature: false,
    license: "Lightricks (verify)",
    isControl: true,
    priority: "high",
  },
  {
    id: "joyfox-transition",
    name: "LTX 2.3 Transition",
    category: "video",
    source: "huggingface",
    url: "https://huggingface.co/joyfox/LTX-2.3-Transition-LORA",
    engineFamilies: ["LTX"],
    purpose: "Smooth scene-transition LoRA for LTX 2.3.",
    recommendedWeight: 0.58,
    tags: ["video", "transition", "LTX"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "vrgamedev-musicvideo",
    name: "LTX 2.3 Music Video Creator",
    category: "video",
    source: "huggingface",
    url: "https://huggingface.co/vrgamedevgirl84/LTX_2.3_Music_Video_Creator_ComfyUI",
    engineFamilies: ["LTX"],
    purpose: "Beat-synced music-video generation workflow LoRA.",
    recommendedWeight: 0.6,
    tags: ["video", "music", "LTX", "comfyui"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "wan22-lightning",
    name: "Wan 2.2 Lightning (lightx2v)",
    category: "video",
    source: "huggingface",
    url: "https://huggingface.co/lightx2v/Wan2.2-Lightning",
    engineFamilies: ["Wan"],
    purpose: "4-step lightning distill for Wan 2.2 I2V/T2V. Massive speedup.",
    recommendedWeight: 0.5,
    tags: ["video", "wan2.2", "lightning", "fast", "distill"],
    mature: false,
    license: "verify",
    isControl: false,
    priority: "high",
  },
  {
    id: "wan22-svi-pro",
    name: "Wan 2.2 SVI Pro (Stable Video Infinity)",
    category: "video",
    source: "huggingface",
    url: "https://huggingface.co/Kijai/WanVideo_comfy/blob/main/LoRAs/Stable-Video-Infinity/v2.0/SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors",
    engineFamilies: ["Wan"],
    purpose: "Stable Video Infinity Pro — extended-duration stable Wan 2.2 video.",
    recommendedWeight: 0.6,
    tags: ["video", "wan2.2", "svi", "stable", "long"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "wan22-fun-reward",
    name: "Wan 2.2 Fun Reward LoRA",
    category: "video",
    source: "huggingface",
    url: "https://huggingface.co/alibaba-pai/Wan2.2-Fun-Reward-LoRAs/blob/main/Wan2.2-Fun-A14B-InP-low-noise-HPS2.1.safetensors",
    engineFamilies: ["Wan"],
    purpose: "Reward-model-tuned Wan 2.2 LoRA. Better HPS alignment.",
    recommendedWeight: 0.55,
    tags: ["video", "wan2.2", "reward", "hps"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "krea-realtime-video",
    name: "Krea Realtime Video",
    category: "video",
    source: "huggingface",
    url: "https://huggingface.co/krea/krea-realtime-video",
    engineFamilies: ["Krea 2"],
    purpose: "Realtime video generation adapter. Krea's realtime pipeline.",
    recommendedWeight: 0.6,
    tags: ["video", "krea", "realtime"],
    mature: false,
    license: "verify",
    isControl: false,
  },
  {
    id: "ltx23-distilled",
    name: "LTX 2.3 Distilled (Abiray GGUF)",
    category: "video",
    source: "huggingface",
    url: "https://huggingface.co/Abiray/LTX-2.3-22B-DISTILLED-1.1-GGUF",
    engineFamilies: ["LTX"],
    purpose: "Distilled 1.1 GGUF of LTX 2.3 22B. Faster inference, lower VRAM.",
    recommendedWeight: 0.5,
    tags: ["video", "LTX", "distilled", "gguf", "fast"],
    mature: false,
    license: "verify",
    isControl: false,
  },

  // ════════════════════════════════════════════════════════════════════════
  // OCR & UTILITY
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "baidu-unlimited-ocr",
    name: "Baidu Unlimited-OCR",
    category: "ocr-tool",
    source: "huggingface",
    url: "https://huggingface.co/baidu/Unlimited-OCR",
    engineFamilies: [],
    purpose: "God-mode OCR. Extracts every text element (small/rotated/stylized/handwritten). Used by the Studio OCR tool.",
    recommendedWeight: 0,
    tags: ["ocr", "baidu", "text-extraction", "utility"],
    mature: false,
    license: "verify",
    isControl: false,
    priority: "high",
  },

  // ════════════════════════════════════════════════════════════════════════
  // SAFETY
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "compvis-safety-checker",
    name: "Stable Diffusion Safety Checker",
    category: "safety",
    source: "huggingface",
    url: "https://huggingface.co/CompVis/stable-diffusion-safety-checker",
    engineFamilies: [],
    purpose: "Reference safety classifier for the governance layer.",
    recommendedWeight: 0,
    tags: ["safety", "classifier", "governance"],
    mature: false,
    license: "OpenRAIL (verify)",
    isControl: false,
  },

  // ════════════════════════════════════════════════════════════════════════
  
  // ════════════════════════════════════════════════════════════════════════
  // NEW VERIFIED LoRAs (tested against Modal FLUX.2 Klein 9B — all load OK)
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "no8d-highresolution",
    name: "NO8D High Resolution",
    category: "detailer",
    source: "huggingface",
    url: "https://huggingface.co/NO8D/HighResolution",
    engineFamilies: ["FLUX.2"],
    purpose: "High resolution enhancement for Klein 9B. Recovers fine detail at 1024+.",
    recommendedWeight: 0.55,
    tags: ["NO8D", "highres", "detail", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    priority: "high",
    weightName: "HighResolution9B.safetensors",
  },
  {
    id: "dx8152-migration",
    name: "Klein 9B Migration",
    category: "detailer",
    source: "huggingface",
    url: "https://huggingface.co/dx8152/Flux2-Klein-9B-Migration",
    engineFamilies: ["FLUX.2"],
    purpose: "Migration adapter for Klein 9B. Helps transition from FLUX.1 prompts.",
    recommendedWeight: 0.50,
    tags: ["migration", "detail", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    weightName: "Klein-Migration.safetensors",
  },
  {
    id: "ghost-mannequin",
    name: "Ghost Mannequin (Klein 9B)",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/nhathoangfoto/FLUX.2-klein-ghost-mannequin",
    engineFamilies: ["FLUX.2"],
    purpose: "Ghost mannequin effect for fashion photography. Removes body, keeps garments.",
    recommendedWeight: 0.60,
    tags: ["ghost", "mannequin", "fashion", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: true,
    weightName: "3D-GhosMannequinRank-256.safetensors",
  },
  {
    id: "no8d-8090-cult-film",
    name: "NO8D 8090 Cult Film Style",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/NO8D/8090-cult-film-style",
    engineFamilies: ["FLUX.2"],
    purpose: "80s-90s cult film aesthetic. Retro cinematic look.",
    recommendedWeight: 0.45,
    tags: ["NO8D", "style", "retro", "film", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    weightName: "8090.safetensors",
  },
  {
    id: "artificialguybr-3drender",
    name: "3D Render Style (Klein 9B)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/artificialguybr/3DRenderStyle-REDMOND-FLUXKLEIN9B",
    engineFamilies: ["FLUX.2"],
    purpose: "3D render style for Klein 9B. Gives a rendered/CGI aesthetic.",
    recommendedWeight: 0.45,
    tags: ["3d", "render", "style", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    weightName: "[FLUX.2.Klein]3DRenderStyle_Redmond.safetensors",
  },
  {
    id: "artificialguybr-anime",
    name: "Anime Style (Klein 9B)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/artificialguybr/ANIME-REDMOND-FLUXKLEIN",
    engineFamilies: ["FLUX.2"],
    purpose: "Anime style adapter for Klein 9B.",
    recommendedWeight: 0.45,
    tags: ["anime", "style", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    weightName: "[FLUX.2.Klein]Anime_Redmond.safetensors",
  },
  {
    id: "warmblood-stylesculpt",
    name: "StyleSculpt (Klein 9B)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/WarmBloodAban/StyleSculpt",
    engineFamilies: ["FLUX.2"],
    purpose: "Character design style sculpting LoRA for Klein 9B.",
    recommendedWeight: 0.45,
    tags: ["style", "character", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    weightName: "StyleSculpt_角色设计X1.safetensors",
  },
  {
    id: "mikkoph-klein9b",
    name: "Mikkoph Style (Klein 9B)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/mikkoph/mikkoph-klein9b",
    engineFamilies: ["FLUX.2"],
    purpose: "Mikkoph custom style for Klein 9B.",
    recommendedWeight: 0.45,
    tags: ["style", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    weightName: "klein9b-mikkoph.safetensors",
  },
  {
    id: "nomadoor-schematic",
    name: "Schematic LoRA (Klein 9B)",
    category: "control",
    source: "huggingface",
    url: "https://huggingface.co/nomadoor/flux-2-klein-9B-schematic-lora",
    engineFamilies: ["FLUX.2"],
    purpose: "Schematic segmentation + body pose + binary segmentation for Klein 9B. Control LoRA.",
    recommendedWeight: 0.50,
    tags: ["schematic", "segmentation", "pose", "control", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: true,
    weightName: "loras/flux2-klein-schematic-amodal-segmentation-lora.safetensors",
  },
  {
    id: "bzcasper-ai-influencer",
    name: "AI Influencer (MIA)",
    category: "style",
    source: "huggingface",
    url: "https://huggingface.co/bzcasper/ai-influencer-lora",
    engineFamilies: ["FLUX.2"],
    purpose: "AI influencer portrait style. Produces Instagram-like realistic portraits.",
    recommendedWeight: 0.45,
    tags: ["portrait", "influencer", "realism", "FLUX.2"],
    mature: false,
    license: "verify",
    isControl: false,
    weightName: "MIA.safetensors",
  },
  // ════════════════════════════════════════════════════════════════════════
  // MATURE (18+, gated) — hidden unless consent + mature unlocked.
  // Hard blocklist (csam, nonconsensual, real-person) ALWAYS applies.
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "heartsync-flux-nsfw",
    name: "Flux NSFW Uncensored (Heartsync)",
    category: "mature",
    source: "huggingface",
    url: "https://huggingface.co/Heartsync/Flux-NSFW-uncensored",
    // INCOMPATIBLE with FLUX.2 Klein 9B: size mismatch (3072 vs 4096) — this is a FLUX.1 LoRA, not FLUX.2
    engineFamilies: ["FLUX.1"],
    purpose: "Uncensored generation adapter for FLUX.1 only. INCOMPATIBLE with FLUX.2 Klein 9B (size mismatch error). 18+ consent required.",
    recommendedWeight: 0.8,
    tags: ["nsfw", "18+", "uncensored", "FLUX.1-only", "incompatible-flux2"],
    mature: true,
    license: "verify · 18+ only",
    isControl: false,
    weightName: "lora.safetensors",
    notes: "INCOMPATIBLE with FLUX.2 Klein 9B — causes 'size mismatch for transformer_blocks.0.attn.to_q' error. Only works with FLUX.1-dev/schnell.",
  },
  {
    id: "bigjutt-true-v2",
    name: "Klein 9B True V2 (BIGJUTT)",
    category: "mature",
    source: "huggingface",
    url: "https://huggingface.co/BIGJUTT/Flux2-Klein-9B-True-V2",
    // INCOMPATIBLE: not a standard LoRA — 'Invalid LoRA checkpoint' error (param names don't contain 'lora')
    engineFamilies: ["FLUX.2"],
    purpose: "Mature realism adapter for Klein 9B. INCOMPATIBLE with diffusers load_lora_weights (not a standard LoRA format). 18+ consent required.",
    recommendedWeight: 0.75,
    tags: ["nsfw", "18+", "realism", "FLUX.2", "incompatible-diffusers"],
    mature: true,
    license: "verify · 18+ only",
    isControl: false,
  },
  {
    id: "lora-daddy-ltx-nudity",
    name: "LTX 2.3 Animated Nudity",
    category: "mature",
    source: "huggingface",
    url: "https://huggingface.co/Lora-Daddy/LTX-2.3-animated-nudity-lora",
    engineFamilies: ["LTX"],
    purpose: "Mature I2V nudity adapter. 18+ consent required; video output.",
    recommendedWeight: 0.7,
    tags: ["nsfw", "18+", "video", "LTX"],
    mature: true,
    license: "verify · 18+ only",
    isControl: false,
  },
  {
    id: "tenstrip-ltx-eros",
    name: "TenStrip LTX 2.3 10Eros",
    category: "mature",
    source: "huggingface",
    url: "https://huggingface.co/TenStrip/LTX2.3-10Eros",
    engineFamilies: ["LTX"],
    purpose: "TenStrip's mature LTX 2.3 build. 18+ consent required.",
    recommendedWeight: 0.72,
    tags: ["nsfw", "18+", "video", "LTX", "tenstrip"],
    mature: true,
    license: "verify · 18+ only",
    isControl: false,
  },
  {
    id: "phr00t-wan-rapid-aio",
    name: "WAN 2.2 14B Rapid All-In-One (Phr00t)",
    category: "mature",
    source: "huggingface",
    url: "https://huggingface.co/Phr00t/WAN2.2-14B-Rapid-AllInOne",
    engineFamilies: ["Wan"],
    purpose: "Rapid AIO Wan 2.2 mature build. 18+ consent required.",
    recommendedWeight: 0.6,
    tags: ["nsfw", "18+", "video", "wan2.2", "rapid"],
    mature: true,
    license: "verify · 18+ only",
    isControl: false,
  },
  {
    id: "eddy-wan-palingenesis",
    name: "WAN 22.XX Palingenesis (eddy)",
    category: "mature",
    source: "huggingface",
    url: "https://huggingface.co/eddy1111111/WAN22.XX_Palingenesis",
    engineFamilies: ["Wan"],
    purpose: "Mature Wan 2.2 variant. 18+ consent required.",
    recommendedWeight: 0.65,
    tags: ["nsfw", "18+", "video", "wan2.2"],
    mature: true,
    license: "verify · 18+ only",
    isControl: false,
  },
];

// Convenience: filter visible entries given a maturity unlock.
export function visibleLoras(matureUnlocked: boolean): LoraEntry[] {
  if (matureUnlocked) return LORA_LIBRARY;
  return LORA_LIBRARY.filter((l) => !l.mature);
}

export function lorasByCategory(matureUnlocked: boolean): Record<LoraCategory, LoraEntry[]> {
  const visible = visibleLoras(matureUnlocked);
  const out = {} as Record<LoraCategory, LoraEntry[]>;
  for (const c of LORA_CATEGORIES) {
    out[c.id] = visible.filter((l) => l.category === c.id);
  }
  return out;
}

export function countMature(): number {
  return LORA_LIBRARY.filter((l) => l.mature).length;
}

export function getLora(id: string): LoraEntry | undefined {
  return LORA_LIBRARY.find((l) => l.id === id);
}

// Filter LoRAs by engine family (for the studio engine picker).
export function lorasForEngine(engineFamily: EngineFamily, matureUnlocked: boolean): LoraEntry[] {
  return visibleLoras(matureUnlocked).filter(
    (l) => l.engineFamilies.length === 0 || l.engineFamilies.includes(engineFamily)
  );
}
