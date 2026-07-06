// NEXUS Visual Weaver — Safety Policy & Legal Compliance Module
// ---------------------------------------------------------------------------
// Implements the NSFW 18+ safety layer and EU-aligned legal/policy coverage.
//
// DESIGN PRINCIPLES (conservative-default):
//   1. Mature (18+) content is OFF by default. Unlocking requires an explicit,
//      recorded consent step (age declaration + accept/reject).
//   2. A HARD BLOCKLIST always applies and cannot be disabled, even after
//      consent. This covers categories that are illegal or non-consensual:
//      CSAM / minors, nonconsensual intimate imagery, real-person likeness
//      abuse, extreme violence, hate symbols, self-harm.
//   3. The end user bears full responsibility for generated content. The
//      platform provides tooling + governance, not editorial control.
//   4. EU AI Act / DSA alignment: transparency obligations, risk-tier
//      labelling, user redress, and provenance logging.
//
// This module is the single source of truth for policy. The DB PolicyConfig
// row stores user-tunable overrides; this file provides defaults + the hard
// rules that never change.
// ---------------------------------------------------------------------------

import { db } from "@/lib/db";

// Policy version is hashed into consent records so a user re-consents when
// the legal text materially changes.
export const POLICY_VERSION = "nexus-v3.0-2026-eu";

// The full legal acknowledgement text the user must accept to unlock mature.
export const MATURE_ACK_TEXT = [
  "I confirm I am 18 years of age or older, and I am legally permitted to access adult content in my jurisdiction.",
  "I understand that generated mature content is produced by AI models and may depict fictitious persons; I will not use it to depict, impersonate, or harm any real person.",
  "I understand the platform enforces a HARD blocklist that cannot be disabled: this includes any content involving minors (CSAM), nonconsensual intimate imagery, real-person likeness abuse, extreme violence, hate symbols, and self-harm. Attempts to generate such content are logged and refused.",
  "I accept full and exclusive responsibility for any content I generate, publish, or distribute using this tool. The platform operators provide tooling and governance only, and are not responsible for end-user output.",
  "I will comply with all applicable laws, including the EU AI Act, the Digital Services Act (DSA), the GDPR, and local obscenity / child-protection statutes.",
].join(" ");

// The hard blocklist — ALWAYS enforced, never overridable.
export const HARD_BLOCKLIST: string[] = [
  "csam",
  "minors",
  "underage",
  "nonconsensual",
  "deepfake-real-person",
  "real-person-likeness",
  "extreme-violence",
  "gore",
  "hate-symbol",
  "self-harm",
  "bestiality",
  "terrorism",
];

// Tunable (user-configurable) category catalogue. These can be moved between
// "block" and "flag" lists via the Compliance view, but cannot enter the
// allow-by-default path without an explicit risk acknowledgement.
export interface PolicyCategory {
  id: string;
  label: string;
  description: string;
  defaultDisposition: "block" | "flag" | "allow";
  severity: "critical" | "high" | "medium" | "low";
}

export const POLICY_CATEGORIES: PolicyCategory[] = [
  { id: "explicit-nudity", label: "Explicit Nudity", description: "Depictions of nudity or sexual acts. 18+ only.", defaultDisposition: "block", severity: "high" },
  { id: "suggestual", label: "Suggestual Content", description: "Suggestive but non-explicit themes.", defaultDisposition: "flag", severity: "medium" },
  { id: "wardrobe-risk", label: "Wardrobe / Undress Risk", description: "Requests that push toward undress or revealing wardrobe.", defaultDisposition: "flag", severity: "medium" },
  { id: "violence-mild", label: "Mild Violence", description: "Stylized action violence without gore.", defaultDisposition: "allow", severity: "low" },
  { id: "violence-graphic", label: "Graphic Violence", description: "Realistic gore or injury depiction.", defaultDisposition: "block", severity: "high" },
  { id: "weapons", label: "Weapons & Firearms", description: "Detailed weapon depictions.", defaultDisposition: "flag", severity: "medium" },
  { id: "substance", label: "Substance Use", description: "Drug or alcohol consumption depictions.", defaultDisposition: "flag", severity: "low" },
  { id: "political", label: "Political Figures", description: "Likeness of real political figures.", defaultDisposition: "block", severity: "high" },
  { id: "religious", label: "Religious Imagery", description: "Potentially sensitive religious depictions.", defaultDisposition: "flag", severity: "medium" },
];

export type MaturityTier = "safe" | "mature" | "blocked";

export interface ActivePolicy {
  matureEnabled: boolean;
  blockCategories: string[];
  flagCategories: string[];
  minSafetyScore: number;
  policyMode: "conservative" | "permissive" | "strict";
  jurisdiction: string;
  disclaimerOverride: string | null;
  policyVersion: string;
}

export const DEFAULT_POLICY: ActivePolicy = {
  matureEnabled: false,
  blockCategories: ["explicit-nudity", "violence-graphic", "political"],
  flagCategories: ["suggestual", "wardrobe-risk", "weapons", "substance", "religious"],
  minSafetyScore: 60,
  policyMode: "conservative",
  jurisdiction: "EU",
  disclaimerOverride: null,
  policyVersion: POLICY_VERSION,
};

// The legal disclaimer rendered in the footer + compliance view.
export const LEGAL_DISCLAIMER =
  "NEXUS Visual Weaver provides AI image-generation tooling and governance infrastructure only. " +
  "All generated content is the sole responsibility of the end user. The platform operators do not " +
  "endorse, review, or take editorial responsibility for user output. You must not generate content " +
  "that is illegal in your jurisdiction, including content involving minors, nonconsensual imagery, " +
  "or real-person likeness abuse. EU users: this service is provided in alignment with the EU AI Act " +
  "transparency obligations and the Digital Services Act (DSA). Provenance and safety metadata are " +
  "logged for every generation.";

