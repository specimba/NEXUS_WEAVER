// NEXUS Visual Weaver v4 — Brain / Judge Catalog
// ---------------------------------------------------------------------------
// The "brain" is the uncensored-visual-ability reasoning model that powers the
// pipeline's safety scan (ST3GG), visual judge (MiniCPM-V role), and evidence
// evidence aggregator. Per Canberk's spec, the brain should be an
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
  roles: ("safety" | "judge" | "evidence" | "creative")[];
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
    id: "qwen3-5-9b-unredacted",
    name: "Qwen3.5-9B-Unredacted-MAX",
    shortName: "Qwen 9B",
    hfUrl: "https://huggingface.co/prithivMLmods/Qwen3.5-9B-Unredacted-MAX",
    description:
      "9B VLM, 94.5% non-refusal rate. Deployed as Modal Managed Endpoint on L40S. " +
      "Handles ST3GG safety scan + evidence aggregation. Benchmark: 0.84 req/s, E2E 3.1s.",
    specialty: "Fast text safety scanning + evidence aggregation (94.5% non-refusal).",
    quantization: "BF16",
    roles: ["safety", "evidence"],
    uncensored: true,
    reasoning: "standard",
    params: "~9B",
    contextWindow: "128k",
    estMsPerCall: 3100,
    trend: "rising",
    recommended: true,
  },
  {
    id: "gemma-4-31b-heretic",
    name: "Gemma-4-31B-it-Uncensored-Heretic",
    shortName: "Gemma 31B",
    hfUrl: "https://huggingface.co/llmfan46/gemma-4-31B-it-uncensored-heretic",
    description:
      "31B VLM, 10/100 refusals (heretic ARA), 0.0541 KL divergence. Deployed as Modal " +
      "Managed Endpoint on L40S. Handles visual judge — analyzes generated images for " +
      "quality scoring. Benchmark: 0.77 req/s, E2E 4.1s, MMLU 85.90%.",
    specialty: "Vision quality scoring — 10/100 refusals, minimal quality loss from uncensoring.",
    quantization: "BF16 + mmproj",
    roles: ["judge"],
    uncensored: true,
    reasoning: "standard",
    params: "~31B",
    contextWindow: "256k",
    estMsPerCall: 4100,
    trend: "rising",
  },
  {
    id: "brisk-evolution-4b",
    name: "Brisk-Evolution-4B-v0.1",
    shortName: "Brisk 4B",
    hfUrl: "https://huggingface.co/ReadyArt/Brisk-Evolution-4B-v0.1",
    description:
      "4B model for lore-aware prompt enhancement + story generation + aesthetic quirks. " +
      "Deployed as Modal Managed Endpoint on L40S. Fastest brain model. " +
      "Benchmark: 0.90 req/s, E2E 2.3s. Used for NO8D Prompt+ Expand + creative enhancement.",
    specialty: "Lore + story + prompt expansion — fastest brain (0.90 req/s).",
    quantization: "BF16",
    roles: ["creative"],
    uncensored: true,
    reasoning: "standard",
    params: "~4B",
    contextWindow: "128k",
    estMsPerCall: 2300,
    trend: "rising",
  },
];

export const DEFAULT_BRAIN_ID = "qwen3-5-9b-unredacted";

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
    "You are the evidence evidence aggregator, running on an uncensored Gemma 4 12B heretic composer2.5 brain. " +
    "You aggregate scan + judge outputs into a single structured evidence object with strong JSON discipline. " +
    "Respond ONLY with a JSON object.",
};
