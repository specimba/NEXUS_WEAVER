import { NextRequest, NextResponse } from "next/server";
import { callModalBrain } from "@/lib/modal-client";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Local prompt enhancer — used as fallback when the brain is cold.
 * Adds structure (subject → action → setting → style) without an LLM.
 */
function enhancePromptLocally(idea: string, extraRules?: string): string {
  const parts: string[] = [idea.trim()];

  // Add style keywords based on the idea content
  const lower = idea.toLowerCase();
  if (lower.match(/\b(portrait|person|woman|man|girl|boy|face)\b/)) {
    parts.push("natural skin texture, visible pores, subsurface scattering");
  }
  if (lower.match(/\b(fashion|editorial|magazine|runway)\b/)) {
    parts.push("high-fashion editorial photography, professional studio lighting, sharp focus");
  }
  if (lower.match(/\b(cyberpunk|neon|futuristic|sci-fi)\b/)) {
    parts.push("dramatic neon lighting, high contrast, cinematic atmosphere");
  }
  if (lower.match(/\b(landscape|nature|outdoor|scene)\b/)) {
    parts.push("golden hour lighting, atmospheric depth, wide-angle composition");
  }

  // Add quality tokens
  parts.push("ultra detailed, professional composition, high dynamic range");

  // Add extra rules if provided
  if (extraRules) {
    parts.push(extraRules.trim());
  }

  return parts.join(". ");
}

/**
 * POST /api/prompt/enhance
 *
 * NO8D Prompt+ "Expand" mode — uses the Creative brain (Brisk Evolution 4B,
 * fastest of the 3 managed endpoints) to expand a rough idea into a rich,
 * FLUX.2-optimized generation prompt.
 *
 * Body:  { prompt: string, extraRules?: string }
 * Returns: { enhanced: string, ms: number, model: string } | { error: string }
 *
 * The result is shown in an EDITABLE textarea (NO8D "auto off" pattern) before
 * the user sends it to the Studio — the AI never writes directly to the prompt.
 */
export async function POST(req: NextRequest) {
  let body: { prompt?: string; extraRules?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const idea = (body.prompt || "").trim();
  if (!idea) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  const extraRules = (body.extraRules || "").trim();

  const system = `You are a master prompt engineer for FLUX.2 Klein 9B, a distilled flow-matching image model that works best with concise, vivid, structured prompts (200-400 characters).

Expand the user's rough idea into a polished image-generation prompt.

Structure (in this order):
1. SUBJECT — who/what, with concrete physical detail (attire, expression, pose)
2. ACTION/POSE — what they are doing, motion, gesture
3. SETTING/CONTEXT — where, time of day, atmosphere, background elements
4. STYLE/LIGHTING/CAMERA — art direction, light source + quality, color palette, lens/focal-length, film stock or render look

Rules:
- Use concrete sensory language (materials, light direction, color temperature, texture).
- NO negative prompts (FLUX.2 does not use them).
- NO step/cfg/sampler guidance (handled by the calibration system).
- Plain prose only. No bullet points, no preamble, no "here is your prompt".
- Keep it under 400 characters.
${extraRules ? `- Extra user rules (honor them): ${extraRules}` : ""}

Return ONLY the enhanced prompt text, nothing else.`;

  const result = await callModalBrain(
    [
      { role: "system", content: system },
      { role: "user", content: idea },
    ],
    { temperature: 0.7, maxTokens: 2500, role: "creative" }
  );

  if (!result) {
    // v5.51: Fall back to LOCAL prompt enhancement when the brain is cold.
    // Don't return a 503 error — the user clicked "Enhance" and expects a result.
    // Use a template-based enhancer that adds structure to the prompt.
    const enhanced = enhancePromptLocally(idea, extraRules);
    return NextResponse.json({
      enhanced,
      ms: 0,
      model: "local-template (brain cold)",
    });
  }

  const enhanced = result.content.trim();
  if (!enhanced) {
    return NextResponse.json({ error: "Brain returned an empty response." }, { status: 502 });
  }

  return NextResponse.json({
    enhanced,
    ms: result.ms,
    model: result.model,
  });
}