export const EU_COMPLIANCE_NOTES: { title: string; body: string }[] = [
  {
    title: "EU AI Act — Transparency (Art. 50)",
    body: "AI-generated image output is labelled and logged with provenance metadata (model chain, calibration, LoRA provenance, safety verdict). Users are informed they are interacting with an AI system.",
  },
  {
    title: "Digital Services Act (DSA)",
    body: "Mature content is gated behind an age-consent step. A hard blocklist for illegal content (CSAM, nonconsensual imagery, terrorism) is enforced and cannot be disabled. Notice-and-action mechanisms are available via the audit log.",
  },
  {
    title: "GDPR — Data Minimisation",
    body: "Consent records store only an anonymous device fingerprint + IP hash. No PII is collected with the consent record. Gallery images are user-generated artifacts stored locally; deletion is available per-item.",
  },
  {
    title: "Provenance & Audit Trail",
    body: "Every generation records its calibration preset, applied LoRAs, safety scan result, and judge verdict in an append-only audit log retained for redress and accountability.",
  },
];

// ---------------------------------------------------------------------------
// Consent + policy persistence helpers (backend only)
// ---------------------------------------------------------------------------

/** Read the active policy from DB, falling back to defaults. */
export async function getActivePolicy(): Promise<ActivePolicy> {
  try {
    const row = await db.policyConfig.findUnique({ where: { id: "active" } });
    if (!row) return { ...DEFAULT_POLICY };
    return {
      matureEnabled: row.matureEnabled,
      blockCategories: safeParseArr(row.blockCategories),
      flagCategories: safeParseArr(row.flagCategories),
      minSafetyScore: row.minSafetyScore,
      policyMode: row.policyMode as ActivePolicy["policyMode"],
      jurisdiction: row.jurisdiction,
      disclaimerOverride: row.disclaimerOverride,
      policyVersion: POLICY_VERSION,
    };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

/** Persist the active policy (upsert). */
export async function saveActivePolicy(patch: Partial<ActivePolicy>): Promise<ActivePolicy> {
  const current = await getActivePolicy();
  const merged: ActivePolicy = { ...current, ...patch, policyVersion: POLICY_VERSION };
  await db.policyConfig.upsert({
    where: { id: "active" },
    create: {
      id: "active",
      matureEnabled: merged.matureEnabled,
      blockCategories: JSON.stringify(merged.blockCategories),
      flagCategories: JSON.stringify(merged.flagCategories),
      minSafetyScore: merged.minSafetyScore,
      policyMode: merged.policyMode,
      jurisdiction: merged.jurisdiction,
      disclaimerOverride: merged.disclaimerOverride,
    },
    update: {
      matureEnabled: merged.matureEnabled,
      blockCategories: JSON.stringify(merged.blockCategories),
      flagCategories: JSON.stringify(merged.flagCategories),
      minSafetyScore: merged.minSafetyScore,
      policyMode: merged.policyMode,
      jurisdiction: merged.jurisdiction,
      disclaimerOverride: merged.disclaimerOverride,
    },
  });
  return merged;
}

/** Look up a consent record by device fingerprint. */
export async function getConsent(fingerprint: string) {
  return db.consentRecord.findUnique({ where: { fingerprint } });
}

/** Record a consent decision (accept/reject) for a device. */
export async function recordConsent(params: {
  fingerprint: string;
  status: "accepted" | "rejected" | "revoked";
  tier: MaturityTier;
  userAgent?: string;
  ipHash?: string;
}) {
  const acceptedAt = params.status === "accepted" ? new Date() : null;
  return db.consentRecord.upsert({
    where: { fingerprint: params.fingerprint },
    create: {
      fingerprint: params.fingerprint,
      status: params.status,
      policyVersion: POLICY_VERSION,
      tier: params.tier,
      ackText: MATURE_ACK_TEXT,
      userAgent: params.userAgent ?? null,
      ipHash: params.ipHash ?? null,
      acceptedAt,
    },
    update: {
      status: params.status,
      policyVersion: POLICY_VERSION,
      tier: params.tier,
      ackText: MATURE_ACK_TEXT,
      userAgent: params.userAgent ?? null,
      ipHash: params.ipHash ?? null,
      acceptedAt,
    },
  });
}

/** Decide the maturity tier for a run given consent + policy + prompt flags. */
export function resolveMaturityTier(params: {
  consentStatus: "accepted" | "rejected" | "pending" | "revoked" | null;
  policy: ActivePolicy;
  safetyFlags: string[];
  promptHasMatureSignal: boolean;
}): MaturityTier {
  const { consentStatus, policy, safetyFlags, promptHasMatureSignal } = params;
  // Hard blocklist always wins.
  const hitHard = safetyFlags.some((f) => HARD_BLOCKLIST.includes(f));
  if (hitHard) return "blocked";
  // Tunable block categories.
  const hitBlock = safetyFlags.some((f) => policy.blockCategories.includes(f));
  if (hitBlock) return "blocked";
  // If the prompt signals mature intent but mature is disabled → block.
  if (promptHasMatureSignal && !policy.matureEnabled) return "blocked";
  // If mature intent + consent not accepted → block.
  if (promptHasMatureSignal && consentStatus !== "accepted") return "blocked";
  return policy.matureEnabled ? "mature" : "safe";
}

function safeParseArr(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
