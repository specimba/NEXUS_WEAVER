/**
 * NEXUS Visual Weaver — Engine Manager
 *
 * Smart auto-rotator for image/video model backends. Each engine maps to a
 * Modal app. FLUX.2 (L40S) is always-on (cheap). H100 engines are deployed
 * on-demand when the user selects them, and auto-stopped after idle.
 *
 * This module calls the Modal CLI via child_process. The CLI is at
 * /home/z/.venv/bin/modal with auth in ~/.modal.toml.
 *
 * Backend only — never import from a client component.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { MODAL_TOKEN_ID, MODAL_TOKEN_SECRET } from "@/lib/secrets";

const execFileAsync = promisify(execFile);

const MODAL_BIN = process.env.MODAL_BIN || "/home/z/.venv/bin/modal";
const PROJECT_ROOT = process.cwd();

// Modal CLI requires auth. The ~/.modal.toml file can get wiped by sandbox
// resets, so we pass tokens via environment variables as a fallback.
function getModalEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    MODAL_TOKEN_ID: MODAL_TOKEN_ID || process.env.MODAL_TOKEN_ID || "",
    MODAL_TOKEN_SECRET: MODAL_TOKEN_SECRET || process.env.MODAL_TOKEN_SECRET || "",
  } as NodeJS.ProcessEnv;
}

// ── Engine → Modal App mapping ───────────────────────────────────────────────

export interface EngineApp {
  /** Engine ID (matches src/lib/engines.ts) */
  engineId: string;
  /** Modal app name (what `modal app list` shows) */
  appName: string;
  /** Path to the Modal app Python file, relative to project root */
  appFile: string;
  /** GPU type for cost awareness */
  gpu: "L40S" | "H100";
  /** Whether this engine should always stay deployed (cheap GPUs only) */
  alwaysOn: boolean;
  /** Engine family for display */
  family: string;
}

export const ENGINE_APPS: EngineApp[] = [
  {
    engineId: "flux2-klein-9b",
    appName: "nexus-flux2-klein9b",
    appFile: "modal-apps/nexus_flux2_klein9b.py",
    gpu: "L40S",
    alwaysOn: true,
    family: "FLUX.2",
  },
  {
    engineId: "z-image-turbo",
    appName: "nexus-zimage-turbo",
    appFile: "modal-apps/nexus_zimage_turbo.py",
    gpu: "H100",
    alwaysOn: false,
    family: "Z-Image",
  },
  {
    engineId: "krea-2-turbo",
    appName: "nexus-krea2-turbo",
    appFile: "modal-apps/nexus_krea2_turbo.py",
    gpu: "H100",
    alwaysOn: false,
    family: "Krea 2",
  },
  {
    engineId: "wan-2.2",
    appName: "nexus-wan22-i2v",
    appFile: "modal-apps/nexus_wan22_i2v.py",
    gpu: "H100",
    alwaysOn: false,
    family: "Wan",
  },
  {
    engineId: "ltx-2.3",
    appName: "nexus-ltx23-i2v",
    appFile: "modal-apps/nexus_ltx23_i2v.py",
    gpu: "H100",
    alwaysOn: false,
    family: "LTX",
  },
];

export function getEngineApp(engineId: string): EngineApp | undefined {
  return ENGINE_APPS.find((e) => e.engineId === engineId);
}

// ── In-memory status cache (5s TTL — avoids hammering `modal app list`) ──────

interface CachedStatus {
  timestamp: number;
  apps: Record<string, "deployed" | "stopped" | "unknown">;
}

let statusCache: CachedStatus | null = null;
const STATUS_CACHE_TTL_MS = 5000;

// ── Modal CLI wrapper ────────────────────────────────────────────────────────

/**
 * Get the deploy status of all NEXUS Modal apps.
 * Calls `modal app list` and parses the output.
 */
export async function getEngineStatuses(): Promise<
  Record<string, { status: "deployed" | "stopped" | "unknown"; gpu: string; alwaysOn: boolean }>
> {
  // Check cache
  if (statusCache && Date.now() - statusCache.timestamp < STATUS_CACHE_TTL_MS) {
    const result: Record<string, { status: "deployed" | "stopped" | "unknown"; gpu: string; alwaysOn: boolean }> = {};
    for (const app of ENGINE_APPS) {
      const raw = statusCache.apps[app.appName] ?? "unknown";
      result[app.engineId] = { status: raw, gpu: app.gpu, alwaysOn: app.alwaysOn };
    }
    return result;
  }

  try {
    const { stdout } = await execFileAsync(MODAL_BIN, ["app", "list", "--json"], {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      env: getModalEnv(),
    });

    // Parse JSON output — modal app list --json returns an array of app objects.
    // Only DEPLOYED apps appear in this list. Stopped apps are absent.
    // The app name is in the "description" field (not "name").
    const apps = JSON.parse(stdout) as Array<{
      app_id?: string;
      description?: string;
      state?: string;
    }>;

    const appStates: Record<string, "deployed" | "stopped"> = {};
    for (const app of apps) {
      const name = app.description || "";
      for (const engineApp of ENGINE_APPS) {
        if (name.includes(engineApp.appName)) {
          appStates[engineApp.appName] = "deployed";
        }
      }
    }

    statusCache = { timestamp: Date.now(), apps: appStates };

    const result: Record<string, { status: "deployed" | "stopped" | "unknown"; gpu: string; alwaysOn: boolean }> = {};
    for (const app of ENGINE_APPS) {
      // If the app appears in modal app list → deployed.
      // If it doesn't appear → stopped (needs deploy before use).
      const raw = appStates[app.appName] ?? "stopped";
      result[app.engineId] = { status: raw, gpu: app.gpu, alwaysOn: app.alwaysOn };
    }
    return result;
  } catch (err) {
    // If the --json flag isn't supported or CLI fails, return unknown for all
    console.error("[engine-manager] getEngineStatuses failed:", err instanceof Error ? err.message : String(err));
    const result: Record<string, { status: "deployed" | "stopped" | "unknown"; gpu: string; alwaysOn: boolean }> = {};
    for (const app of ENGINE_APPS) {
      result[app.engineId] = { status: "unknown", gpu: app.gpu, alwaysOn: app.alwaysOn };
    }
    return result;
  }
}

