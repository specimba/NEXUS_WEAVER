/**
 * NEXUS Weaver — Taste Profile System
 *
 * Tracks user aesthetic preferences over time. Every approved/rejected
 * generation feeds into the profile, which the prompt enhancer uses to
 * personalize future suggestions.
 *
 * The profile is stored in the database (TasteProfile Prisma model) and
 * includes:
 * - Approved prompt patterns
 * - Successful LoRA combinations + weights
 * - Preferred styles, colors, compositions
 * - Lore entries that produce high scores
 * - Time-based evolution (taste changes over time)
 *
 * This data feeds into two outputs:
 * 1. Real-time: the prompt enhancer uses it to bias lore selection
 * 2. Batch: the MeGA LoRA distillation pipeline uses it as training data
 */

import { db } from "@/lib/db";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TasteVector {
  /** Style preferences (cinematic, photorealistic, anime, etc.) */
  styles: Record<string, number>; // style → weight (0-1)
  /** Color palette preferences */
  colors: Record<string, number>;
  /** Composition preferences */
  compositions: Record<string, number>;
  /** Lore entry IDs that consistently produce high scores */
  preferredLore: Record<string, number>; // loreId → approval count
  /** LoRA combinations that work well (serialized as "lora1:lora2") */
  preferredLoraCombos: Record<string, number>;
  /** Prompt keywords that correlate with high scores */
  highScoreKeywords: Record<string, number>;
  /** Prompt keywords that correlate with low scores */
  lowScoreKeywords: Record<string, number>;
  /** Average scores by aspect ratio */
  aspectRatioScores: Record<string, number>;
  /** Total generations analyzed */
  totalAnalyzed: number;
  /** Last updated timestamp */
  updatedAt: string;
}

// ── Taste Profile Management ─────────────────────────────────────────────────

/**
 * Load the user's taste profile from the database.
 * If no profile exists, returns a default empty profile.
 */
export async function loadTasteProfile(): Promise<TasteVector> {
  try {
    const profile = await db.tasteProfile.findFirst({
      orderBy: { updatedAt: "desc" },
    });
    if (profile) {
      return {
        styles: JSON.parse(profile.styles || "{}"),
        colors: JSON.parse(profile.colors || "{}"),
        compositions: JSON.parse(profile.compositions || "{}"),
        preferredLore: JSON.parse(profile.preferredLore || "{}"),
        preferredLoraCombos: JSON.parse(profile.preferredLoraCombos || "{}"),
        highScoreKeywords: JSON.parse(profile.highScoreKeywords || "{}"),
        lowScoreKeywords: JSON.parse(profile.lowScoreKeywords || "{}"),
        aspectRatioScores: JSON.parse(profile.aspectRatioScores || "{}"),
        totalAnalyzed: profile.totalAnalyzed,
        updatedAt: profile.updatedAt.toISOString(),
      };
    }
  } catch (err) {
    console.error("[taste-profile] Failed to load:", err);
  }
  return emptyTasteProfile();
}

