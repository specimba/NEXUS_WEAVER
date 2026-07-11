/**
 * NEXUS Visual Weaver — Local Safety Checker (v5.46)
 *
 * Replaces the ST3GG brain endpoint when it's unavailable (503/budget pause).
 * Provides keyword-based safety scanning with:
 * - Hard blocklist (always enforced, even in degraded mode)
 * - Policy category flags (suggestual, wardrobe-risk, violence-mild, etc.)
 * - Risk level + score computation
 * - Mature signal detection
 *
 * This is NOT a substitute for the Qwen 9B brain — it's a heuristic fallback
 * that covers the most critical cases. The output format matches SafetyResult
 * so the pipeline can use it transparently.
 *
 * Backend only — used by pipeline.ts when skipBrain=true.
 */

import type { SafetyResult } from "@/lib/nexus-types";

// Hard blocklist — ALWAYS enforced, even in degraded mode.
// These prompts are refused regardless of user consent or policy.
const HARD_BLOCKLIST_PATTERNS: Array<{ pattern: RegExp; flag: string; label: string }> = [
  { pattern: /\b(csam|child\s*porn|minor\s*nud|underage\s*(girl|boy|teen)|loli\s*(con|porn)|shota\s*con)\b/i, flag: "csam", label: "CSAM / minors" },
  { pattern: /\b(nonconsensual|non-consensual|deepfake|revenge\s*porn|without\s*consent)\b/i, flag: "nonconsensual", label: "Nonconsensual content" },
  { pattern: /\b(real\s*person|celebrity\s*(nude|face|likeness)|taylor\s*swift|scarlett\s*johansson|emma\s*watson)\b/i, flag: "real-person-likeness", label: "Real person likeness abuse" },
  { pattern: /\b(beheading|dismemberment|gore|snuff|execution\s*video|torture\s*scene)\b/i, flag: "extreme-violence", label: "Extreme violence/gore" },
  { pattern: /\b(nazi|swastika|kkk|white\s*power|hate\s*symbol)\b/i, flag: "hate-symbol", label: "Hate symbol" },
  { pattern: /\b(self.harm|suicide\s*method|cutting\s*wrist|kill\s*myself)\b/i, flag: "self-harm", label: "Self-harm" },
  { pattern: /\b(bestiality|animal\s*abuse)\b/i, flag: "bestiality", label: "Bestiality" },
  { pattern: /\b(terrorist|isis|al.qaeda|bomb\s*making|explosive\s*recipe)\b/i, flag: "terrorism", label: "Terrorism" },
];

// Policy category flags — scored but not hard-blocked.
const POLICY_PATTERNS: Array<{ pattern: RegExp; flag: string; weight: number }> = [
  { pattern: /\b(nude|nudity|topless|bottomless|naked|bare\s*breast|explicit\s*sex)\b/i, flag: "explicit-nudity", weight: 30 },
  { pattern: /\b(lingerie|underwear|bikini|panties|bra|thong|see.through|sheer\s*fabric)\b/i, flag: "suggestual", weight: 15 },
  { pattern: /\b(wardrobe\s*malfunction|undress|stripping|removing\s*clothes)\b/i, flag: "wardrobe-risk", weight: 20 },
  { pattern: /\b(blood|wound|stab|shoot|gun|knife\s*attack|fighting)\b/i, flag: "violence-mild", weight: 10 },
  { pattern: /\b(gore|dismember|massacre|slaughter|graphic\s*violence)\b/i, flag: "violence-graphic", weight: 25 },
  { pattern: /\b(gun|pistol|rifle|sword|weapon|firearm)\b/i, flag: "weapons", weight: 5 },
  { pattern: /\b(drug|cocaine|heroin|meth|syringe|injection)\b/i, flag: "substance", weight: 10 },
  { pattern: /\b(political|election|candidate|politician)\b/i, flag: "political", weight: 5 },
  { pattern: /\b(religious|prophet|buddha|jesus|allah|muhammad)\b/i, flag: "religious", weight: 5 },
];

