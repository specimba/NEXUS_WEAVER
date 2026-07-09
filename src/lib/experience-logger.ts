/**
 * NEXUS Weaver — Experience Logger
 *
 * Logs every generation (approved + rejected) as a structured "experience"
 * for the MeGA LoRA distillation pipeline. Over time, approved (prompt, image)
 * pairs become training data for a custom LoRA that encodes the user's
 * aesthetic preferences — the "MeGA LoRA NEXUS edition pack".
 *
 * Each experience records:
 * - The full prompt (user input + lore enrichment)
 * - The LoRA stack + weights used
 * - The engine + calibration params
 * - The judge scores + verdict
 * - The seed (for reproducibility)
 * - The image data (base64, for future training)
 * - The lore entries matched
 * - The taste profile state at generation time
 */

import { db } from "@/lib/db";

export interface ExperienceRecord {
  generationId: string;
  prompt: string;
  enrichedPrompt: string;
  style: string;
  aspect: string;
  engineId: string;
  calibrationId: string;
  loraIds: string[];
  loraWeights: Record<string, number>;
  seed: number;
  loreEntriesUsed: string[];
  overallScore: number | null;
  verdict: string | null;
  approved: boolean;
  safetyScore: number | null;
  promptAdherence: number | null;
  visualQuality: number | null;
  aestheticScore: number | null;
  wardrobeMatch: number | null;
  imagePath: string | null;
  createdAt: Date;
}

/**
 * Log a generation as an experience record.
 * Called after the pipeline completes (approved, rejected, or failed).
 */
export async function logExperience(params: {
  generationId: string;
  prompt: string;
  enrichedPrompt?: string;
  style: string;
  aspect: string;
  engineId: string;
  calibrationId: string;
  loraIds: string[];
  loraWeights: Record<string, number>;
  seed: number;
  loreEntriesUsed: string[];
  overallScore: number | null;
  verdict: string | null;
  approved: boolean;
  safetyScore?: number | null;
  promptAdherence?: number | null;
  visualQuality?: number | null;
  aestheticScore?: number | null;
  wardrobeMatch?: number | null;
  imagePath: string | null;
}): Promise<void> {
  try {
    await db.experienceLog.create({
      data: {
        generationId: params.generationId,
        prompt: params.prompt,
        enrichedPrompt: params.enrichedPrompt || params.prompt,
        style: params.style,
        aspect: params.aspect,
        engineId: params.engineId,
        calibrationId: params.calibrationId,
        loraIds: params.loraIds.join(","),
        loraWeights: JSON.stringify(params.loraWeights),
        seed: BigInt(params.seed),
        loreEntriesUsed: JSON.stringify(params.loreEntriesUsed),
        overallScore: params.overallScore,
        verdict: params.verdict,
        approved: params.approved,
        safetyScore: params.safetyScore ?? null,
        promptAdherence: params.promptAdherence ?? null,
        visualQuality: params.visualQuality ?? null,
        aestheticScore: params.aestheticScore ?? null,
        wardrobeMatch: params.wardrobeMatch ?? null,
        imagePath: params.imagePath,
      },
    });
  } catch (err) {
    console.error("[experience-logger] Failed to log:", err);
  }
}

/**
 * Get approved experiences for MeGA LoRA training.
 * Returns only approved generations with score >= threshold.
 */
export async function getApprovedExperiencesForTraining(
  minScore: number = 85,
  limit: number = 100
): Promise<ExperienceRecord[]> {
  const records = await db.experienceLog.findMany({
    where: {
      approved: true,
      overallScore: { gte: minScore },
    },
    orderBy: { overallScore: "desc" },
    take: limit,
  });

  return records.map((r) => ({
    generationId: r.generationId,
    prompt: r.prompt,
    enrichedPrompt: r.enrichedPrompt,
    style: r.style,
    aspect: r.aspect,
    engineId: r.engineId,
    calibrationId: r.calibrationId,
    loraIds: r.loraIds ? r.loraIds.split(",").filter(Boolean) : [],
    loraWeights: JSON.parse(r.loraWeights || "{}"),
    seed: Number(r.seed),
    loreEntriesUsed: JSON.parse(r.loreEntriesUsed || "[]"),
    overallScore: r.overallScore,
    verdict: r.verdict,
    approved: r.approved,
    safetyScore: r.safetyScore,
    promptAdherence: r.promptAdherence,
    visualQuality: r.visualQuality,
    aestheticScore: r.aestheticScore,
    wardrobeMatch: r.wardrobeMatch,
    imagePath: r.imagePath,
    createdAt: r.createdAt,
  }));
}

/**
 * Get statistics about the experience log.
 */
export async function getExperienceStats(): Promise<{
  total: number;
  approved: number;
  rejected: number;
  avgScore: number;
  topPrompts: Array<{ prompt: string; score: number }>;
  topLoraCombos: Array<{ combo: string; count: number; avgScore: number }>;
}> {
  const total = await db.experienceLog.count();
  const approved = await db.experienceLog.count({ where: { approved: true } });
  const rejected = await db.experienceLog.count({ where: { approved: false } });

  const avgResult = await db.experienceLog.aggregate({
    _avg: { overallScore: true },
    where: { overallScore: { not: null } },
  });

  // Get top scoring prompts
  const topRecords = await db.experienceLog.findMany({
    where: { approved: true, overallScore: { gte: 90 } },
    orderBy: { overallScore: "desc" },
    take: 10,
    select: { prompt: true, overallScore: true },
  });

  // Get top LoRA combinations
  const allRecords = await db.experienceLog.findMany({
    where: { approved: true },
    select: { loraIds: true, overallScore: true },
  });

  const comboStats: Record<string, { count: number; totalScore: number }> = {};
  for (const r of allRecords) {
    if (r.loraIds) {
      const combo = r.loraIds.split(",").sort().join("+");
      if (!comboStats[combo]) comboStats[combo] = { count: 0, totalScore: 0 };
      comboStats[combo].count++;
      comboStats[combo].totalScore += r.overallScore || 0;
    }
  }

  const topLoraCombos = Object.entries(comboStats)
    .map(([combo, stats]) => ({
      combo,
      count: stats.count,
      avgScore: stats.totalScore / stats.count,
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 5);

  return {
    total,
    approved,
    rejected,
    avgScore: avgResult._avg.overallScore || 0,
    topPrompts: topRecords.map((r) => ({
      prompt: r.prompt.slice(0, 100),
      score: r.overallScore || 0,
    })),
    topLoraCombos,
  };
}
