// NEXUS Visual Weaver v4 — Brain Assistant
// ---------------------------------------------------------------------------
// Uses the z-ai chat completions API (serving the Gemma 4 12B-class model) to
// analyze the user's current Studio configuration and make helpful suggestions:
//   - Is the selected engine compatible with the selected LoRAs?
//   - Are there too many LoRAs stacked (collapse risk)?
//   - Are the calibration params appropriate for the engine?
//   - Is the prompt well-structured for the selected style?
//   - What improvements would the brain recommend?
//
// This runs the brain in an ADVISORY role — it doesn't block generation. The
// user sees its suggestions in a collapsible "Brain Assistant" card and can
// apply them with one click.
// ---------------------------------------------------------------------------

import { getZai } from "@/lib/zai";
import { getEngine, type Engine } from "@/lib/engines";
import { getLora, type LoraEntry } from "@/lib/lora-library";
import { getPreset, type ResolvedCalibration } from "@/lib/calibration";

export interface BrainSuggestion {
  kind: "warning" | "tip" | "optimization" | "compat";
  title: string;
  detail: string;
  action?: { label: string; type: "switch-engine" | "remove-lora" | "adjust-steps" | "adjust-cfg"; value?: string };
}

export interface BrainAnalysis {
  suggestions: BrainSuggestion[];
  summary: string;
  confidence: number;
  ms: number;
}

// Local rule-based checks (instant, no API call) — these catch the common
// collapse-risk issues before the brain API is even called.
export function localCompatibilityChecks(params: {
  engineId: string;
  loraIds: string[];
  loraWeights: Record<string, number>;
  calibration: ResolvedCalibration | null;
  prompt: string;
}): BrainSuggestion[] {
  const { engineId, loraIds, loraWeights, calibration, prompt } = params;
  const engine = getEngine(engineId);
  const suggestions: BrainSuggestion[] = [];

  // 1. LoRA engine-family compatibility + incompatible format checks
  const loras = loraIds.map((id) => getLora(id)).filter(Boolean) as LoraEntry[];
  for (const lora of loras) {
    // Check for incompatible-diffusers tag (LoRAs that fail to load on FLUX.2)
    if (lora.tags?.includes("incompatible-diffusers") || lora.tags?.includes("incompatible-flux2")) {
      suggestions.push({
        kind: "compat",
        title: `LoRA "${lora.name}" is INCOMPATIBLE with FLUX.2`,
        detail: lora.notes ?? `"${lora.name}" will FAIL to load on the Modal GPU. It silently does nothing — the image is generated without it. Remove it from the stack.`,
        action: { label: `Remove ${lora.name}`, type: "remove-lora", value: lora.id },
      });
      continue; // Skip the engine-family check — already flagged as incompatible
    }
    // `engine.family` is typed as `string` (engines.ts) while `engineFamilies`
    // is `EngineFamily[]` (lora-library.ts). Use .some() to avoid the type
    // mismatch that Array.includes() would require.
    if (lora.engineFamilies.length > 0 && !lora.engineFamilies.some((f) => f === engine.family)) {
      suggestions.push({
        kind: "compat",
        title: `LoRA "${lora.name}" is for a different engine`,
        detail: `"${lora.name}" targets ${lora.engineFamilies.join(", ")} but you selected ${engine.name} (${engine.family}). This LoRA will FAIL to load on the GPU — it silently does nothing. Remove it from the stack.`,
        action: { label: `Remove ${lora.name}`, type: "remove-lora", value: lora.id },
      });
    }
  }

  // 2. LoRA stack analysis — check total weight + role diversity
  const totalWeight = loras.reduce((sum, l) => sum + (loraWeights[l.id] ?? l.recommendedWeight), 0);
  if (loras.length > 8) {
    suggestions.push({
      kind: "warning",
      title: "Large LoRA stack",
      detail: `${loras.length} LoRAs stacked. Professional workflows use 5-10 LoRAs with LOW individual weights (0.15-0.30 each) and diverse roles (style + control + detailer). Keep total combined weight under ~2.0 to avoid collapse.`,
    });
  }
  if (totalWeight > 2.5) {
    suggestions.push({
      kind: "warning",
      title: "Total LoRA weight too high",
      detail: `Combined weight is ${totalWeight.toFixed(2)}. Professional ComfyUI workflows keep total combined weight under ~2.0. Reduce individual weights to 0.15-0.30 each when stacking many LoRAs.`,
    });
  }

  // 3. High weights across many LoRAs
  const highWeightLoras = loras.filter((l) => (loraWeights[l.id] ?? l.recommendedWeight) > 0.85);
  if (highWeightLoras.length > 2) {
    suggestions.push({
      kind: "warning",
      title: "Multiple high-weight LoRAs",
      detail: `${highWeightLoras.length} LoRAs have weight > 0.85. Combined high weights amplify interference. Try lowering some to 0.6-0.7 to let them coexist cleanly.`,
    });
  }

  // 4. Control LoRAs without a reference image
  const controlLoras = loras.filter((l) => l.isControl);
  if (controlLoras.length > 0 && !prompt.toLowerCase().includes("reference")) {
    suggestions.push({
      kind: "tip",
      title: "Control LoRAs need a reference",
      detail: `${controlLoras.length} control LoRA(s) applied (${controlLoras.map((l) => l.name).join(", ")}). These work best with a reference image or explicit pose/structure description in the prompt. Without one, they may have muted effect.`,
    });
  }

  // 5. Steps check — for FLUX.2 Klein 9B, 4 is OPTIMAL (research-confirmed)
  // Going higher DEGRADES quality (unnatural skin, plastic look, blurry eyes)
  if (calibration && engine.family === "FLUX.2" && calibration.steps > 4) {
    suggestions.push({
      kind: "optimization",
      title: "Steps too high for FLUX.2 Klein 9B",
      detail: `${calibration.steps} steps is too many for FLUX.2 Klein 9B (distilled model). 4 steps is OPTIMAL — higher steps DEGRADE quality (unnatural skin, plastic look, blurry eyes). The backend caps at 4 anyway, but the UI shows the wrong value.`,
      action: { label: "Set 4 steps", type: "adjust-steps", value: "4" },
    });
  }

  // 6. Steps too high for a turbo engine
  if (calibration && engine.id.includes("turbo") && calibration.steps > 12) {
    suggestions.push({
      kind: "optimization",
      title: "Turbo engine + high steps = waste",
      detail: `${engine.name} is a turbo model — it's designed for ${engine.params.stepsDefault} steps. ${calibration.steps} steps won't improve quality, just cost time. Try ${engine.params.stepsDefault} steps.`,
      action: { label: `Set ${engine.params.stepsDefault} steps`, type: "adjust-steps", value: String(engine.params.stepsDefault) },
    });
  }

  // 7. Prompt too short
  if (prompt.trim().length < 30) {
    suggestions.push({
      kind: "tip",
      title: "Prompt is very short",
      detail: "Detailed prompts (camera, lighting, texture, composition, mood) produce dramatically better results. Try the Prompt+ NO8D card to expand your idea, or load a Grok success template.",
    });
  }

  return suggestions;
}

