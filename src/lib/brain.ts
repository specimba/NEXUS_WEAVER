// NEXUS Visual Weaver v4 — Brain / Judge Catalog
// ---------------------------------------------------------------------------
// The "brain" is the uncensored-visual-ability reasoning model that powers the
// pipeline's safety scan (ST3GG), visual judge (MiniCPM-V role), and evidence
// parser (Nemotron role). Per Canberk's spec, the brain should be an
// UNCENSORED Gemma 4 12B variant (fable5 reasoning, abliterated) so it can
// reason about mature visual content without refusing to analyze it.
//
// IMPORTANT: In this sandbox the actual LLM calls go through z-ai-web-dev-sdk
// (which serves its own hosted model). The Brain config here selects which
// *target* brain the pipeline is configured against — the prompts are tuned
// per brain, and the provenance records the intended brain. When self-hosted
// on Modal (vLLM/sglang), these configs map 1:1 to the HF repo.
// ---------------------------------------------------------------------------

export interface BrainModel {
  id: string;
  name: string;
  shortName: string;
  hfUrl: string;
  description: string;
  // why this brain: its reasoning specialty
  specialty: string;
  quantization: string;
  // which pipeline roles this brain is suited for
  roles: ("safety" | "judge" | "evidence")[];
  // is this an uncensored / abliterated variant (can analyze mature content)
  uncensored: boolean;
  // fable5 / composer reasoning capability
  reasoning: "fable5" | "composer2.5" | "standard";
  params: string; // e.g. "~12B params"
  contextWindow: string;
  estMsPerCall: number;
  trend: "rising" | "stable";
  recommended?: boolean;
}

export const BRAIN_MODELS: BrainModel[] = [
  {
    id: "gemma4-12b-fable5-abliterated",
    name: "Gemma 4 12B — Agentic Fable5 Abliterated",
    shortName: "Gemma4 Fable5",
    hfUrl: "https://huggingface.co/huihui-ai/Huihui-gemma-4-12B-agentic-fable5-ablenerated-GGUF",
    description:
      "Huihui-ai's agentic fable5 abliterated GGUF. The recommended uncensored brain — fable5 reasoning + abliteration means it will analyze mature visual content instead of refusing. Use as the default judge + evidence parser.",
    specialty: "Uncensored fable5 reasoning — analyzes mature content without refusal.",
    quantization: "GGUF (Q4–Q8)",
    roles: ["safety", "judge", "evidence"],
    uncensored: true,
    reasoning: "fable5",
    params: "~12B",
    contextWindow: "128k",
    estMsPerCall: 4000,
    trend: "rising",
    recommended: true,
  },
  {
    id: "gemma4-12b-heretic-composer",
    name: "Gemma 4 12B — Coder Fable5 Composer2.5 Uncensored Heretic",
    shortName: "Gemma4 Heretic",
    hfUrl: "https://huggingface.co/llmfan46/gemma-4-12B-coder-fable5-composer2.5-v1-uncensored-heretic",
    description:
      "llmfan46's heretic composer2.5 build. Best for fable-style reasoning + uncensored analysis. Slightly stronger code/JSON output than the agentic variant — preferred for the Nemotron evidence-parse stage.",
    specialty: "Fable reasoning + uncensored + strong JSON/evidence output.",
    quantization: "Heretic",
    roles: ["judge", "evidence"],
    uncensored: true,
    reasoning: "composer2.5",
    params: "~12B",
    contextWindow: "128k",
    estMsPerCall: 4200,
    trend: "rising",
  },
  {
    id: "jarod2212-collection",
    name: "jarod2212 Model Collection",
    shortName: "jarod2212",
    hfUrl: "https://huggingface.co/jarod2212/models",
    description:
      "Curated collection of additional uncensored reasoning models. Swap in when a specialized task (e.g. agentic tool-use judge) needs a different profile.",
    specialty: "Specialized uncensored variants — pick per task.",
    quantization: "varies",
    roles: ["judge", "evidence"],
    uncensored: true,
    reasoning: "fable5",
    params: "varies",
    contextWindow: "varies",
    estMsPerCall: 4000,
    trend: "rising",
  },
  {
    id: "qwen3-vl-uncensored",
    name: "Qwen3 VL Uncensored (nDimensional block)",
    shortName: "Qwen3 VL",
    hfUrl: "https://huggingface.co/nDimensional/Qwen3.5-35B-A3B-Uncensored-FP8_BLOCK",
    description:
      "Vision-capable uncensored alternative for the visual-judge role when a Gemma variant isn't available. Larger footprint.",
    specialty: "Vision + uncensored — visual judge fallback.",
    quantization: "FP8",
    roles: ["judge"],
    uncensored: true,
    reasoning: "standard",
    params: "~35B A3B",
    contextWindow: "128k",
    estMsPerCall: 6000,
    trend: "stable",
  },
];

export const DEFAULT_BRAIN_ID = "gemma4-12b-fable5-abliterated";

export function getBrain(id: string | null | undefined): BrainModel {
  if (!id) return BRAIN_MODELS[0];
  return BRAIN_MODELS.find((b) => b.id === id) ?? BRAIN_MODELS[0];
}

export function brainsForRole(role: "safety" | "judge" | "evidence"): BrainModel[] {
  return BRAIN_MODELS.filter((b) => b.roles.includes(role));
}

// The system prompts for each pipeline role, tuned for an uncensored-analysis
// brain. The brain ANALYZES content (including mature) to produce safety
// verdicts + quality scores — it does not generate mature content itself.
export const BRAIN_ROLE_PROMPTS: Record<"safety" | "judge" | "evidence", string> = {
  safety:
    "You are the ST3GG safety classifier, running on an uncensored Gemma 4 12B fable5 brain. " +
    "Your job is to ANALYZE the generation request for policy risk — including mature content — and produce " +
    "a structured safety verdict. You must not refuse to analyze; you classify and flag. " +
    "Respond ONLY with a JSON object.",
  judge:
    "You are the visual judge, running on an uncensored Gemma 4 12B fable5 brain. " +
    "You rigorously score generated images — including mature imagery — on prompt adherence, visual quality, " +
    "aesthetics, and safety. You analyze; you do not refuse. " +
    "Respond ONLY with a JSON object following the requested schema.",
  evidence:
    "You are the evidence parser (Nemotron role), running on an uncensored Gemma 4 12B heretic composer2.5 brain. " +
    "You aggregate scan + judge outputs into a single structured evidence object with strong JSON discipline. " +
    "Respond ONLY with a JSON object.",
};
