import { NextResponse } from "next/server";
import { aeonWorkflowAdvice } from "@/lib/aeon/client";
import type { AEONWorkflowAdvice } from "@/types/aeon";

export const runtime = "nodejs";
export const maxDuration = 60;

// Cached workflow advice (in-memory, resets on server restart)
let _cachedAdvice: { data: AEONWorkflowAdvice; timestamp: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/aeon/workflow-advice
 *
 * Returns AEON's gallery-level workflow advice (canonical presets, LoRA insights).
 * Cached for 10 minutes to avoid repeated AEON calls.
 *
 * If AEON is cold and z-ai fallback fails, returns a hardcoded fallback fixture
 * (the example from the user's architecture spec) so the UI always has data.
 */
export async function GET() {
  // Return cached if fresh
  if (_cachedAdvice && Date.now() - _cachedAdvice.timestamp < CACHE_TTL_MS) {
    return NextResponse.json({ advice: _cachedAdvice.data, cached: true });
  }

  // Build a gallery summary for AEON to analyze
  const gallerySummary = await buildGallerySummary();
  const result = await aeonWorkflowAdvice(gallerySummary);

  if (result.advice) {
    _cachedAdvice = { data: result.advice, timestamp: Date.now() };
    return NextResponse.json({ advice: result.advice, meta: result.meta, cached: false });
  }

  // Fallback: return the hardcoded fixture from the user's architecture spec
  const fallback = getFallbackWorkflowAdvice();
  return NextResponse.json({
    advice: fallback,
    meta: { backend: "fallback_fixture" as const, modelName: "hardcoded fixture", success: true },
    cached: false,
  });
}

async function buildGallerySummary(): Promise<string> {
  try {
    const { db } = await import("@/lib/db");
    const recent = await db.generation.findMany({
      where: { status: "completed" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        prompt: true,
        style: true,
        aspect: true,
        verdict: true,
        overallScore: true,
        calibrationId: true,
        loraIds: true,
        timings: true,
      },
    });

    const summary = {
      totalGenerations: recent.length,
      avgScore: recent.length > 0
        ? Math.round(recent.reduce((sum, g) => sum + (g.overallScore ?? 0), 0) / recent.length)
        : 0,
      approvedCount: recent.filter((g) => g.verdict === "approved").length,
      rejectedCount: recent.filter((g) => g.verdict === "rejected").length,
      commonStyles: [...new Set(recent.map((g) => g.style))].slice(0, 5),
      commonAspects: [...new Set(recent.map((g) => g.aspect))].slice(0, 5),
      commonCalibrationIds: [...new Set(recent.map((g) => g.calibrationId))].slice(0, 5),
      samplePrompts: recent.slice(0, 10).map((g) => g.prompt.slice(0, 200)),
    };

    return `Analyze this gallery data and propose canonical presets + LoRA insights:\n\n${JSON.stringify(summary, null, 2)}`;
  } catch {
    return "No gallery data available. Propose 3 canonical presets for FLUX.2 Klein 9B based on general best practices: editorial fashion, commercial ad, cinematic concept.";
  }
}

function getFallbackWorkflowAdvice(): AEONWorkflowAdvice {
  return {
    version: "aeon-workflow-v1",
    summary: "FLUX.2 Klein 9B performs best with clean prompts, 3 or fewer style/detailer LoRAs, and moderate weights (0.35–0.50). Three canonical presets recommended: editorial fashion, commercial ads, and cinematic concepts.",
    canonicalPresets: [
      {
        id: "flux2_high_end_editorial",
        label: "High-End Editorial Portrait",
        description: "Single-subject fashion/editorial portraits with strong wardrobe adherence, shallow depth of field, and cinematic lighting.",
        examplePrompt: "Ultra photorealistic luxury fashion editorial portrait in a grand interior, single model, sharp facial features, dramatic rim light and soft fill, clean background separation.",
        engineConfig: {
          engine: "flux2-klein-9b",
          steps: 4,
          cfgScale: 1.0,
          resolution: { width: 1344, height: 768 },
          aspectRatio: "16:9",
        },
        loras: [
          { loraId: "no8d-photostyle", name: "NO8D PhotoStyle", role: "style", weight: 0.45, weightRange: { min: 0.35, max: 0.55 }, notes: "Core photographic rendering; improves skin, fabrics, and contrast." },
          { loraId: "analog-photography-klein9b", name: "Analog Photography (Klein 9B)", role: "style", weight: 0.40, weightRange: { min: 0.30, max: 0.50 }, notes: "Adds analog depth and film-like tonal rolloff." },
          { loraId: "cinematic-film-still-klein9b", name: "Cinematic Film Still (Klein 9B)", role: "style", weight: 0.40, weightRange: { min: 0.30, max: 0.50 }, notes: "Encodes film-still framing and color grading." },
        ],
        bestFor: ["single-subject editorial fashion", "wardrobe-heavy prompts", "cinematic interiors with strong light beams"],
        avoidFor: ["large crowds", "small intricate props"],
      },
      {
        id: "flux2_commercial_fashion_ad",
        label: "Commercial Fashion Ad",
        description: "Clean, high-contrast commercial fashion images suitable for ads and lookbooks.",
        engineConfig: {
          engine: "flux2-klein-9b",
          steps: 4,
          cfgScale: 1.0,
          resolution: { width: 1024, height: 1024 },
          aspectRatio: "1:1",
        },
        loras: [
          { loraId: "no8d-photostyle", name: "NO8D PhotoStyle", role: "style", weight: 0.40, weightRange: { min: 0.30, max: 0.50 }, notes: "Keeps skin and materials realistic while preserving brand-safe clarity." },
        ],
        bestFor: ["product-focused fashion", "lookbook shots", "simple backgrounds"],
        avoidFor: ["heavily stylized cinematic scenes"],
      },
      {
        id: "flux2_cinematic_concept_frame",
        label: "Cinematic Concept Frame",
        description: "Wide, cinematic frames for concept art and narrative fashion scenes.",
        engineConfig: {
          engine: "flux2-klein-9b",
          steps: 4,
          cfgScale: 1.0,
          resolution: { width: 1536, height: 864 },
          aspectRatio: "16:9",
        },
        loras: [
          { loraId: "cinematic-film-still-klein9b", name: "Cinematic Film Still (Klein 9B)", role: "style", weight: 0.50, weightRange: { min: 0.35, max: 0.55 }, notes: "Primary cinematic driver." },
          { loraId: "analog-photography-klein9b", name: "Analog Photography (Klein 9B)", role: "style", weight: 0.35, weightRange: { min: 0.25, max: 0.45 }, notes: "Adds subtle grain and depth." },
        ],
        bestFor: ["wide cinematic scenes", "narrative fashion storytelling"],
        avoidFor: ["tight headshots", "micro-product details"],
      },
    ],
    loraInsights: [
      {
        loraId: "no8d-photostyle",
        name: "NO8D PhotoStyle",
        goodFor: ["general photo-realism", "skin and fabric rendering", "editorial fashion"],
        badFor: ["heavily stylized illustration", "anime-focused outputs"],
        suggestedWeightRange: { min: 0.35, max: 0.55 },
        commonArtifacts: ["mild over-contrast if combined with strong cinematic LoRAs above 0.55"],
        pairingSuggestions: ["Pair with Analog Photography (Klein 9B) at 0.30–0.45 for analog depth.", "Keep total combined style weights under ≈1.2 to preserve anatomy."],
      },
      {
        loraId: "cinematic-film-still-klein9b",
        name: "Cinematic Film Still (Klein 9B)",
        goodFor: ["film-still framing", "strong directional lighting", "cinematic color grading"],
        badFor: ["flat e-commerce product shots", "clean white background catalog imagery"],
        suggestedWeightRange: { min: 0.30, max: 0.55 },
        commonArtifacts: ["overly heavy grading and contrast above 0.60"],
        pairingSuggestions: ["Use together with NO8D PhotoStyle at 0.40–0.45 each for balanced editorial style."],
      },
    ],
    commonFailureModes: [
      "Over-stylization when 4 or more style/detailer LoRAs are used at weights ≥0.55 each.",
      "Prompt pollution from appended quality tokens causing inconsistent anatomy on Klein 9B.",
      "Using FLUX.1-style steps/cfg settings while actual backend uses 4 steps, cfg 1.0.",
      "Lack of explicit wardrobe structure in the prompt, leading to vague or incorrect garments.",
    ],
    recommendedNextExperiments: [
      "Introduce a hard UI hint when more than 3 style/detailer LoRAs are active, suggesting a combined weight cap of ≈1.2.",
      "Add a 'Base vs LoRA' A/B mode where the same prompt is run once with no LoRAs and once with the current stack.",
      "Promote three canonical presets (editorial, commercial, cinematic) as one-click starting points.",
      "Standardize wardrobe prompts into structured fields and let AEON validate adherence in the judge step.",
    ],
    reasoningTrace: "Fallback fixture based on architecture spec. AEON endpoint was cold (503) or z-ai fallback failed to produce structured JSON.",
  };
}
