/**
 * AEON Brain Client — calls the Qwen3.6-27B-AEON Modal endpoint.
 *
 * Tracks which backend actually answered (AEON vs z-ai fallback) so the UI
 * can be honest about what produced the results.
 *
 * Based on the user's architecture spec: AEON is an always-on reasoning layer
 * that does pre-generation advice, post-generation judging, and workflow analysis.
 */

import { callModalBrain, isBrainEndpointConfigured, type BrainChatMessage } from "@/lib/modal-client";
import { getZai } from "@/lib/zai";
import type {
  AEONGenerationAdvice,
  AEONSafetyVerdict,
  AEONWorkflowAdvice,
  AEONCallMeta,
  AEONGenerationAdvisedResult,
  AEONJudgedResult,
} from "@/types/aeon";
import {
  AEON_SYSTEM_PROMPT_LORA_ADVISOR,
  AEON_SYSTEM_PROMPT_VISUAL_JUDGE,
  AEON_SYSTEM_PROMPT_WORKFLOW_ADVISOR,
} from "@/lib/aeon/prompts";

/**
 * Call AEON for pre-generation advice.
 * Falls through to z-ai if AEON is cold (503).
 */
export async function aeonGenerationAdvice(
  userContext: string
): Promise<AEONGenerationAdvisedResult> {
  const messages: BrainChatMessage[] = [
    { role: "system", content: AEON_SYSTEM_PROMPT_LORA_ADVISOR },
    { role: "user", content: userContext },
  ];

  // Try AEON first
  if (isBrainEndpointConfigured()) {
    const result = await callModalBrain(messages, { temperature: 0.3, maxTokens: 2000 });
    if (result) {
      const parsed = extractJson<AEONGenerationAdvice>(result.content);
      if (parsed) {
        return {
          advice: parsed,
          meta: {
            backend: "aeon_modal",
            modelName: "Qwen3.6-27B-AEON-Ultimate-Uncensored-BF16",
            latencyMs: result.ms,
            success: true,
          },
        };
      }
    }
  }

  // Fallback: z-ai
  try {
    const zai = await getZai();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: AEON_SYSTEM_PROMPT_LORA_ADVISOR },
        { role: "user", content: userContext },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson<AEONGenerationAdvice>(raw);
    return {
      advice: parsed,
      meta: {
        backend: "z_ai_fallback",
        modelName: "z-ai (fallback)",
        success: !!parsed,
        errorMessage: parsed ? undefined : "Failed to parse z-ai response as AEONGenerationAdvice JSON",
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      advice: null,
      meta: { backend: "z_ai_fallback", modelName: "z-ai (fallback)", success: false, errorMessage: msg },
    };
  }
}

/**
 * Call AEON for post-generation visual judging.
 * Falls through to z-ai vision if AEON is cold.
 */
export async function aeonVisualJudge(
  imageDataUrl: string,
  prompt: string,
  loraContext: string
): Promise<AEONJudgedResult> {
  // AEON brain endpoint doesn't support vision yet — always use z-ai vision
  // for the judge stage. Track this honestly.
  try {
    const zai = await getZai();
    const response = await zai.chat.completions.createVision({
      messages: [
        { role: "system", content: AEON_SYSTEM_PROMPT_VISUAL_JUDGE },
        {
          role: "user",
          content: [
            { type: "text", text: `Prompt: ${prompt}\n\nLoRA context: ${loraContext}\n\nJudge this image:` },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    } as never);

    const raw = response.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson<AEONSafetyVerdict>(raw);
    return {
      verdict: parsed,
      meta: {
        backend: "z_ai_fallback",
        modelName: "z-ai vision (AEON has no vision yet)",
        success: !!parsed,
        errorMessage: parsed ? undefined : "Failed to parse z-ai vision response as AEONSafetyVerdict JSON",
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      verdict: null,
      meta: { backend: "z_ai_fallback", modelName: "z-ai vision", success: false, errorMessage: msg },
    };
  }
}

/**
 * Call AEON for gallery-level workflow advice.
 * Falls through to z-ai if AEON is cold.
 */
export async function aeonWorkflowAdvice(
  gallerySummary: string
): Promise<{ advice: AEONWorkflowAdvice | null; meta: AEONCallMeta }> {
  const messages: BrainChatMessage[] = [
    { role: "system", content: AEON_SYSTEM_PROMPT_WORKFLOW_ADVISOR },
    { role: "user", content: gallerySummary },
  ];

  // Try AEON first
  if (isBrainEndpointConfigured()) {
    const result = await callModalBrain(messages, { temperature: 0.3, maxTokens: 3000 });
    if (result) {
      const parsed = extractJson<AEONWorkflowAdvice>(result.content);
      if (parsed) {
        return {
          advice: parsed,
          meta: {
            backend: "aeon_modal",
            modelName: "Qwen3.6-27B-AEON-Ultimate-Uncensored-BF16",
            latencyMs: result.ms,
            success: true,
          },
        };
      }
    }
  }

  // Fallback: z-ai
  try {
    const zai = await getZai();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "system", content: AEON_SYSTEM_PROMPT_WORKFLOW_ADVISOR },
        { role: "user", content: gallerySummary },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = extractJson<AEONWorkflowAdvice>(raw);
    return {
      advice: parsed,
      meta: {
        backend: "z_ai_fallback",
        modelName: "z-ai (fallback)",
        success: !!parsed,
        errorMessage: parsed ? undefined : "Failed to parse z-ai response as AEONWorkflowAdvice JSON",
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      advice: null,
      meta: { backend: "z_ai_fallback", modelName: "z-ai (fallback)", success: false, errorMessage: msg },
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  let s = raw.trim();
  // Strip code fences
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // Find first { ... last }
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
