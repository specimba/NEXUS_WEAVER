/**
 * NEXUS Visual Weaver — Local Quality Scorer (v5.46)
 *
 * Replaces the Judge brain endpoint when it's unavailable (503/budget pause).
 * Provides heuristic quality scoring based on:
 * - Prompt analysis (length, specificity, structure)
 * - LoRA configuration (count, weights, compatibility)
 * - Calibration settings (steps, CFG, resolution)
 * - Generation metadata (seed, engine)
 *
 * This is NOT a vision model — it can't actually see the image. It scores
 * the POTENTIAL quality based on the configuration. The real Judge (Gemma 31B
 * vision) would score the actual output image.
 *
 * Backend only — used by pipeline.ts when skipBrain=true.
 */

import type { JudgeResult } from "@/lib/nexus-types";

export interface LocalJudgeResult extends JudgeResult {
  source: "local" | "brain";
  analysisNotes: string[];
}

/**
 * Local quality scoring — replaces Judge when brain is unavailable.
 *
 * Scores are HEURISTIC — based on configuration quality, not image analysis.
 * The real Judge would analyze the actual generated image with vision.
 */
export function localJudge(
  prompt: string,
  style: string,
  loraIds: string[],
  loraWeights: Record<string, number>,
  engineId: string | undefined,
  calibration: { steps: number; cfg: number; resolution: string }
): LocalJudgeResult {
  const notes: string[] = [];
  let promptAdherence = 70;
  let visualQuality = 65;
  let aestheticScore = 68;
  let safetyScore = 80;
  let wardrobeMatch = 60;

  // 1. Prompt analysis — longer, more specific prompts score higher
  const promptWords = prompt.split(/\s+/).filter(Boolean).length;
  if (promptWords < 10) {
    promptAdherence -= 15;
    notes.push("Short prompt (<10 words) — may lack specificity");
  } else if (promptWords > 200) {
    promptAdherence -= 10;
    notes.push("Very long prompt (>200 words) — model may struggle to follow all details");
  } else if (promptWords >= 30 && promptWords <= 150) {
    promptAdherence += 10;
    notes.push("Good prompt length (30-150 words) — optimal specificity");
  }

  // Check for structure (subject + setting + style keywords)
  const hasSubject = /\b(woman|man|girl|boy|person|figure|portrait|character)\b/i.test(prompt);
  const hasSetting = /\b(in|at|on|inside|outside|under|near|background|scene|setting)\b/i.test(prompt);
  const hasStyle = /\b(cinematic|photorealistic|studio|natural|dramatic|soft|hard)\b/i.test(prompt);
  if (hasSubject && hasSetting && hasStyle) {
    promptAdherence += 8;
    notes.push("Well-structured prompt (subject + setting + style)");
  }

  // 2. LoRA analysis
  const activeLoraCount = loraIds.length;
  if (activeLoraCount === 0) {
    visualQuality -= 5;
    notes.push("No LoRAs — base model only (lower detail potential)");
  } else if (activeLoraCount <= 3) {
    visualQuality += 10;
    notes.push(`Good LoRA count (${activeLoraCount}) — within recommended range`);
  } else {
    visualQuality -= 15;
    notes.push(`Too many LoRAs (${activeLoraCount}) — may cause artifacting (rule #5: max 3)`);
  }

  // Check LoRA weights
  const weights = Object.values(loraWeights);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (activeLoraCount > 1 && totalWeight > 1.2) {
    visualQuality -= 10;
    notes.push(`High total LoRA weight (${totalWeight.toFixed(2)}) — may cause oversaturation`);
  }

  // 3. Calibration analysis
  const { steps, cfg, resolution } = calibration;

  // Engine-specific scoring
  if (engineId === "flux2-klein-9b") {
    if (steps > 4) {
      visualQuality -= 10;
      notes.push(`FLUX.2 steps=${steps} exceeds optimal (4) — quality DEGRADES with more steps`);
    } else {
      visualQuality += 5;
      notes.push("FLUX.2 at optimal 4 steps");
    }
  } else if (engineId === "krea-2-turbo" || engineId === "krea-2-raw") {
    if (engineId === "krea-2-turbo" && steps === 8) {
      visualQuality += 8;
      notes.push("Krea 2 Turbo at optimal 8 steps (Stable Yogi guide)");
    } else if (engineId === "krea-2-raw" && steps === 28) {
      visualQuality += 12;
      aestheticScore += 10;
      notes.push("Krea 2 RAW at optimal 28 steps — maximum quality");
    }
  } else if (engineId === "sdxl-pony") {
    if (steps >= 25 && steps <= 35) {
      visualQuality += 8;
      notes.push(`SDXL Pony at good step count (${steps})`);
    }
    if (cfg >= 6 && cfg <= 8) {
      aestheticScore += 5;
      notes.push(`SDXL Pony CFG ${cfg} — within optimal range`);
    }
  }

  // Resolution check
  const [w, h] = resolution.split("x").map(Number);
  const totalPixels = (w || 1024) * (h || 1024);
  if (totalPixels < 500000) {
    visualQuality -= 10;
    notes.push(`Low resolution (${resolution}) — may lack detail`);
  } else if (totalPixels > 1500000) {
    visualQuality += 5;
    notes.push(`High resolution (${resolution}) — good detail potential`);
  }

  // 4. Safety heuristic (local — not a real safety scan)
  const lowerPrompt = prompt.toLowerCase();
  if (/\b(violence|blood|gore|weapon|gun|knife)\b/.test(lowerPrompt)) {
    safetyScore -= 15;
  }
  if (/\b(nude|explicit|nsfw)\b/.test(lowerPrompt)) {
    safetyScore -= 20;
  }

  // 5. Clamp scores
  promptAdherence = Math.max(20, Math.min(95, promptAdherence));
  visualQuality = Math.max(20, Math.min(95, visualQuality));
  aestheticScore = Math.max(20, Math.min(95, aestheticScore));
  safetyScore = Math.max(20, Math.min(95, safetyScore));
  wardrobeMatch = Math.max(20, Math.min(90, wardrobeMatch));

  const overallScore = Math.round(
    (promptAdherence * 0.25 + visualQuality * 0.25 + aestheticScore * 0.2 + safetyScore * 0.2 + wardrobeMatch * 0.1)
  );

  // 6. Determine verdict
  let verdict: JudgeResult["verdict"];
  if (overallScore >= 70 && safetyScore >= 80) {
    verdict = "approved";
  } else if (overallScore < 45 || safetyScore < 50) {
    verdict = "rejected";
  } else {
    verdict = "needs_review";
  }

  notes.push(`Overall: ${overallScore}/100 — ${verdict} (local heuristic, not vision-based)`);

  return {
    promptAdherence,
    visualQuality,
    aestheticScore,
    safetyScore,
    wardrobeMatch,
    overallScore,
    verdict,
    observations: notes,
    strengths: notes.filter((n) => n.includes("optimal") || n.includes("Good") || n.includes("good")),
    weaknesses: notes.filter((n) => n.includes("exceeds") || n.includes("lack") || n.includes("High") || n.includes("Too many") || n.includes("Short") || n.includes("Very long") || n.includes("Low")),
    stageMs: 0,
    source: "local",
    analysisNotes: notes,
  };
}