// Mature signal — prompts that request mature content.
const MATURE_SIGNAL_RE = /\b(nude|nudity|nsfw|explicit|18\+|adult|mature|erotic|lingerie|undress|topless|bottomless|sexy|seductive|provocative)\b/i;

export interface LocalSafetyResult extends SafetyResult {
  source: "local" | "brain";
  loreAdvice?: string[];
}

/**
 * Local safety scan — replaces ST3GG when brain is unavailable.
 *
 * Returns a SafetyResult-compatible object with:
 * - passed: true if no hard-block flags + score >= 40
 * - score: 0-100 (100 = perfectly safe)
 * - riskLevel: safe | low | medium | high | critical
 * - flags: array of flag codes
 * - rationale: human-readable explanation
 * - source: "local" (this is a heuristic, not the brain)
 */
export function localSafetyScan(
  prompt: string,
  style: string,
  wardrobe: string | null
): LocalSafetyResult {
  const fullText = `${prompt} ${style} ${wardrobe || ""}`;

  // 1. Check hard blocklist — ALWAYS enforced
  const hardFlags: string[] = [];
  for (const { pattern, flag, label } of HARD_BLOCKLIST_PATTERNS) {
    if (pattern.test(fullText)) {
      hardFlags.push(flag);
    }
  }

  if (hardFlags.length > 0) {
    return {
      passed: false,
      score: 0,
      riskLevel: "critical",
      flags: hardFlags,
      rationale: `BLOCKED by local safety check: ${hardFlags.join(", ")}. This content is always refused regardless of settings.`,
      stageMs: 0,
      source: "local",
    };
  }

  // 2. Check policy categories — scored
  const policyFlags: string[] = [];
  let penalty = 0;
  for (const { pattern, flag, weight } of POLICY_PATTERNS) {
    if (pattern.test(fullText)) {
      policyFlags.push(flag);
      penalty += weight;
    }
  }

  // 3. Compute score (100 - penalty, min 10)
  const score = Math.max(10, 100 - penalty);

  // 4. Determine risk level
  let riskLevel: SafetyResult["riskLevel"];
  if (score >= 85) riskLevel = "safe";
  else if (score >= 70) riskLevel = "low";
  else if (score >= 50) riskLevel = "medium";
  else if (score >= 30) riskLevel = "high";
  else riskLevel = "critical";

  // 5. Determine if passed (score >= 40 and not critical)
  const passed = score >= 40 && riskLevel !== "critical";

  // 6. Build rationale
  const matureSignal = MATURE_SIGNAL_RE.test(fullText);
  let rationale = `Local safety check (heuristic): score ${score}, risk ${riskLevel}`;
  if (policyFlags.length > 0) {
    rationale += `. Flags: ${policyFlags.join(", ")}`;
  }
  if (matureSignal && policyFlags.length === 0) {
    rationale += `. Mature signal detected but no explicit policy violation.`;
  }
  rationale += `. NOTE: This is a local heuristic — for full analysis, enable brain endpoints.`;

  return {
    passed,
    score,
    riskLevel,
    flags: [...hardFlags, ...policyFlags],
    rationale,
    stageMs: 0,
    source: "local",
    loreAdvice: matureSignal ? ["Mature content detected — ensure 18+ consent is active."] : undefined,
  };
}

/**
 * Quick check: does the prompt contain any hard-blocklisted content?
 * Used by the UI for real-time feedback before the user runs the pipeline.
 */
export function hasHardBlock(prompt: string): { blocked: boolean; flags: string[] } {
  const flags: string[] = [];
  for (const { pattern, flag } of HARD_BLOCKLIST_PATTERNS) {
    if (pattern.test(prompt)) {
      flags.push(flag);
    }
  }
  return { blocked: flags.length > 0, flags };
}
