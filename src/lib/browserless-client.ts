// NEXUS Visual Weaver — Browserless Client
// ---------------------------------------------------------------------------
// Browserless provides managed headless browsers for automation.
// Used for: scraping model docs, testing workflows, screenshots, content extraction.
// Can be called from the Next.js server or from Novita sandboxes.
// ---------------------------------------------------------------------------

const BROWSERLESS_TOKEN = process.env.BROWSERLESS_TOKEN || "";
const BROWSERLESS_BASE = "https://production-sfo.browserless.io";

export function isBrowserlessConfigured(): boolean {
  return BROWSERLESS_TOKEN.length > 0;
}

/**
 * Scrape a webpage — extract structured data with CSS selectors.
 */
export async function scrapePage(url: string, selectors: Array<{ selector: string }>): Promise<unknown> {
  const res = await fetch(`${BROWSERLESS_BASE}/scrape?token=${BROWSERLESS_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, elements: selectors }),
  });

  if (!res.ok) {
    throw new Error(`Browserless scrape HTTP ${res.status}`);
  }

  return await res.json();
}

/**
 * Take a screenshot of a webpage.
 */
export async function screenshotPage(url: string, options?: { fullPage?: boolean; format?: "png" | "jpeg" | "webp" }): Promise<Buffer> {
  const res = await fetch(`${BROWSERLESS_BASE}/screenshot?token=${BROWSERLESS_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      options: {
        fullPage: options?.fullPage ?? true,
        type: options?.format ?? "png",
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Browserless screenshot HTTP ${res.status}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

/**
 * Get rendered HTML content of a webpage (including JS-rendered content).
 */
export async function getContent(url: string): Promise<string> {
  const res = await fetch(`${BROWSERLESS_BASE}/content?token=${BROWSERLESS_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });

  if (!res.ok) {
    throw new Error(`Browserless content HTTP ${res.status}`);
  }

  return await res.text();
}
