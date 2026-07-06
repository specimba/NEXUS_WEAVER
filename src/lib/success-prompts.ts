// NEXUS Visual Weaver v4 — Grok-Derived Success Prompt Templates
// ---------------------------------------------------------------------------
// Curated from the grokIMAGINEpromptSUCCESSexamples.txt — proven high-fidelity
// prompts that produced studio-quality output on the Grok baseline. Used as
// starting templates + style-reference for the multi-engine studio.
//
// These templates encode the photographic + wardrobe + lighting detail that
// closed the quality gap in the VLM review. Each is tagged with the engine
// family it suits best and a recommended calibration preset.
// ---------------------------------------------------------------------------

import type { EngineFamily } from "@/lib/lora-library";

export interface SuccessPrompt {
  id: string;
  title: string;
  category: string;
  prompt: string;
  // which engine families this prompt suits
  engineFamilies: EngineFamily[];
  recommendedPresetId: string;
  aspect: string;
  style: string;
  wardrobe: string;
}

export const GROK_SUCCESS_PROMPTS: SuccessPrompt[] = [
  {
    id: "grok-gothic-fashion",
    title: "Gothic Patent Leather Fashion Editorial",
    category: "Fashion Editorial",
    prompt:
      "Ultra-photorealistic high-end luxury fashion editorial photography, cinematic and provocative aesthetic, shot on Hasselblad H6D-100c with 80mm lens at f/1.8, exceptional natural skin texture and razor-sharp detail. A breathtaking woman with pale flawless skin, sharp high cheekbones, piercing grey-blue eyes, bold dark-red lipstick, jet-black wet wavy hair dramatically wind-blown. Powerful seductive gaze directly at camera, confident alluring expression. She wears a dramatic floor-length open high-gloss black patent leather cape-coat with voluminous black faux fur trim on oversized collar and hem, red satin lining dramatically visible. Underneath: intricate black Chantilly lace corset-style top with polished crimson metal buckles and glossy leather straps. Dramatic linear daylight through tall stained glass windows, strong straight beams with vibrant warm red rim lighting. Rich luxurious contrast between deep black, high-shine patent, fluffy fur, delicate lace and vibrant crimson. Heavy atmospheric dust and wind create intense dynamic motion.",
    engineFamilies: ["FLUX.2", "Krea 2"],
    recommendedPresetId: "photoreal-portrait",
    aspect: "9:16",
    style: "photorealistic",
    wardrobe: "high-gloss black patent leather cape-coat, faux fur trim, black Chantilly lace corset, crimson metal buckles",
  },
  {
    id: "grok-cinematic-portrait",
    title: "Cinematic Rim-Lit Portrait",
    category: "Portrait",
    prompt:
      "Cinematic film still, ultra-photorealistic portrait of a woman with detailed natural skin texture, shot on Arri Alexa with 50mm anamorphic lens. Dramatic teal and orange color grade, strong rim lighting, shallow depth of field, atmospheric haze. Subject in sharp focus with micro-detail in eyes and hair. Volumetric god rays through window blinds. Professional color science, high dynamic range, no plastic skin.",
    engineFamilies: ["FLUX.2", "Krea 2"],
    recommendedPresetId: "cinematic-grade",
    aspect: "16:9",
    style: "cinematic",
    wardrobe: "minimal elegant dark wardrobe for contrast",
  },
  {
    id: "grok-cyberpunk-vendor",
    title: "Neon Tokyo Cyberpunk Vendor",
    category: "Cyberpunk",
    prompt:
      "Portrait of a cyberpunk street vendor in neon-lit Tokyo rain, reflective puddles, holographic signage, steam rising from food stall, detailed weathered face with cybernetic implants, rim lighting in magenta and cyan, shot on Sony FX9 with 35mm lens at f/1.4, ultra detailed pores and rain droplets, atmospheric volumetric fog.",
    engineFamilies: ["FLUX.2", "Krea 2"],
    recommendedPresetId: "cinematic-grade",
    aspect: "9:16",
    style: "cyberpunk",
    wardrobe: "techwear with glowing accents",
  },
  {
    id: "grok-anime-key",
    title: "Anime Key Visual — Mecha Pilot",
    category: "Anime",
    prompt:
      "Anime key visual, a tired mecha pilot resting against the giant foot of their battle-scarred machine at sunset, oil-stained jumpsuit, distant smoke plumes, warm orange sky, intimate scale contrast, clean linework, cel shading, vibrant flat color, high detail, professional illustration.",
    engineFamilies: ["FLUX.2", "Krea 2"],
    recommendedPresetId: "anime-illustration",
    aspect: "4:3",
    style: "anime",
    wardrobe: "oil-stained mecha pilot jumpsuit",
  },
  {
    id: "grok-concept-airship",
    title: "Concept Art — Floating Island Airship",
    category: "Concept Art",
    prompt:
      "Concept art, a majestic brass airship docked at a floating island at golden hour, cascading waterfalls into the clouds, volumetric god rays, distant mountain peaks, intricate art-nouveau architecture, painterly brushwork, atmospheric perspective, matte painting, ultra detailed.",
    engineFamilies: ["FLUX.2"],
    recommendedPresetId: "concept-art",
    aspect: "16:9",
    style: "digital-art",
    wardrobe: "",
  },
];

export const SUCCESS_PROMPT_CATEGORIES = [
  "All",
  ...Array.from(new Set(GROK_SUCCESS_PROMPTS.map((p) => p.category))),
];