function emptyTasteProfile(): TasteVector {
  return {
    styles: {},
    colors: {},
    compositions: {},
    preferredLore: {},
    preferredLoraCombos: {},
    highScoreKeywords: {},
    lowScoreKeywords: {},
    aspectRatioScores: {},
    totalAnalyzed: 0,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Record a generation outcome in the taste profile.
 * Called after the user approves or rejects a generation.
 */
export async function recordGenerationOutcome(params: {
  prompt: string;
  style: string;
  aspect: string;
  loraIds: string[];
  loraWeights: Record<string, number>;
  loreEntriesUsed: string[];
  overallScore: number;
  approved: boolean;
  verdict: string;
}): Promise<void> {
  const {
    prompt,
    style,
    aspect,
    loraIds,
    loraWeights,
    loreEntriesUsed,
    overallScore,
    approved,
  } = params;

  try {
    const profile = await loadTasteProfile();

    // Update style preference
    if (!profile.styles[style]) profile.styles[style] = 0;
    profile.styles[style] += approved ? 1 : -0.5;

    // Update aspect ratio scores
    if (!profile.aspectRatioScores[aspect]) profile.aspectRatioScores[aspect] = 0;
    const aspectCount = Object.values(profile.aspectRatioScores).reduce((a, b) => a + Math.abs(b), 0) || 1;
    profile.aspectRatioScores[aspect] =
      (profile.aspectRatioScores[aspect] * (aspectCount - 1) + overallScore) / aspectCount;

    // Update lore preferences
    for (const loreId of loreEntriesUsed) {
      if (!profile.preferredLore[loreId]) profile.preferredLore[loreId] = 0;
      profile.preferredLore[loreId] += approved ? 1 : -0.5;
    }

    // Update LoRA combination preferences
    if (loraIds.length > 0) {
      const comboKey = loraIds.sort().join(":");
      if (!profile.preferredLoraCombos[comboKey]) profile.preferredLoraCombos[comboKey] = 0;
      profile.preferredLoraCombos[comboKey] += approved ? 1 : -0.5;
    }

    // Extract keywords from prompt and correlate with score
    const keywords = extractKeywords(prompt);
    const keywordBucket = overallScore > 85 ? profile.highScoreKeywords : profile.lowScoreKeywords;
    for (const kw of keywords) {
      if (!keywordBucket[kw]) keywordBucket[kw] = 0;
      keywordBucket[kw] += 1;
    }

    profile.totalAnalyzed++;
    profile.updatedAt = new Date().toISOString();

    // Save to database
    await db.tasteProfile.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        styles: JSON.stringify(profile.styles),
        colors: JSON.stringify(profile.colors),
        compositions: JSON.stringify(profile.compositions),
        preferredLore: JSON.stringify(profile.preferredLore),
        preferredLoraCombos: JSON.stringify(profile.preferredLoraCombos),
        highScoreKeywords: JSON.stringify(profile.highScoreKeywords),
        lowScoreKeywords: JSON.stringify(profile.lowScoreKeywords),
        aspectRatioScores: JSON.stringify(profile.aspectRatioScores),
        totalAnalyzed: profile.totalAnalyzed,
      },
      update: {
        styles: JSON.stringify(profile.styles),
        colors: JSON.stringify(profile.colors),
        compositions: JSON.stringify(profile.compositions),
        preferredLore: JSON.stringify(profile.preferredLore),
        preferredLoraCombos: JSON.stringify(profile.preferredLoraCombos),
        highScoreKeywords: JSON.stringify(profile.highScoreKeywords),
        lowScoreKeywords: JSON.stringify(profile.lowScoreKeywords),
        aspectRatioScores: JSON.stringify(profile.aspectRatioScores),
        totalAnalyzed: profile.totalAnalyzed,
      },
    });
  } catch (err) {
    console.error("[taste-profile] Failed to record outcome:", err);
  }
}

/**
 * Get taste-weighted lore preferences.
 * Returns lore entry IDs sorted by taste score.
 */
export async function getPreferredLoreIds(): Promise<string[]> {
  const profile = await loadTasteProfile();
  return Object.entries(profile.preferredLore)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/**
 * Get the user's top preferred styles.
 */
export async function getPreferredStyles(): Promise<string[]> {
  const profile = await loadTasteProfile();
  return Object.entries(profile.styles)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([style]) => style);
}

// ── Keyword Extraction ───────────────────────────────────────────────────────

function extractKeywords(prompt: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
    "been", "being", "have", "has", "had", "do", "does", "did", "will",
    "would", "could", "should", "may", "might", "must", "shall", "can",
    "this", "that", "these", "those", "i", "you", "he", "she", "it",
    "we", "they", "what", "which", "who", "when", "where", "why", "how",
    "all", "each", "every", "both", "few", "more", "most", "other",
    "some", "such", "no", "nor", "not", "only", "own", "same", "so",
    "than", "too", "very", "s", "t", "just", "don", "now", "ultra",
    "detailed", "sharp", "focus", "professional", "composition", "high",
    "quality", "stunning", "beautiful", "gorgeous", "amazing", "8k", "4k",
  ]);

  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopWords.has(w))
    .slice(0, 20); // Top 20 keywords
}
