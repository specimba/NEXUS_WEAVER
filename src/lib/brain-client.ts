// NEXUS Visual Weaver — Modal Endpoint Brain Client
// ---------------------------------------------------------------------------
// Calls the Modal Endpoint (OpenAI-compatible API) for brain stages:
// ST3GG safety scan, visual judge, evidence parse.
//
// The Modal Endpoint serves at /v1/chat/completions with the Gemma 4 model.
// This replaces the z-ai chat completions API for brain tasks.
// ---------------------------------------------------------------------------

const MODAL_BRAIN_URL = process.env.MODAL_BRAIN_URL || "";
const MODAL_BRAIN_KEY = process.env.MODAL_BRAIN_KEY || "";
const MODAL_BRAIN_SECRET = process.env.MODAL_BRAIN_SECRET || "";

export interface BrainChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BrainChatResult {
  content: string;
  ms: number;
  model: string;
}

/**
 * Check if the Modal brain endpoint is configured and available.
 */
export function isBrainEndpointConfigured(): boolean {
  return MODAL_BRAIN_URL.length > 0;
}

/**
 * Call the Modal brain endpoint (OpenAI-compatible /v1/chat/completions).
 * Falls back to z-ai if the brain endpoint is not configured.
 */
export async function brainChat(
  messages: BrainChatMessage[],
  options?: { temperature?: number; maxTokens?: number }
): Promise<BrainChatResult> {
  const temperature = options?.temperature ?? 0.3;
  const maxTokens = options?.maxTokens ?? 2000;
  const t0 = Date.now();

  // If brain endpoint is configured, use it
  if (isBrainEndpointConfigured()) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      // Add auth headers if proxy token is set
      if (MODAL_BRAIN_KEY && MODAL_BRAIN_SECRET) {
        headers["Modal-Key"] = MODAL_BRAIN_KEY;
        headers["Modal-Secret"] = MODAL_BRAIN_SECRET;
      }

      const res = await fetch(`${MODAL_BRAIN_URL}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: "google/gemma-4-26B-A4B-it",
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        // 30s timeout: if the Modal brain container is cold-starting (vLLM
        // takes 60-120s to load Gemma 4 12B), we abort and fall through to
        // the z-ai fallback. Without this, ST3GG hangs forever and the entire
        // pipeline stalls at "ST3GG running".
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Brain endpoint HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      return {
        content,
        ms: Date.now() - t0,
        model: "gemma-4-26B-A4B-it (Modal Endpoint)",
      };
    } catch (err) {
      // Fall through to z-ai fallback
      console.log("[brain-client] Modal endpoint failed, using z-ai fallback:", err instanceof Error ? err.message : String(err));
    }
  }

  // Fallback: z-ai chat completions
  const { getZai } = await import("@/lib/zai");
  const zai = await getZai();
  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: "disabled" },
  });
  return {
    content: completion.choices?.[0]?.message?.content ?? "",
    ms: Date.now() - t0,
    model: "z-ai (fallback)",
  };
}

/**
 * Call the brain for vision (image analysis). Uses z-ai vision as fallback
 * since Modal Endpoints may not support vision yet.
 */
export async function brainVision(
  messages: Array<BrainChatMessage & { image?: string }>,
  options?: { temperature?: number; maxTokens?: number }
): Promise<BrainChatResult> {
  const temperature = options?.temperature ?? 0.3;
  const maxTokens = options?.maxTokens ?? 2000;
  const t0 = Date.now();

  // Vision always uses z-ai (Modal Endpoints don't support vision API yet)
  const { getZai } = await import("@/lib/zai");
  const zai = await getZai();

  // Convert messages to vision format
  const visionMessages = messages.map((m) => {
    if (m.image) {
      return {
        role: m.role,
        content: [
          { type: "text", text: m.content },
          { type: "image_url" as const, image_url: { url: m.image } },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const response = await zai.chat.completions.createVision({
    messages: visionMessages as never,
    thinking: { type: "disabled" },
  });

  return {
    content: response.choices?.[0]?.message?.content ?? "",
    ms: Date.now() - t0,
    model: "z-ai vision (fallback)",
  };
}