// AI-powered deep analysis — calls the z-ai chat completions API for a richer
// qualitative assessment + suggestions the local rules can't catch.
export async function brainDeepAnalysis(params: {
  engineId: string;
  loraIds: string[];
  loraWeights: Record<string, number>;
  calibration: ResolvedCalibration | null;
  prompt: string;
  style: string;
}): Promise<BrainAnalysis> {
  const start = Date.now();
  const zai = await getZai();
  const engine = getEngine(params.engineId);
  const loras = params.loraIds
    .map((id) => {
      const l = getLora(id);
      return l ? { name: l.name, family: l.engineFamilies, weight: params.loraWeights[id] ?? l.recommendedWeight, category: l.category, isControl: l.isControl } : null;
    })
    .filter(Boolean);

  const localSuggestions = localCompatibilityChecks(params);

  const sys =
    "You are the NEXUS Brain Assistant, running on an uncensored Gemma 4 12B fable5 model. " +
    "You analyze the user's image-generation configuration and provide concise, actionable suggestions. " +
    "You are an expert in diffusion models, LoRA stacking, and prompt engineering. " +
    "Respond ONLY with a JSON object.";

  const user = `Analyze this image generation configuration and provide suggestions.

ENGINE: ${engine.name} (${engine.family})
- Type: ${engine.type}, LoRA compatible: ${engine.loraCompatible}, Control: ${engine.controlCompatible}
- Params: steps ${params.calibration?.steps ?? "?"}, cfg ${params.calibration?.cfg ?? "?"}, sampler ${params.calibration?.sampler ?? "?"}, resolution ${params.calibration?.resolution ?? "?"}

LORAS (${loras.length}):
${loras.map((l) => `- ${l!.name} (${l!.category}, weight ${l!.weight.toFixed(2)}, families: ${l!.family.join("/") || "universal"}${l!.isControl ? ", CONTROL" : ""})`).join("\n")}

STYLE: ${params.style}
PROMPT (first 300 chars): ${params.prompt.slice(0, 300)}

Provide up to 3 ADDITIONAL suggestions beyond the basic compatibility checks.
Focus on: prompt quality for this engine, LoRA synergy, style/aspect fit, and one concrete improvement.

Respond as JSON:
{
  "suggestions": [
    { "kind": "tip"|"warning"|"optimization", "title": string, "detail": string }
  ],
  "summary": string,
  "confidence": number
}`;

  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: sys },
        { role: "user", content: user },
      ],
      thinking: { type: "disabled" },
    });

    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson<{ suggestions?: unknown[]; summary?: string; confidence?: number }>(raw);

    const aiSuggestions: BrainSuggestion[] = Array.isArray(parsed?.suggestions)
      ? (parsed!.suggestions as Array<Record<string, unknown>>).map((s) => ({
          kind: (s.kind as BrainSuggestion["kind"]) ?? "tip",
          title: String(s.title ?? ""),
          detail: String(s.detail ?? ""),
        }))
      : [];

    // Merge local + AI suggestions (local first — they're the critical compat checks)
    const all = [...localSuggestions, ...aiSuggestions].slice(0, 8);

    return {
      suggestions: all,
      summary: parsed?.summary ?? "Configuration analyzed.",
      confidence: typeof parsed?.confidence === "number" ? parsed.confidence : 0.7,
      ms: Date.now() - start,
    };
  } catch (e) {
    // Fall back to local-only analysis if the brain API fails
    return {
      suggestions: localSuggestions,
      summary: "Local compatibility analysis (brain API unavailable).",
      confidence: 0.5,
      ms: Date.now() - start,
    };
  }
}

function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
