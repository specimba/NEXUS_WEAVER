import ZAI from "z-ai-web-dev-sdk";

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null;

// Singleton ZAI client (created once, reused). Backend only.
export async function getZai() {
  if (!_zai) {
    _zai = await ZAI.create();
  }
  return _zai;
}

const SUPPORTED_SIZES = [
  "1024x1024",
  "768x1344",
  "864x1152",
  "1344x768",
  "1152x864",
  "1440x720",
  "720x1440",
] as const;

export function isSupportedSize(size: string): boolean {
  return (SUPPORTED_SIZES as readonly string[]).includes(size);
}

export { SUPPORTED_SIZES };
