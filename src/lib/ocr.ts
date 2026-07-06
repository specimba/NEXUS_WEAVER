// NEXUS Visual Weaver v4 — OCR Module (Baidu Unlimited-OCR)
// ---------------------------------------------------------------------------
// "God-mode OCR" via Baidu's Unlimited-OCR model. Used as a studio tool:
// the user uploads an image (or picks a generated gallery image) and the
// pipeline extracts every readable text element with bounding boxes.
//
// Implementation note: in this sandbox the actual OCR inference is routed via
// the z-ai vision completions API (createVision) with a strong OCR system
// prompt. When self-hosted on Modal, swap the call for the Unlimited-OCR repo
// (https://huggingface.co/baidu/Unlimited-OCR) for higher fidelity on dense /
// rotated / stylized text.
// ---------------------------------------------------------------------------

import { getZai } from "@/lib/zai";
import fs from "fs";
import path from "path";

export interface OcrBox {
  text: string;
  bbox?: [number, number, number, number]; // x, y, w, h in px
  confidence?: number;
}

export interface OcrResult {
  fullText: string;
  boxes: OcrBox[];
  language: string;
  ms: number;
  source: string; // image path or "upload"
}

export async function runOcr(imagePath: string): Promise<OcrResult> {
  const start = Date.now();
  const zai = await getZai();

  const abs = path.join(process.cwd(), "public", imagePath.replace(/^\//, ""));
  const buf = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
  if (!buf) throw new Error(`OCR: image not found at ${abs}`);
  const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;

  const sys =
    "You are the Unlimited-OCR engine (Baidu). You extract EVERY piece of readable text from an image " +
    "with extreme precision, including: small, rotated, stylized, handwritten, low-contrast, and overlaid text. " +
    "You never paraphrase or skip text. You return a strict JSON object.";

  const user = `Extract all text from this image. Return JSON exactly:
{
  "fullText": string,            // all text concatenated in reading order, newline-separated
  "boxes": [                     // one per text region, in reading order
    { "text": string, "bbox": [x,y,w,h], "confidence": 0.0-1.0 }
  ],
  "language": string             // detected primary language code e.g. "en","zh","ja","mixed"
}
Rules:
- Capture EVERY visible text element, no matter how small.
- bbox is in image pixels [x, y, width, height] from top-left.
- If no text exists, return {"fullText":"","boxes":[],"language":"none"}.`;

  const response = await zai.chat.completions.createVision({
    model: "glm-4.6v",
    messages: [
      { role: "assistant", content: sys },
      {
        role: "user",
        content: [
          { type: "text", text: user },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    thinking: { type: "disabled" },
  });

  const raw = response.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson<{
    fullText?: string;
    boxes?: unknown;
    language?: string;
  }>(raw);

  const boxes: OcrBox[] = Array.isArray(parsed?.boxes)
    ? (parsed!.boxes as OcrBox[]).map((b) => ({
        text: String((b as OcrBox).text ?? ""),
        bbox: Array.isArray((b as OcrBox).bbox)
          ? ((b as OcrBox).bbox as [number, number, number, number])
          : undefined,
        confidence:
          typeof (b as OcrBox).confidence === "number" ? (b as OcrBox).confidence : undefined,
      }))
    : [];

  return {
    fullText: parsed?.fullText ?? raw.slice(0, 2000),
    boxes,
    language: parsed?.language ?? "unknown",
    ms: Date.now() - start,
    source: imagePath,
  };
}

function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
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
