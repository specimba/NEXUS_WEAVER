// NEXUS Visual Weaver — Novita Sandbox Client
// ---------------------------------------------------------------------------
// Novita Agent Sandbox provides CPU/RAM cloud machines for agent code execution.
// $100 free credit. Used for:
//   - Offloading brain/reasoning tasks from Modal GPU (save credits)
//   - Running agent code (code interpreter)
//   - Browser automation via Browserless
//   - File processing, data analysis
//
// NOT for GPU inference — use Modal for that.
// ---------------------------------------------------------------------------

const NOVITA_API_KEY = process.env.NOVITA_API_KEY || "";
const NOVITA_BASE_URL = "https://api.novita.ai/v1/sandbox";

export interface NovitaSandbox {
  sandbox_id: string;
  status: string;
  template_id: string;
  cpu_count: number;
  memory_mib: number;
  created_at: string;
}

export interface NovitaCodeResult {
  logs: string[];
  error: string | null;
  exit_code: number;
  ms: number;
}

export function isNovitaConfigured(): boolean {
  return NOVITA_API_KEY.length > 0;
}

/**
 * Create a Novita sandbox for agent code execution.
 */
export async function createSandbox(params?: {
  templateId?: string;
  cpuCount?: number;
  memoryMib?: number;
}): Promise<NovitaSandbox | null> {
  if (!isNovitaConfigured()) return null;

  try {
    const res = await fetch(`${NOVITA_BASE_URL}/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NOVITA_API_KEY}`,
      },
      body: JSON.stringify({
        template_id: params?.templateId || "kk065fn4aju6x2v0ghgk", // base template
        cpu_count: params?.cpuCount || 2,
        memory_mib: params?.memoryMib || 1024,
      }),
    });

    if (!res.ok) {
      console.error("[novita] createSandbox failed:", res.status);
      return null;
    }

    return await res.json();
  } catch (err) {
    console.error("[novita] createSandbox error:", err);
    return null;
  }
}

/**
 * Run code in a Novita sandbox.
 */
export async function runCode(
  sandboxId: string,
  code: string
): Promise<NovitaCodeResult> {
  const t0 = Date.now();

  try {
    const res = await fetch(`${NOVITA_BASE_URL}/${sandboxId}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${NOVITA_API_KEY}`,
      },
      body: JSON.stringify({ code }),
    });

    if (!res.ok) {
      return { logs: [], error: `HTTP ${res.status}`, exit_code: 1, ms: Date.now() - t0 };
    }

    const data = await res.json();
    return {
      logs: data.logs || [],
      error: data.error || null,
      exit_code: data.exit_code || 0,
      ms: Date.now() - t0,
    };
  } catch (err) {
    return {
      logs: [],
      error: err instanceof Error ? err.message : String(err),
      exit_code: 1,
      ms: Date.now() - t0,
    };
  }
}

/**
 * Terminate a Novita sandbox.
 */
export async function terminateSandbox(sandboxId: string): Promise<boolean> {
  if (!isNovitaConfigured()) return false;

  try {
    const res = await fetch(`${NOVITA_BASE_URL}/${sandboxId}/terminate`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${NOVITA_API_KEY}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