/**
 * Deploy a Modal app. Blocks until deployment completes (~3-5s for a cached
 * image, longer if the image needs rebuilding).
 */
export async function deployEngine(engineId: string): Promise<{ success: boolean; message: string }> {
  const app = getEngineApp(engineId);
  if (!app) {
    return { success: false, message: `Unknown engine: ${engineId}` };
  }
  if (app.alwaysOn) {
    return { success: true, message: `${app.appName} is always-on (no deploy needed)` };
  }

  // Invalidate cache
  statusCache = null;

  try {
    const appPath = path.join(PROJECT_ROOT, app.appFile);
    const { stdout, stderr } = await execFileAsync(
      MODAL_BIN,
      ["deploy", appPath],
      { timeout: 120000, maxBuffer: 1024 * 1024, env: getModalEnv() }
    );

    const output = (stdout + stderr).trim();
    const success = output.includes("App deployed") || output.includes("Created objects");

    return {
      success,
      message: success
        ? `${app.appName} deployed successfully`
        : `Deploy output: ${output.slice(0, 300)}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Deploy failed: ${msg.slice(0, 300)}` };
  }
}

/**
 * Stop a Modal app. This prevents any new containers from starting.
 * Always-on engines (FLUX.2) cannot be stopped.
 */
export async function stopEngine(engineId: string): Promise<{ success: boolean; message: string }> {
  const app = getEngineApp(engineId);
  if (!app) {
    return { success: false, message: `Unknown engine: ${engineId}` };
  }
  if (app.alwaysOn) {
    return { success: false, message: `${app.appName} is always-on and cannot be stopped` };
  }

  // Invalidate cache
  statusCache = null;

  try {
    const { stdout, stderr } = await execFileAsync(
      MODAL_BIN,
      ["app", "stop", app.appName, "-y"],
      { timeout: 30000, maxBuffer: 1024 * 1024, env: getModalEnv() }
    );

    return {
      success: true,
      message: `${app.appName} stopped`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If the app is already stopped, modal CLI returns an error — treat as success
    if (msg.includes("not currently running") || msg.includes("already stopped")) {
      return { success: true, message: `${app.appName} was already stopped` };
    }
    return { success: false, message: `Stop failed: ${msg.slice(0, 300)}` };
  }
}

/**
 * Ensure an engine is deployed before generation. If it's stopped, deploy it.
 * If it's already deployed, return immediately. This is the "auto-deploy on
 * select" mechanism — called by the pipeline before calling /generate.
 *
 * Returns true if the engine is ready (or is FLUX.2 which is always ready).
 */
export async function ensureEngineDeployed(engineId: string): Promise<{ ready: boolean; message: string }> {
  const app = getEngineApp(engineId);
  if (!app) {
    // Unknown engine — fall through to FLUX.2 (the pipeline's default)
    return { ready: true, message: "Unknown engine — using FLUX.2 default" };
  }
  if (app.alwaysOn) {
    return { ready: true, message: `${app.appName} is always-on` };
  }

  // Check current status
  const statuses = await getEngineStatuses();
  const current = statuses[engineId];

  if (current?.status === "deployed") {
    return { ready: true, message: `${app.appName} already deployed` };
  }

  // Deploy it
  console.log(`[engine-manager] Auto-deploying ${app.appName} for engine ${engineId}...`);
  const result = await deployEngine(engineId);
  if (result.success) {
    return {
      ready: true,
      message: result.message,
    };
  }

  // Deploy failed — DON'T proceed to a 404. Fall back to FLUX.2 with a warning.
  // This prevents the "invalid function call" 404 that burns credits on
  // repeated failed attempts to a stopped app.
  console.warn(`[engine-manager] Auto-deploy failed for ${app.appName}, falling back to FLUX.2: ${result.message}`);
  return {
    ready: true, // ready=true so the pipeline proceeds, but with FLUX.2
    message: `FALLBACK_TO_FLUX2: ${app.appName} deploy failed (${result.message.slice(0, 100)}). Using FLUX.2 instead.`,
  };
}
