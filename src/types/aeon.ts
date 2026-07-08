/**
 * AEON + LoRA TypeScript interfaces — the source-of-truth contract between
 * Studio ⇄ NEXUS OS ⇄ AEON brain.
 *
 * Based on the user's detailed architecture specification.
 */

// ── LoRA Metadata ────────────────────────────────────────────────────────────

export type LoRASource = 'huggingface' | 'civitai' | 'civitai_red' | 'local' | 'other';

export type LoRARole =
  | 'style'
  | 'detailer'
  | 'body_control'
  | 'face_control'
  | 'pose_control'
  | 'control_other'
  | 'experimental';

export type LoRAMaturityTierHint =
  | 'sfw'
  | 'mild'
  | 'mature'
  | 'explicit'
  | 'extreme';

export type LoRANSFWCategory =
  | 'none'
  | 'adult_fashion'
  | 'lingerie'
  | 'pinup'
  | 'fetish_soft'
  | 'fetish_hard'
  | 'bdsm'
  | 'other';

export interface LoRAFileVariant {
  fileName: string;
  weightName?: string;
  baseModelHint?: string;
}

export interface LoRAMetadata {
  id: string;
  name: string;
  slug?: string;
  source: LoRASource;
  url?: string;
  repoId?: string;
  modelType?: 'lora' | 'lycoris' | 'adapter' | 'other';
  baseModels?: string[];
  fileVariants?: LoRAFileVariant[];
  role: LoRARole;
  triggerWord?: string;
  recommendedWeightRange?: { min: number; max: number };
  defaultWeight?: number;
  needsReference?: boolean;
  recommendedResolutions?: string[];
  recommendedAspectRatios?: string[];
  maturityTierHint?: LoRAMaturityTierHint;
  nsfwCategories?: LoRANSFWCategory[];
  legalRiskHint?: 'normal' | 'high_risk' | 'banned' | 'unknown';
  likes?: number;
  downloads?: number;
  tags?: string[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ── AEON Generation Advice (pre-generation) ──────────────────────────────────

export interface AEONGenerationIssue {
  code:
    | 'prompt_too_vague'
    | 'prompt_overstuffed'
    | 'conflicting_styles'
    | 'too_many_loras'
    | 'lora_weight_high'
    | 'lora_weight_low'
    | 'resolution_mismatch'
    | 'aspect_ratio_mismatch'
    | 'engine_param_mismatch'
    | 'wardrobe_underspecified'
    | 'wardrobe_overconstrained'
    | 'safety_risk_hint'
    | 'other';
  severity: 'info' | 'warning' | 'error';
  message: string;
  details?: string;
}

export interface AEONLoRAWeightSuggestion {
  loraId: string;
  name?: string;
  fromWeight?: number;
  toWeight: number;
  reason?: string;
}

export interface AEONPresetSuggestion {
  id: string;
  label: string;
  description: string;
}

export interface AEONParamSuggestion {
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  scheduler?: string;
  resolution?: { width: number; height: number };
  aspectRatio?: string;
}

export interface AEONPromptRewrite {
  original: string;
  rewritten: string;
  rationale?: string;
}

export interface AEONGenerationAdvice {
  version: string;
  summary: string;
  overallQualityHint?: 'weak' | 'ok' | 'strong' | 'excellent';
  estimatedRiskHint?: 'low' | 'medium' | 'high';
  issues: AEONGenerationIssue[];
  promptRewrite?: AEONPromptRewrite;
  loraWeightSuggestions?: AEONLoRAWeightSuggestion[];
  paramSuggestion?: AEONParamSuggestion;
  recommendedPresets?: AEONPresetSuggestion[];
  reasoningTrace?: string;
}

// ── AEON Safety Verdict (post-generation) ────────────────────────────────────

export type AEONMaturityTier =
  | 'sfw'
  | 'suggestive'
  | 'partial_nudity'
  | 'explicit'
  | 'banned';

export type AEONPolicyVerdict = 'allowed' | 'restricted' | 'blocked';

export interface AEONScoreBreakdown {
  visualQuality?: number;
  promptAdherence?: number;
  wardrobeMatch?: number;
  anatomy?: number;
  faceQuality?: number;
  composition?: number;
  lighting?: number;
  overall?: number;
}

export interface AEONRiskAxes {
  age: 'clear_adult' | 'ambiguous' | 'likely_minor' | 'minor' | 'unknown';
  coercion: 'none' | 'implied' | 'explicit' | 'unknown';
  violence: 'none' | 'stylized' | 'graphic' | 'unknown';
  fetish: 'none' | 'mild' | 'strong' | 'extreme' | 'unknown';
  privacy: 'none' | 'real_person_likeness' | 'sensitive_context' | 'unknown';
}

export interface AEONFindingItem {
  label: string;
  details?: string;
}

export interface AEONSafetyVerdict {
  version: string;
  maturityTier: AEONMaturityTier;
  policyVerdict: AEONPolicyVerdict;
  scores: AEONScoreBreakdown;
  riskAxes: AEONRiskAxes;
  summary: string;
  reasons: string[];
  strengths?: AEONFindingItem[];
  weaknesses?: AEONFindingItem[];
  improvementTips?: string[];
  flags?: string[];
  context?: {
    promptSnippet?: string;
    loraIds?: string[];
    engine?: string;
  };
  reasoningTrace?: string;
}

// ── AEON Backend Tracking ────────────────────────────────────────────────────

export type AEONBackendKind = 'aeon_modal' | 'z_ai_fallback' | 'other';

export interface AEONCallMeta {
  backend: AEONBackendKind;
  modelName: string;
  latencyMs?: number;
  success: boolean;
  errorMessage?: string;
}

export interface AEONJudgedResult {
  verdict: AEONSafetyVerdict | null;
  meta: AEONCallMeta;
}

export interface AEONGenerationAdvisedResult {
  advice: AEONGenerationAdvice | null;
  meta: AEONCallMeta;
}

// ── AEON Workflow Advice (gallery-level) ─────────────────────────────────────

export interface AEONWorkflowPresetLoRAConfig {
  loraId: string;
  name?: string;
  role?: LoRARole;
  weight: number;
  weightRange?: { min: number; max: number };
  notes?: string;
}

export interface AEONWorkflowPresetEngineConfig {
  engine: string;
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  scheduler?: string;
  resolution?: { width: number; height: number };
  aspectRatio?: string;
}

export interface AEONWorkflowPreset {
  id: string;
  label: string;
  description: string;
  examplePrompt?: string;
  engineConfig: AEONWorkflowPresetEngineConfig;
  loras: AEONWorkflowPresetLoRAConfig[];
  bestFor?: string[];
  avoidFor?: string[];
}

export interface AEONWorkflowLoRAInsight {
  loraId: string;
  name?: string;
  goodFor?: string[];
  badFor?: string[];
  suggestedWeightRange?: { min: number; max: number };
  commonArtifacts?: string[];
  pairingSuggestions?: string[];
}

export interface AEONWorkflowAdvice {
  version: string;
  summary: string;
  canonicalPresets: AEONWorkflowPreset[];
  loraInsights: AEONWorkflowLoRAInsight[];
  commonFailureModes: string[];
  recommendedNextExperiments: string[];
  reasoningTrace?: string;
}
