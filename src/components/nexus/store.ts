"use client";

import { create } from "zustand";
import { toast } from "sonner";
import type {
  ViewId,
  StageId,
  StageStatus,
  SafetyResult,
  JudgeResult,
  ResolvedCalibration,
} from "@/lib/nexus-types";
import type { ActivePolicy, MaturityTier } from "@/lib/policy";
import { DEFAULT_CALIBRATION_ID, getPreset } from "@/lib/calibration";
import { DEFAULT_IMAGE_ENGINE_ID } from "@/lib/engines";
import { DEFAULT_BRAIN_ID } from "@/lib/brain";
import { getLora } from "@/lib/lora-library";
import type { LoraEntry } from "@/lib/lora-library";
import { LORA_PACKS } from "@/lib/lora-packs";

// Rule #5 (AGENTS.md): LoRA weights ≤ 0.5 when stacking, max 3 LoRAs
// recommended. This module-level flag ensures the stacking-cap toast fires
// ONCE per page-load (not on every slider drag).
let _weightCapToastShown = false;

// M5: per-LoRA active config used by the NO8D-style LoRA stack.
export interface ActiveLoraConfig {
  lora: LoraEntry;
  weight: number;
  enabled: boolean;
}

export interface RunStageState {
  id: StageId;
  status: StageStatus;
  ms?: number;
  message?: string;
}

export interface RunResult {
  id: string;
  status: "completed" | "failed" | "blocked";
  imagePath: string | null;
  verdict: string | null;
  overallScore: number | null;
  safety: SafetyResult | null;
  judge: JudgeResult | null;
  evidence: Record<string, unknown> | null;
  timings: Partial<Record<StageId, number>> | null;
  errorMessage: string | null;
  // v3
  calibration: ResolvedCalibration | null;
  loraIds: string[];
  maturityTier: MaturityTier | null;
  blockReason: string | null;
  prompt: string;
  style: string;
  aspect: string;
  wardrobe: string | null;
  // v4: engine + backend provenance
  engineId?: string | null;
  backend?: "modal" | "zai" | null;
  backendMismatch?: boolean;
  // The random seed used for this generation — shown in Provenance so the user
  // can confirm seeds vary per run (creative variation is active).
  seed?: number | null;
}

// Anonymous device fingerprint (no PII). Generated once, stored in localStorage.
function loadFingerprint(): string {
  if (typeof window === "undefined") return "";
  const KEY = "nexus-consent-fp";
  let fp = localStorage.getItem(KEY);
  if (!fp) {
    // Simple fingerprint: timestamp + random. Not a robust device id, but
    // sufficient for consent record deduplication without collecting PII.
    fp = `fp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(KEY, fp);
  }
  return fp;
}

interface NexusState {
  view: ViewId;
  setView: (v: ViewId) => void;

  prompt: string;
  style: string;
  aspect: string;
  wardrobe: string;
  setPrompt: (v: string) => void;
  setStyle: (v: string) => void;
  setAspect: (v: string) => void;
  setWardrobe: (v: string) => void;
  resetForm: () => void;
  loadSettings: (s: { prompt?: string; style?: string; aspect?: string; wardrobe?: string }) => void;

  // v3: calibration
  calibrationId: string;
  calibrationOverrides: Record<string, unknown>;
  setCalibration: (id: string) => void;
  setCalibrationOverride: (key: string, value: unknown) => void;
  clearCalibrationOverrides: () => void;

  // v4: engine + brain selection
  engineId: string;
  setEngine: (id: string) => void;
  // when an engine is picked, the calibration auto-selects a matching preset
  syncCalibrationToEngine: () => void;
  brainId: string;
  setBrain: (id: string) => void;
  // optional video stage toggle (I2V after image gen)
  videoEnabled: boolean;
  setVideoEnabled: (v: boolean) => void;

  // v3: applied LoRAs
  loraIds: string[];
  toggleLora: (id: string) => void;
  clearLoras: () => void;
  // M5 (NO8D-LoRA stack): per-LoRA weight + enable/disable maps. When a LoRA
  // is applied, its weight is initialized to its `recommendedWeight` (falling
  // back to the active calibration preset's `loraWeight`) and enabled=true.
  // When a LoRA is removed, its weight + enabled entries are deleted.
  loraWeights: Record<string, number>;
  loraEnabled: Record<string, boolean>;
  setLoraWeight: (id: string, weight: number) => void;
  toggleLoraEnabled: (id: string) => void;
  resetLoraWeight: (id: string) => void;
  // Selector — returns the active (applied + enabled) LoRA configs in the
  // order they were added. Disabled LoRAs are excluded. Used by the pipeline
  // run + the LoraStack UI.
  activeLoraConfigs: () => ActiveLoraConfig[];

  // Rule #5 (AGENTS.md): power mode is the soft-override for the 3-LoRA
  // stacking warning. When true, the toggleLora warning toast is silenced
  // (the LoRA is still added — soft enforcement). Defaults to false.
  powerMode: boolean;
  togglePowerMode: () => void;

  // ComfyUI-style workflow packs — batch-applies engine + calibration + LoRA
  // stack + prompt template in one click. Packs are pre-validated for rule #5
  // (every weight ≤ 0.5; most use ≤ 3 LoRAs), so applyPack bypasses the
  // toggleLora warning toast for pack LoRAs.
  applyPack: (packId: string) => void;

  // v3: consent + policy
  fingerprint: string;
  consentStatus: "pending" | "accepted" | "rejected" | "revoked" | null;
  consentTier: MaturityTier;
  setConsent: (s: NexusState["consentStatus"], t: MaturityTier) => void;
  policy: ActivePolicy | null;
  setPolicy: (p: ActivePolicy) => void;
  // convenience: is mature content currently unlocked?
  matureUnlocked: () => boolean;

  running: boolean;
  stages: RunStageState[];
  result: RunResult | null;
  error: string | null;

  startRun: () => void;
  setStage: (id: StageId, patch: Partial<RunStageState>) => void;
  setAllStagesIdle: () => void;
  finishRun: (r: RunResult) => void;
  failRun: (err: string) => void;
  clearResult: () => void;

  // prompt history
  history: string[];
  pushHistory: (p: string) => void;

  accent: "emerald" | "amber" | "rose";
  setAccent: (a: NexusState["accent"]) => void;
}

const initialStages = (): RunStageState[] => [
  { id: "prompt", status: "idle" },
  { id: "st3gg", status: "idle" },
  { id: "flux", status: "idle" },
  { id: "judge", status: "idle" },
  { id: "evidence", status: "idle" },
  { id: "output", status: "idle" },
];

export const useNexus = create<NexusState>((set, get) => ({
  view: "studio",
  setView: (v) => set({ view: v }),

  prompt: "",
  style: "cinematic",
  aspect: "1:1",
  wardrobe: "",
  setPrompt: (v) => set({ prompt: v }),
  setStyle: (v) => set({ style: v }),
  setAspect: (v) => set({ aspect: v }),
  setWardrobe: (v) => set({ wardrobe: v }),
  resetForm: () => set({ prompt: "", wardrobe: "" }),
  loadSettings: (s) =>
    set((state) => ({
      prompt: s.prompt ?? state.prompt,
      style: s.style ?? state.style,
      aspect: s.aspect ?? state.aspect,
      wardrobe: s.wardrobe !== undefined ? s.wardrobe : state.wardrobe,
    })),

  // v3 calibration
  calibrationId: DEFAULT_CALIBRATION_ID,
  calibrationOverrides: {},
  setCalibration: (id) => set({ calibrationId: id, calibrationOverrides: {} }),
  setCalibrationOverride: (key, value) =>
    set((s) => ({ calibrationOverrides: { ...s.calibrationOverrides, [key]: value } })),
  clearCalibrationOverrides: () => set({ calibrationOverrides: {} }),

  // v4 engine + brain
  engineId: DEFAULT_IMAGE_ENGINE_ID,
  setEngine: (id) => set({ engineId: id }),
  syncCalibrationToEngine: () => {
    // when the engine changes, auto-pick the first preset matching it
    const { engineId, calibrationId } = get();
    import("@/lib/calibration").then(({ CALIBRATION_PRESETS, getPreset }) => {
      const current = getPreset(calibrationId);
      if (current.engineId === engineId) return; // already synced
      const match = CALIBRATION_PRESETS.find((p) => p.engineId === engineId);
      if (match) set({ calibrationId: match.id, calibrationOverrides: {} });
    });
  },
  brainId: DEFAULT_BRAIN_ID,
  setBrain: (id) => set({ brainId: id }),
  videoEnabled: false,
  setVideoEnabled: (v) => set({ videoEnabled: v }),

  // v3 loras + M5 per-LoRA weights
  loraIds: [],
  // M5: when applying a LoRA, init weight to its `recommendedWeight` (fallback
  // to the active calibration preset's `loraWeight`) + enabled=true. When
  // removing, delete its weight + enabled entries.
  loraWeights: {},
  loraEnabled: {},
  powerMode: false,
  togglePowerMode: () => set((s) => ({ powerMode: !s.powerMode })),
  toggleLora: (id) => {
    const s = get();
    if (s.loraIds.includes(id)) {
      // Remove: drop id + delete weight + enabled entries.
      const nextWeights = { ...s.loraWeights };
      const nextEnabled = { ...s.loraEnabled };
      delete nextWeights[id];
      delete nextEnabled[id];
      set({
        loraIds: s.loraIds.filter((x) => x !== id),
        loraWeights: nextWeights,
        loraEnabled: nextEnabled,
      });
      return;
    }
    // Rule #5 (AGENTS.md): max 3 LoRAs recommended. Soft enforcement — still
    // add the LoRA, but warn (unless power mode is on). The warning fires
    // when adding would make loraIds.length > 3 (i.e. 4th, 5th, ...).
    const willExceedStack = s.loraIds.length >= 3 && !s.powerMode;
    // Apply: init weight + enabled. Prefer recommendedWeight; fall back to
    // the active preset's loraWeight (the "global default" semantics from
    // the M5 spec). Rule #5: default fallback is 0.5, never 0.8.
    const lora = getLora(id);
    let weight = 0.5;
    if (lora && typeof lora.recommendedWeight === "number") {
      weight = lora.recommendedWeight;
    } else {
      try {
        weight = getPreset(s.calibrationId).loraWeight;
      } catch {
        weight = 0.5;
      }
    }
    set({
      loraIds: [...s.loraIds, id],
      loraWeights: { ...s.loraWeights, [id]: weight },
      loraEnabled: { ...s.loraEnabled, [id]: true },
    });
    if (willExceedStack) {
      toast.warning("Max 3 LoRAs recommended (AGENTS rule #5).", {
        description: "Disable one first, or enable Power Mode to silence this warning.",
      });
    }
  },
  clearLoras: () =>
    set({ loraIds: [], loraWeights: {}, loraEnabled: {} }),
  setLoraWeight: (id, weight) => {
    const s = get();
    // Rule #5 (AGENTS.md): when stacking (loraIds.length > 1), clamp to
    // [0, 0.5]. Single-LoRA mode allows [0, 1]. The cap toast fires once.
    const stacking = s.loraIds.length > 1;
    const cap = stacking ? 0.5 : 1;
    const clamped = Math.max(0, Math.min(cap, weight));
    const wasCapped = stacking && weight > 0.5;
    set({
      loraWeights: {
        ...s.loraWeights,
        [id]: clamped,
      },
    });
    if (wasCapped && !_weightCapToastShown) {
      _weightCapToastShown = true;
      toast.info("Weight capped at 0.5 when stacking (rule #5).", {
        description: "Single-LoRA mode allows up to 1.0.",
      });
    }
  },
  toggleLoraEnabled: (id) =>
    set((s) => {
      const cur = s.loraEnabled[id];
      // Default to true if missing — same default as a freshly-applied LoRA.
      const next = cur === false ? true : false;
      return { loraEnabled: { ...s.loraEnabled, [id]: next } };
    }),
  resetLoraWeight: (id) =>
    set((s) => {
      const lora = getLora(id);
      if (!lora) return {};
      return {
        loraWeights: {
          ...s.loraWeights,
          [id]: lora.recommendedWeight,
        },
      };
    }),
  activeLoraConfigs: () => {
    const st = get();
    const out: ActiveLoraConfig[] = [];
    for (const id of st.loraIds) {
      const lora = getLora(id);
      if (!lora) continue;
      const enabled = st.loraEnabled[id] !== false; // default true
      if (!enabled) continue;
      const weight =
        typeof st.loraWeights[id] === "number"
          ? st.loraWeights[id]
          : lora.recommendedWeight;
      out.push({ lora, weight, enabled });
    }
    return out;
  },
  applyPack: (packId) => {
    const pack = LORA_PACKS.find((p) => p.id === packId);
    if (!pack) {
      toast.error("Pack not found", { description: packId });
      return;
    }
    const s = get();
    // Batch: set engine + calibration, clear the existing LoRA stack, then
    // set the prompt template (if the pack carries one). Done in one `set`
    // call so React sees a single re-render.
    set({
      engineId: pack.engineId,
      calibrationId: pack.calibrationId ?? s.calibrationId,
      loraIds: [],
      loraWeights: {},
      loraEnabled: {},
      prompt: pack.promptTemplate ?? s.prompt,
    });
    // Apply each LoRA in pack order. We bypass toggleLora's warning toast
    // (packs are pre-validated for rule #5 — weights ≤0.5; most use ≤ 3
    // LoRAs). Calling toggleLora directly would also work, but inline
    // application avoids the toast noise on packs that legitimately use 3
    // LoRAs at the recommended ceiling.
    for (const entry of pack.loras) {
      const lora = getLora(entry.loraId);
      if (!lora) continue;
      const cur = get();
      set({
        loraIds: [...cur.loraIds, entry.loraId],
        loraWeights: { ...cur.loraWeights, [entry.loraId]: entry.weight },
        loraEnabled: { ...cur.loraEnabled, [entry.loraId]: true },
      });
    }
    toast.success(`Pack applied: ${pack.name}`, {
      description: `${pack.loras.length} LoRA${pack.loras.length === 1 ? "" : "s"} · ${pack.engineId}`,
    });
  },

  // v3 consent + policy
  fingerprint: typeof window !== "undefined" ? loadFingerprint() : "",
  consentStatus: null,
  consentTier: "safe" as MaturityTier,
  setConsent: (s, t) => set({ consentStatus: s, consentTier: t }),
  policy: null,
  setPolicy: (p) => set({ policy: p }),
  matureUnlocked: () => {
    const st = get();
    return st.consentStatus === "accepted" && !!st.policy?.matureEnabled;
  },

  running: false,
  stages: initialStages(),
  result: null,
  error: null,

  startRun: () =>
    set({
      running: true,
      error: null,
      result: null,
      stages: initialStages(),
    }),
  setStage: (id, patch) =>
    set((s) => ({
      stages: s.stages.map((st) => (st.id === id ? { ...st, ...patch } : st)),
    })),
  setAllStagesIdle: () => set({ stages: initialStages() }),
  finishRun: (r) =>
    set((s) => ({
      running: false,
      result: r,
      history:
        r.prompt && !s.history.includes(r.prompt)
          ? [r.prompt, ...s.history].slice(0, 12)
          : s.history,
    })),
  failRun: (err) => set({ running: false, error: err }),
  clearResult: () => set({ result: null, error: null, stages: initialStages() }),

  history: [],
  pushHistory: (p) =>
    set((s) =>
      p && !s.history.includes(p)
        ? { history: [p, ...s.history].slice(0, 12) }
        : {}
    ),

  accent: "emerald",
  setAccent: (a) => set({ accent: a }),
}));
