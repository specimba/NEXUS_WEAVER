"use client";

import { useState, useCallback, useRef, useEffect, useReducer } from "react";
import { useNexus } from "./store";
import { ASPECTS, STYLES, getPipelineStages, PROMPT_TEMPLATES, TEMPLATE_CATEGORIES } from "@/lib/nexus-types";
import type { StageId, PromptTemplate } from "@/lib/nexus-types";
import { cn } from "@/lib/utils";
import { ScoreRing, ScoreBar } from "./score-ring";
import { VerdictBadge, StatusDot } from "./verdict-badge";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  Wand2,
  Loader2,
  Shirt,
  Ratio,
  Palette,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ScanEye,
  FileJson,
  Image as ImageIcon,
  RotateCcw,
  ChevronRight,
  Zap,
  Wand,
  LayoutGrid,
  History,
  Download,
  Copy,
  Keyboard,
  Clock,
  Crosshair,
  Flame,
  Cloud,
  Clock3,
  ArrowRight,
  ShieldAlert,
  Cpu,
  Sliders,
  Layers,
  Plus,
  Brain,
  ScanText,
  ExternalLink,
  Film,
  Sparkle,
  Video,
  Play,
  Check,
  X,
  // M5 — NO8D control system icons
  Brush,
  GitCompareArrows,
  Upload,
  Eraser,
  FlipHorizontal2,
  ArrowLeftRight,
  // Task 15 — Brain Assistant + GPU Boost icons
  Lightbulb,
  Shuffle,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CALIBRATION_PRESETS,
  getPreset,
  presetCategoryLabel,
  presetsForEngine,
  resolveCalibration,
} from "@/lib/calibration";
import type { CalibrationPreset } from "@/lib/calibration";
import type { BrainSuggestion, BrainAnalysis } from "@/lib/brain-assistant";
import { getLora } from "@/lib/lora-library";
import type { LoraEntry } from "@/lib/lora-library";
import {
  ENGINES,
  enginesByType,
  getEngine,
  engineTypeLabel,
  DEFAULT_IMAGE_ENGINE_ID,
  DEFAULT_VIDEO_ENGINE_ID,
} from "@/lib/engines";
import type { Engine, EngineType } from "@/lib/engines";
import { BRAIN_MODELS, getBrain, DEFAULT_BRAIN_ID } from "@/lib/brain";
import type { BrainModel } from "@/lib/brain";
import { GROK_SUCCESS_PROMPTS, SUCCESS_PROMPT_CATEGORIES } from "@/lib/success-prompts";
import type { SuccessPrompt } from "@/lib/success-prompts";
import type { OcrResult } from "@/lib/ocr";
import type { RunPipelineRequest, PipelineResponse } from "@/lib/nexus-types";
import type { RunResult, RunStageState } from "./store";

const SAMPLE_PROMPTS = [
  "A lone astronaut discovering a bioluminescent forest on an alien moon, cinematic lighting",
  "Portrait of a cyberpunk street vendor in neon-lit Tokyo rain, reflective puddles",
  "A majestic airship docked at a floating island at golden hour, volumetric clouds",
  "Cozy bookshop interior with a sleeping cat, warm afternoon light through dusty windows",
  "A samurai standing in cherry blossom storm, ink-wash painting style",
];

// Pre-run heuristic: looks like a mature-content prompt? We don't block here —
// the backend policy layer makes the final call. This only shows a heads-up
// toast so the user isn't surprised when the pipeline returns status=blocked.
const MATURE_PROMPT_RE =
  /\b(nude|nudity|nsfw|explicit|18\+|adult|mature|erotic|lingerie|undress|naked|topless|nipples?|porn|pornograph|sex|sexual|genital|bare\s+skin|intimate|provocative)\b/i;

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  } catch {
    toast.error("Could not download image");
  }
}

export function StudioView() {
  const {
    prompt,
    style,
    aspect,
    wardrobe,
    setPrompt,
    setStyle,
    setAspect,
    setWardrobe,
    loadSettings,
    running,
    stages,
    result,
    error,
    startRun,
    setStage,
    finishRun,
    failRun,
    clearResult,
    setView,
    history,
    pushHistory,
    // v3 additions: calibration + LoRA + consent/policy
    calibrationId,
    calibrationOverrides,
    loraIds,
    loraWeights,
    loraEnabled,
    fingerprint,
    matureUnlocked,
    setCalibration,
    // v4 additions: engine + brain + video stage
    engineId,
    setEngine,
    syncCalibrationToEngine,
    brainId,
    setBrain,
    videoEnabled,
    setVideoEnabled,
  } = useNexus();

  const [advanced, setAdvanced] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [tplCategory, setTplCategory] = useState("All");
  // v4: templates panel tab — curated (PROMPT_TEMPLATES) vs grok (GROK_SUCCESS_PROMPTS)
  const [tplTab, setTplTab] = useState<"curated" | "grok">("curated");
  const [grokCategory, setGrokCategory] = useState("All");
  const [enhancing, setEnhancing] = useState(false);
  // M3: artistic-override flag — when true, the next run sends artisticOverride=true
  // to lower the minSafetyScore threshold (hard blocklist still enforced).
  const [artisticOverride, setArtisticOverride] = useState(false);
  // v5.42: Degraded mode — when brain endpoints are unavailable (budget/capacity),
  // skip ST3GG + Judge and generate the image directly. The generation is marked
  // "unchecked". NOT a z-ai fallback (rule #1) — no model substitution.
  const [skipBrain, setSkipBrain] = useState(false);
  // Modal is the PRIMARY generation path (always on). No boost toggle needed.

  // v4: engine-aware pipeline stages — reflect the selected engine + brain,
  // not a hardcoded "FLUX.2-klein-9B" label.
  const pipelineStages = getPipelineStages(engineId, brainId);
  const [elapsed, setElapsed] = useState(0);
  const [warming, setWarming] = useState(false);
  const [modalWarm, setModalWarm] = useState<boolean | null>(null);
  const runStartRef = useRef<number | null>(null);
  // v5: tracks the active async pipeline job for poll-loop cancellation.
  const activeJobIdRef = useRef<string | null>(null);

  // live elapsed timer during run
  useEffect(() => {
    if (!running) {
      runStartRef.current = null;
      setElapsed(0);
      return;
    }
    runStartRef.current = Date.now();
    const t = setInterval(() => {
      if (runStartRef.current) setElapsed(Date.now() - runStartRef.current);
    }, 100);
    return () => clearInterval(t);
  }, [running]);

  const run = useCallback(async () => {
    const p = prompt.trim();
    if (!p) {
      toast.error("Enter a prompt first");
      return;
    }
    if (running) return;

    if (MATURE_PROMPT_RE.test(p) && !matureUnlocked()) {
      toast.warning("This prompt may require mature mode.", {
        description: "Enable it in Compliance → Policy after accepting the 18+ notice.",
      });
    }

    startRun();
    pushHistory(p);
    setStage("prompt", { status: "running", message: "Tokenizing prompt…" });
    await new Promise((r) => setTimeout(r, 60));
    setStage("prompt", { status: "done", ms: 8, message: "Prompt accepted" });

    // v5 — ASYNC JOB PATTERN: POST returns {jobId} immediately (HTTP 202).
    // The pipeline runs in a background worker. We poll /api/pipeline/jobs/[id]
    // every 2s for live stage transitions + final result. This sidesteps the
    // 60s ALB timeout that was 504-ing every cold-start generation.
    try {
      const enabledLoraIds = loraIds.filter((id) => loraEnabled[id] !== false);
      const loraWeightsMap: Record<string, number> = {};
      for (const id of enabledLoraIds) {
        const w = loraWeights[id];
        if (typeof w === "number") loraWeightsMap[id] = w;
      }
      const body: RunPipelineRequest & {
        engineId?: string;
        brainId?: string;
        videoEnabled?: boolean;
        artisticOverride?: boolean;
        loraWeights?: Record<string, number>;
        modalBoost?: boolean;
        skipBrain?: boolean;
      } = {
        prompt: p,
        style,
        aspect,
        wardrobe: wardrobe.trim() || undefined,
        calibrationId,
        calibrationOverrides:
          Object.keys(calibrationOverrides).length > 0 ? calibrationOverrides : undefined,
        loraIds: enabledLoraIds.length > 0 ? enabledLoraIds : undefined,
        consentFingerprint: fingerprint || undefined,
        engineId,
        brainId,
        videoEnabled,
        artisticOverride,
        loraWeights:
          Object.keys(loraWeightsMap).length > 0 ? loraWeightsMap : undefined,
        skipBrain,
      };
      if (artisticOverride) setArtisticOverride(false);

      // Step 1: create the job (fast — just a DB insert).
      const createCtrl = new AbortController();
      const createTimer = setTimeout(() => createCtrl.abort(), 30_000);
      let createRes: Response;
      try {
        createRes = await fetch("/api/pipeline/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: createCtrl.signal,
        });
      } finally {
        clearTimeout(createTimer);
      }

      const contentType = createRes.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const msg = createRes.status === 504
          ? "Gateway timed out creating the job (60s ALB limit). The dev server may be restarting. Wait 10s and retry."
          : createRes.status === 500
          ? "Server error — the pipeline crashed. The dev server may have restarted or run out of memory. Please try again."
          : `Unexpected response (HTTP ${createRes.status}). The dev server may be restarting. Please try again.`;
        setStage("flux", { status: "error", message: msg });
        failRun(msg);
        toast.error(msg);
        return;
      }

      const createData = await createRes.json() as { jobId?: string; error?: string };
      if (!createRes.ok || !createData.jobId) {
        const msg = createData.error || `Failed to create pipeline job (HTTP ${createRes.status})`;
        setStage("flux", { status: "error", message: msg });
        failRun(msg);
        toast.error(msg);
        return;
      }

      const jobId = createData.jobId;
      activeJobIdRef.current = jobId;

      // Step 2: poll for progress every 2s, up to 6 min total.
      const POLL_INTERVAL_MS = 2000;
      const MAX_POLL_DURATION_MS = 6 * 60 * 1000;
      const pollStart = Date.now();
      let lastStageSnapshot = "";

      while (true) {
        if (Date.now() - pollStart > MAX_POLL_DURATION_MS) {
          const msg = `Pipeline timed out after ${MAX_POLL_DURATION_MS / 1000 / 60} min. The Modal GPU may still be cold-starting. The job is still running in the background — refresh in 1 min to check.`;
          setStage("flux", { status: "error", message: "Timed out" });
          failRun(msg);
          toast.error(msg);
          activeJobIdRef.current = null;
          return;
        }

        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        if (activeJobIdRef.current !== jobId) return; // new run started or unmounted

        let pollRes: Response;
        try {
          pollRes = await fetch(`/api/pipeline/jobs/${jobId}`, {
            headers: { Accept: "application/json" },
          });
        } catch {
          continue; // network blip — keep polling
        }

        if (!pollRes.ok) continue;
        const pollData = await pollRes.json() as {
          status: "queued" | "running" | "completed" | "failed" | "blocked";
          currentStage: string;
          stages: Record<string, { status: string; ms?: number; message?: string }>;
          result: (PipelineResponse & { error?: string }) | null;
          errorMessage: string | null;
        };

        // Sync stage statuses to the store (only if changed).
        const snapshot = JSON.stringify(pollData.stages);
        if (snapshot !== lastStageSnapshot) {
          lastStageSnapshot = snapshot;
          for (const [stageId, info] of Object.entries(pollData.stages)) {
            if (stageId === "prompt") continue;
            const sid = stageId as StageId;
            setStage(sid, {
              status: info.status as RunStageState["status"],
              ms: info.ms,
              message: info.message,
            });
          }
        }

        // Terminal state: completed
        if (pollData.status === "completed" && pollData.result) {
          const data = pollData.result;
          const t = (data.timings ?? {}) as Record<string, number | undefined>;
          setStage("flux", { status: "done", ms: t.flux, message: "Image rendered" });
          setStage("st3gg", {
            status: "done",
            ms: t.st3gg,
            message: data.safety ? `${data.safety?.riskLevel ?? "unknown"} risk · score ${data.safety?.score ?? "—"}` : "Scanned",
          });
          setStage("judge", {
            status: "done",
            ms: t.judge,
            message: data.judge ? `${data.judge?.verdict ?? "unknown"} · ${data.judge?.overallScore ?? "—"}` : "Judged",
          });
          setStage("evidence", { status: "done", ms: t.evidence, message: "Evidence aggregated" });
          setStage("output", { status: "done", ms: 1, message: "Persisted to gallery" });

          finishRun({
            id: data.id,
            status: data.status,
            imagePath: data.imagePath,
            verdict: data.verdict,
            overallScore: data.overallScore,
            safety: data.safety,
            judge: data.judge,
            evidence: data.evidence,
            timings: data.timings,
            errorMessage: null,
            calibration: data.calibration,
            loraIds: data.loraIds ?? loraIds,
            maturityTier: data.maturityTier,
            blockReason: null,
            prompt: p,
            style,
            aspect,
            wardrobe: wardrobe.trim() || null,
            engineId: data.engineId ?? engineId,
            backend: data.backend ?? null,
            backendMismatch: data.backendMismatch ?? false,
            seed: data.seed ?? null,
          });
          toast.success(`Pipeline complete — ${data.verdict}`);
          activeJobIdRef.current = null;
          return;
        }

        // Terminal state: blocked
        if (pollData.status === "blocked" && pollData.result) {
          const data = pollData.result;
          setStage("flux", { status: "error", message: "Blocked by policy" });
          setStage("st3gg", {
            status: "done",
            message: data.safety ? `${data.safety?.riskLevel ?? "unknown"} risk · score ${data.safety?.score ?? "—"}` : "Blocked",
          });
          setStage("judge", { status: "skipped", message: "Skipped — blocked" });
          setStage("evidence", { status: "skipped", message: "Skipped — blocked" });
          setStage("output", { status: "skipped", message: "Skipped — blocked" });
          finishRun({
            id: data.id,
            status: "blocked",
            imagePath: null,
            verdict: data.verdict,
            overallScore: null,
            safety: data.safety,
            judge: null,
            evidence: data.evidence,
            timings: data.timings,
            errorMessage: null,
            calibration: data.calibration,
            loraIds: data.loraIds ?? loraIds,
            maturityTier: data.maturityTier,
            blockReason: data.blockReason ?? "Blocked by safety policy",
            prompt: p,
            style,
            aspect,
            wardrobe: wardrobe.trim() || null,
            engineId: data.engineId ?? engineId,
            backend: data.backend ?? null,
            backendMismatch: data.backendMismatch ?? false,
            seed: data.seed ?? null,
          });
          toast.warning("Run blocked by safety policy", {
            description: data.blockReason ?? undefined,
          });
          activeJobIdRef.current = null;
          return;
        }

        // Terminal state: failed
        if (pollData.status === "failed") {
          const msg = pollData.errorMessage || pollData.result?.errorMessage || "Generation failed";
          const rawStage = pollData.currentStage || "flux";
          const failedStage: StageId =
            rawStage === "st3gg" || rawStage === "flux" || rawStage === "judge" ||
            rawStage === "evidence" || rawStage === "output" || rawStage === "prompt"
              ? (rawStage as StageId)
              : "flux";
          setStage(failedStage, { status: "error", message: msg });
          failRun(msg);
          toast.error(msg);
          activeJobIdRef.current = null;
          return;
        }
        // else: still queued/running — keep polling.
      }
    } catch (e) {
      setStage("flux", { status: "error" });
      const msg = e instanceof Error ? e.message : String(e);
      failRun(msg);
      toast.error(msg);
      activeJobIdRef.current = null;
    }
  }, [
    prompt, style, aspect, wardrobe, running,
    calibrationId, calibrationOverrides, loraIds, loraWeights, loraEnabled,
    fingerprint, matureUnlocked,
    engineId, brainId, videoEnabled, artisticOverride, skipBrain,
    startRun, setStage, finishRun, failRun, pushHistory,
  ]);

  // keyboard shortcut: Cmd/Ctrl+Enter to run
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!running && prompt.trim()) run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, running, prompt]);

  // SMART WARM-UP: fires ONCE per browser session (sessionStorage gate) to avoid
  // burning GPU credits on every Studio mount / React StrictMode dev double-fire.
  // The FLUX.2 status check is cached server-side (5min) and cheap; the brain
  // pre-warm triggers 3 managed-endpoint cold-starts (~$0.18-0.55 when all cold)
  // so we gate it to once per session. (Cost audit 2-a, fix C-b-1.)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Check FLUX.2 status (cached server-side, fast, no GPU burn)
        const sr = await fetch("/api/modal/status", { cache: "no-store" });
        if (cancelled) return;
        const sd = await sr.json();
        if (sd.reachable) setModalWarm(true);

        // Pre-warm brain endpoints ONLY once per session (cost guard).
        if (typeof window !== "undefined" && sessionStorage.getItem("nexus-brain-warmed") === "1") return;
        if (typeof window !== "undefined") sessionStorage.setItem("nexus-brain-warmed", "1");
        fetch("/api/modal/warm-endpoints", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "warm" }),
        }).catch(() => {});
      } catch {
        // silent — warm-up is best-effort
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Pre-emptively warm up the Modal container so the first generation
  // doesn't pay the cold-start latency.
  const warmupModal = useCallback(async () => {
    setWarming(true);
    setModalWarm(null);
    try {
      const res = await fetch("/api/modal/warmup", { method: "POST" });
      const data = await res.json();
      if (data.warmed) {
        setModalWarm(true);
        // Show combined FLUX.2 + brain status
        const fluxMs = data.flux?.latencyMs ?? data.latencyMs ?? "?";
        const brainOk = data.brain?.reachable ?? false;
        const brainMs = data.brain?.latencyMs ?? "?";
        toast.success(`FLUX.2 warm — ${fluxMs}ms`, {
          description: brainOk
            ? `Brain also warm — ${brainMs}ms. Both ready.`
            : data.brain
            ? `Brain still cold-starting — will fall through to z-ai.`
            : `${data.model ?? "FLUX.2 Klein 9B"} on ${data.gpu ?? "L40S"}`,
        });
      } else if (!data.enabled) {
        setModalWarm(false);
        toast.info("Modal disabled — check .env configuration");
      } else {
        setModalWarm(false);
        toast.warning("Modal still cold-starting", {
          description: data.message?.slice(0, 140) || "Try again in 1–2 minutes, or run the pipeline and wait.",
        });
      }
    } catch (e) {
      setModalWarm(false);
      toast.error("Warm-up probe failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setWarming(false);
    }
  }, []);

  const enhance = useCallback(async () => {
    const p = prompt.trim();
    if (!p) {
      toast.error("Enter a prompt to enhance");
      return;
    }
    setEnhancing(true);
    try {
      const res = await fetch("/api/prompt/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enhance failed");
      setPrompt(data.enhanced);
      toast.success("Prompt enhanced by AI");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enhance failed");
    } finally {
      setEnhancing(false);
    }
  }, [prompt, style, setPrompt]);

  // Stable Yogi Prompt Engine — curated Pony/SDXL prompts from Stable Yogi's API
  const [syLoading, setSyLoading] = useState(false);
  const fetchSYPrompt = useCallback(async () => {
    setSyLoading(true);
    try {
      const res = await fetch("/api/prompt/sy-engine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjects: "Solo Female", count: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SY Prompt failed");
      if (data.prompts && data.prompts.length > 0) {
        setPrompt(data.prompts[0]);
        toast.success(`Stable Yogi prompt loaded (${data.remaining} left today)`, {
          description: `Rating: ${data.rating} · Curated for Pony/SDXL`
        });
      } else {
        toast.error("No prompt returned from Stable Yogi");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "SY Prompt failed");
    } finally {
      setSyLoading(false);
    }
  }, [setPrompt]);

  const aspectDef = ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];
  const filteredTemplates =
    tplCategory === "All"
      ? PROMPT_TEMPLATES
      : PROMPT_TEMPLATES.filter((t) => t.category === tplCategory);

  return (
    <div className="space-y-5 nexus-rise">
      {/* Hero header */}
      <section className="nexus-gradient-border relative overflow-hidden rounded-2xl p-5 sm:p-7">
        <div className="absolute inset-0 nexus-scanline pointer-events-none opacity-30" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary nexus-glow">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
                Studio · Generation Surface
              </span>
            </div>
            <h1 className="nexus-headline nexus-text-balance font-mono text-2xl font-bold tracking-tight sm:text-3xl">
              Weave a vision through the governed pipeline
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-[15px]">
              Describe what you want. FLUX generates the image on a Modal L40S GPU,
              then ST3GG and Judge scan, judge and structure the result — automatically.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl nexus-glass px-3 py-2.5">
              <Zap className="h-4 w-4 text-amber-400" />
              <div className="leading-none">
                <div className="font-mono text-xs font-semibold">~30–60s</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  end-to-end
                </div>
              </div>
            </div>
            <div className="hidden items-center gap-1.5 rounded-xl nexus-glass px-3 py-2.5 sm:flex">
              <Keyboard className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono text-[10px] text-muted-foreground">
                <kbd className="rounded bg-foreground/10 px-1 py-0.5 text-[9px]">⌘</kbd>
                <kbd className="ml-0.5 rounded bg-foreground/10 px-1 py-0.5 text-[9px]">↵</kbd>
                run
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* LEFT: control panel */}
        <div className="space-y-4">
          {/* v4: Engine picker — top of the studio controls */}
          <EnginePicker />

          {/* v4: Output card — video stage (I2V) toggle */}
          <VideoStageToggle />

          {/* Prompt + enhance + history */}
          <div className="nexus-card rounded-2xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <Crosshair className="h-3 w-3 text-primary" /> Prompt
              </label>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  {prompt.length}/2000
                </span>
                <button
                  onClick={() => setShowHistory((v) => !v)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border border-border/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground",
                    showHistory && "border-primary/40 text-primary"
                  )}
                  title="Recent prompts"
                >
                  <History className="h-2.5 w-2.5" /> History
                </button>
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
              placeholder="Describe the image you want to weave…"
              rows={5}
              className="nexus-input w-full resize-none rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 text-sm outline-none"
            />
            {showHistory && history.length > 0 ? (
              <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto nexus-scroll rounded-lg border border-border/40 bg-background/40 p-1.5">
                {history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPrompt(h);
                      setShowHistory(false);
                    }}
                    className="block w-full truncate rounded px-2 py-1 text-left text-[11px] text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
                    title={h}
                  >
                    {h}
                  </button>
                ))}
              </div>
            ) : null}
            {showHistory && history.length === 0 ? (
              <div className="mt-2 rounded-lg border border-dashed border-border/40 px-3 py-2 text-center text-[10px] text-muted-foreground">
                No history yet — run a pipeline to populate
              </div>
            ) : null}

            {/* Action row: enhance + templates */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button
                onClick={enhance}
                disabled={enhancing || !prompt.trim()}
                className={cn(
                  "nexus-chip inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                )}
              >
                {enhancing ? <Loader2 className="h-3 w-3 animate-spin text-primary" /> : <Wand className="h-3 w-3 text-primary" />}
                Enhance
              </button>
              <button
                onClick={() => setShowTemplates((v) => !v)}
                className={cn(
                  "nexus-chip inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition",
                  showTemplates
                    ? "nexus-chip-active"
                    : "border-border/50 bg-background/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-3 w-3" /> Templates
              </button>
              <button
                onClick={fetchSYPrompt}
                disabled={syLoading}
                title="Get a curated Stable Yogi prompt (Pony/SDXL tag format)"
                className="nexus-chip inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-40"
              >
                {syLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                SY Prompt
              </button>
              {prompt ? (
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(prompt);
                    toast.success("Prompt copied");
                  }}
                  className="nexus-chip inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              ) : null}
            </div>

            {/* Templates panel — v4: two tabs (Curated + Grok Success) */}
            {showTemplates ? (
              <div className="mt-3 nexus-rise rounded-lg border border-border/50 bg-background/40 p-2.5">
                <Tabs value={tplTab} onValueChange={(v) => setTplTab(v as "curated" | "grok")}>
                  <TabsList className="mb-2 h-7 w-full">
                    <TabsTrigger value="curated" className="gap-1 text-[10px]">
                      <LayoutGrid className="h-3 w-3" /> Curated
                    </TabsTrigger>
                    <TabsTrigger value="grok" className="gap-1 text-[10px]">
                      <Sparkle className="h-3 w-3" /> Grok Success
                    </TabsTrigger>
                  </TabsList>

                  {/* Curated templates (existing PROMPT_TEMPLATES) */}
                  <TabsContent value="curated" className="mt-0">
                    <div className="mb-2 flex flex-wrap gap-1">
                      {TEMPLATE_CATEGORIES.map((c) => (
                        <button
                          key={c}
                          onClick={() => setTplCategory(c)}
                          className={cn(
                            "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition",
                            tplCategory === c
                              ? "bg-primary/15 text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <div className="grid max-h-56 gap-1.5 overflow-y-auto nexus-scroll sm:grid-cols-2">
                      {filteredTemplates.map((tpl) => (
                        <TemplateCard
                          key={tpl.id}
                          tpl={tpl}
                          onUse={() => {
                            loadSettings({ prompt: tpl.prompt, style: tpl.style, aspect: tpl.aspect });
                            setShowTemplates(false);
                            toast.success(`Loaded "${tpl.title}"`);
                          }}
                        />
                      ))}
                    </div>
                  </TabsContent>

                  {/* Grok Success templates (v4) */}
                  <TabsContent value="grok" className="mt-0">
                    <div className="mb-2 flex flex-wrap gap-1">
                      {SUCCESS_PROMPT_CATEGORIES.map((c) => (
                        <button
                          key={c}
                          onClick={() => setGrokCategory(c)}
                          className={cn(
                            "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition",
                            grokCategory === c
                              ? "bg-amber-500/15 text-amber-300"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <div className="grid max-h-64 gap-1.5 overflow-y-auto nexus-scroll sm:grid-cols-2">
                      {GROK_SUCCESS_PROMPTS.filter(
                        (sp) => grokCategory === "All" || sp.category === grokCategory
                      ).map((sp) => (
                        <GrokSuccessCard
                          key={sp.id}
                          sp={sp}
                          onUse={() => {
                            loadSettings({
                              prompt: sp.prompt,
                              style: sp.style,
                              aspect: sp.aspect,
                              wardrobe: sp.wardrobe,
                            });
                            // set the engine to match sp.engineFamilies[0] if possible
                            const fam = sp.engineFamilies[0];
                            const match = ENGINES.find((e) => e.family === fam);
                            if (match) {
                              setEngine(match.id);
                              syncCalibrationToEngine();
                            }
                            // set the calibration to sp.recommendedPresetId
                            setCalibration(sp.recommendedPresetId);
                            setShowTemplates(false);
                            toast.success(`Loaded Grok template: ${sp.title}`);
                          }}
                        />
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            ) : null}

            {/* Sample prompts (only when empty) */}
            {!prompt ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {SAMPLE_PROMPTS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(s)}
                    className="nexus-chip rounded-md border border-border/50 bg-background/40 px-2 py-1 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                    title={s}
                  >
                    {s.slice(0, 26)}…
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* M5: Prompt+ — NO8D-style LLM prompt expansion + image→prompt reverse */}
          <PromptPlusCard />

          {/* Style */}
          <div className="nexus-card rounded-2xl p-4">
            <label className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <Palette className="h-3.5 w-3.5 text-primary" /> Style
            </label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={cn(
                    "nexus-chip rounded-md border px-2 py-1.5 text-left text-[11px] font-medium",
                    style === s ? "nexus-chip-active" : "border-border/50 bg-background/40 text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Aspect */}
          <div className="nexus-card rounded-2xl p-4">
            <label className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <Ratio className="h-3.5 w-3.5 text-primary" /> Aspect Ratio
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {ASPECTS.map((a) => {
                const active = aspect === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => setAspect(a.id)}
                    className={cn(
                      "nexus-chip flex flex-col items-center gap-1.5 rounded-md border px-1 py-2",
                      active ? "nexus-chip-active" : "border-border/50 bg-background/40 hover:border-primary/30"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-sm border",
                        active ? "border-primary" : "border-muted-foreground/50"
                      )}
                      style={{
                        width: a.w >= a.h ? 22 : (22 * a.w) / a.h,
                        height: a.h >= a.w ? 16 : (16 * a.h) / a.w,
                      }}
                    />
                    <span className={cn("font-mono text-[10px]", active ? "text-primary" : "text-muted-foreground")}>
                      {a.id}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-[10px] text-muted-foreground">
              Output size: <span className="font-mono text-foreground">{aspectDef.size}px</span>
            </div>
          </div>

          {/* v3: FLUX Calibration panel */}
          <CalibrationPanel />

          {/* v4: Pipeline Brain selector — uncensored judge/safety/evidence brain */}
          <BrainSelector />

          {/* Wardrobe (advanced) */}
          <div className="nexus-card rounded-2xl p-4">
            <button onClick={() => setAdvanced((v) => !v)} className="flex w-full items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <Shirt className="h-3.5 w-3.5 text-primary" /> Wardrobe / Detail Notes
              </span>
              <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition", advanced && "rotate-90")} />
            </button>
            {advanced ? (
              <input
                value={wardrobe}
                onChange={(e) => setWardrobe(e.target.value.slice(0, 500))}
                placeholder="e.g. flowing red cloak, leather armor, silver circlet"
                className="nexus-input mt-3 w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm outline-none"
              />
            ) : null}
          </div>

          {/* v3: LoRA stack */}
          <LoraStack />

          {/* Task 15: Brain Assistant — advisory analysis of the current config */}
          <BrainAssistantCard />

          {/* Modal is the primary path — show warm/cold status */}
          <div className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[11px]",
            modalWarm ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-amber-500/30 bg-amber-500/5 text-amber-300"
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", modalWarm ? "bg-emerald-400" : "bg-amber-400 nexus-pulse")} />
            {modalWarm ? "Modal L40S · Warm" : warming ? "Modal L40S · Warming…" : "Modal L40S · Cold (auto-warming)"}
          </div>

          {/* Run button + Warm up Modal */}
          <div className="flex gap-2">
              <button
                onClick={run}
                disabled={running || !prompt.trim()}
                className="nexus-btn-primary flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 font-mono text-sm font-semibold text-primary-foreground"
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Weaving…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Run Pipeline
                  </>
                )}
              </button>
              {running ? (
                <div className="flex items-center gap-2 font-mono text-[10px] text-cyan-400/80">
                  <span className="nexus-pulse inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  <span>{skipBrain ? "FLUX.2 only · degraded" : "ST3GG → FLUX.2 → Judge → Evidence"} · ~30-60s · {(elapsed / 1000).toFixed(1)}s elapsed</span>
                </div>
              ) : null}
              <button
                onClick={warmupModal}
              disabled={warming || running}
              title="Pre-warm the Modal GPU container so the first generation doesn't pay cold-start latency"
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-3 font-mono text-[11px] uppercase tracking-wider transition",
                modalWarm === true
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                  : modalWarm === false
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                    : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              {warming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Flame className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {warming ? "Warming…" : modalWarm === true ? "Warm" : modalWarm === false ? "Cold" : "Warm up"}
              </span>
            </button>
            {(result || error) && !running ? (
              <button
                onClick={clearResult}
                className="rounded-xl border border-border/60 px-3 py-3 text-muted-foreground transition hover:text-foreground"
                title="Clear"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {/* v5.42: Degraded mode toggle — skip brain when endpoints unavailable */}
          <label className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 font-mono text-[10px] text-amber-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipBrain}
              onChange={(e) => setSkipBrain(e.target.checked)}
              className="h-3 w-3 accent-amber-500"
            />
            <span className="flex-1">
              {skipBrain ? "⚠ Degraded mode ON — skip ST3GG + Judge (image only, UNCHECKED)" : "Brain endpoints unavailable? Enable degraded mode (skip safety + judge)"}
            </span>
          </label>

          {/* Modal warm-up status strip */}
          {modalWarm !== null && !running ? (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px]",
                modalWarm
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/5 text-amber-300"
              )}
            >
              <Cloud className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">
                {modalWarm
                  ? "Modal GPU container is warm — generation will be ~1.5–2s."
                  : "Modal container is cold. First generation takes ~60-90s (async pipeline handles it — no timeout)."}
              </span>
            </div>
          ) : null}

          {error ? (
            <div className="nexus-rise rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <XCircle className="h-3.5 w-3.5" /> Pipeline Error
              </div>
              {error}
            </div>
          ) : null}
        </div>

        {/* RIGHT: pipeline + result */}
        <div className="space-y-4">
          {/* Pipeline progress */}
          <div className="nexus-card relative overflow-hidden rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="text-primary">◆</span> Pipeline Stages
              </h3>
              <div className="flex items-center gap-2">
                {running ? (
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-cyan-400">
                    <Clock className="h-3 w-3" /> {(elapsed / 1000).toFixed(1)}s
                  </span>
                ) : null}
                {running ? (
                  <span className="font-mono text-[10px] text-cyan-400">live · running</span>
                ) : null}
              </div>
            </div>
            {running ? <div className="absolute inset-x-0 top-0 h-0.5 nexus-sweep" /> : null}
            <ol className="space-y-1.5">
              {stages.map((st, i) => {
                const def = pipelineStages.find((p) => p.id === st.id)!;
                const Icon = stageIcon(st.id);
                return (
                  <motion.li
                    key={st.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.04 }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2 transition",
                      st.status === "running"
                        ? "border-cyan-500/40 bg-cyan-500/5"
                        : st.status === "done"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : st.status === "error"
                            ? "border-rose-500/40 bg-rose-500/5"
                            : "border-border/40 bg-background/30"
                    )}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-background/60">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="truncate text-sm font-medium">{def.label}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-mono">{def.model}</span>
                        <span>·</span>
                        <span>{def.params}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {st.message ? (
                        <span className="hidden text-[10px] text-muted-foreground sm:inline">{st.message}</span>
                      ) : null}
                      {typeof st.ms === "number" ? (
                        <span className="font-mono text-[10px] text-primary">
                          {st.ms < 1000 ? `${st.ms}ms` : `${(st.ms / 1000).toFixed(1)}s`}
                        </span>
                      ) : null}
                      {st.status === "running" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                      ) : (
                        <StatusDot status={st.status} />
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          </div>

          {/* Result */}
          {result ? (
            <ResultPanel
              result={result}
              onGallery={() => setView("gallery")}
              onCompliance={() => setView("compliance")}
              onRerun={() => {
                loadSettings({
                  prompt: result.prompt,
                  style: result.style,
                  aspect: result.aspect,
                  wardrobe: result.wardrobe ?? "",
                });
                clearResult();
                toast.info("Settings loaded — press Run to re-weave");
              }}
              onArtisticRetry={() => {
                // M3: re-run the same prompt with artisticOverride=true
                loadSettings({
                  prompt: result.prompt,
                  style: result.style,
                  aspect: result.aspect,
                  wardrobe: result.wardrobe ?? "",
                });
                clearResult();
                // set the artistic override flag + auto-run on next tick
                setArtisticOverride(true);
                setTimeout(() => run(), 50);
              }}
            />
          ) : null}
          {!result && !running ? (
            <EmptyState
              onQuickStart={(p, s, a) => {
                loadSettings({ prompt: p, style: s, aspect: a });
                toast.success(`Loaded "${s}" template — press Run to weave`);
              }}
            />
          ) : null}

          {/* Recent Generations strip — always visible when there's history */}
          <RecentGenerations
            onPick={(g) => {
              loadSettings({
                prompt: g.prompt,
                style: g.style,
                aspect: g.aspect,
                wardrobe: g.wardrobe ?? "",
              });
              toast.success("Loaded prior prompt — press Run to re-weave");
            }}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * RecentGenerations — horizontal thumbnail strip of the last 8 generations.
 * Lets the user quickly re-load a prior prompt+settings into the form.
 */
function RecentGenerations({ onPick }: { onPick: (g: RecentGen) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["nexus-recent-gens"],
    queryFn: async () => {
      const res = await fetch("/api/gallery?limit=8", { cache: "no-store" });
      if (!res.ok) throw new Error("gallery");
      const d = (await res.json()) as { items: RecentGen[] };
      return d.items;
    },
    // 60s refetch — the gallery doesn't change often, and frequent refetches
    // cause UI flashing (skeleton → content → skeleton → content). The async
    // pipeline job completion will trigger a refetch via queryKey invalidation
    // when a run finishes, so we don't need aggressive polling here.
    refetchInterval: 60_000,
    staleTime: 30_000, // don't refetch on window focus if data is < 30s old
  });

  const items = data ?? [];
  if (isLoading && items.length === 0) {
    return (
      <div className="nexus-card rounded-2xl p-4">
        <div className="mb-3 flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Recent Generations
          </span>
        </div>
        <div className="flex gap-2 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="nexus-skeleton h-20 w-24 shrink-0 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="nexus-card rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Recent Generations
          </span>
          <span className="font-mono text-[9px] text-muted-foreground/60">· {items.length}</span>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground/60">
          click to load prompt
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto nexus-scroll pb-1">
        {items.map((g) => (
          <button
            key={g.id}
            onClick={() => onPick(g)}
            className="group nexus-card-hover relative h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-border/40 bg-background/40 transition hover:border-primary/40"
            title={g.prompt}
          >
            {g.imagePath ? (
               
              <img
                src={g.imagePath}
                alt={g.prompt}
                className="h-full w-full object-cover transition group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-muted-foreground">
                <ImageIcon className="h-4 w-4" />
              </div>
            )}
            {/* gradient overlay with verdict + score */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
            <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
              <span
                className={cn(
                  "rounded px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider backdrop-blur",
                  g.verdict === "approved"
                    ? "bg-emerald-500/30 text-emerald-200"
                    : g.verdict === "rejected"
                      ? "bg-rose-500/30 text-rose-200"
                      : "bg-amber-500/30 text-amber-200"
                )}
              >
                {g.verdict?.slice(0, 4) ?? "—"}
              </span>
              {typeof g.overallScore === "number" ? (
                <span className="rounded bg-black/60 px-1 py-0.5 font-mono text-[8px] text-foreground backdrop-blur">
                  {Math.round(g.overallScore)}
                </span>
              ) : null}
            </div>
            {/* hover hint */}
            <div className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition group-hover:opacity-100">
              <span className="flex items-center gap-1 rounded-md bg-primary/80 px-1.5 py-0.5 font-mono text-[9px] text-primary-foreground">
                Load <ArrowRight className="h-2.5 w-2.5" />
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

interface RecentGen {
  id: string;
  prompt: string;
  style: string;
  aspect: string;
  wardrobe?: string | null;
  imagePath?: string | null;
  verdict?: string | null;
  overallScore?: number | null;
  createdAt: string;
}

function stageIcon(id: StageId) {
  switch (id) {
    case "prompt":
      return Sparkles;
    case "flux":
      return ImageIcon;
    case "st3gg":
      return ShieldMark;
    case "judge":
      return ScanEye;
    case "evidence":
      return FileJson;
    case "output":
      return CheckCircle2;
  }
}

function ShieldMark() {
  return <AlertTriangle className="h-3.5 w-3.5" />;
}

function TemplateCard({ tpl, onUse }: { tpl: PromptTemplate; onUse: () => void }) {
  return (
    <button
      onClick={onUse}
      className="group nexus-card-hover rounded-lg border border-border/40 bg-background/30 p-2.5 text-left"
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-primary">
          {tpl.category}
        </span>
        {tpl.style ? (
          <span className="font-mono text-[8px] text-muted-foreground">{tpl.style}</span>
        ) : null}
      </div>
      <div className="text-[11px] font-semibold leading-tight text-foreground">{tpl.title}</div>
      <p className="mt-1 line-clamp-2 text-[9px] leading-snug text-muted-foreground">{tpl.prompt}</p>
    </button>
  );
}

function EmptyState({ onQuickStart }: { onQuickStart?: (prompt: string, style: string, aspect: string) => void }) {
  const quickStarts: { prompt: string; style: string; aspect: string; label: string; emoji: string }[] = [
    { prompt: "A lone astronaut discovering a bioluminescent forest on an alien moon, cinematic lighting", style: "cinematic", aspect: "16:9", label: "Astronaut", emoji: "🧑‍🚀" },
    { prompt: "Portrait of a cyberpunk street vendor in neon-lit Tokyo rain, reflective puddles", style: "cyberpunk", aspect: "1:1", label: "Cyberpunk", emoji: "🌃" },
    { prompt: "A majestic airship docked at a floating island at golden hour, volumetric clouds", style: "digital-art", aspect: "16:9", label: "Airship", emoji: "🛩️" },
    { prompt: "Cozy bookshop interior with a sleeping cat, warm afternoon light through dusty windows", style: "oil-painting", aspect: "4:3", label: "Bookshop", emoji: "📚" },
    { prompt: "A samurai standing in cherry blossom storm, ink-wash painting style", style: "watercolor", aspect: "3:4", label: "Samurai", emoji: "🌸" },
    { prompt: "Abstract liquid metal sculpture on a black pedestal, studio lighting, hyper-detailed", style: "3d-render", aspect: "1:1", label: "Sculpture", emoji: "🗿" },
  ];
  return (
    <div className="nexus-card relative overflow-hidden rounded-2xl p-6 sm:p-8">
      <div className="absolute inset-0 nexus-scanline pointer-events-none opacity-20" />
      <div className="relative grid min-h-[280px] place-items-center text-center">
        <div className="nexus-rise w-full">
          <div className="relative mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary nexus-glow nexus-float">
            <Wand2 className="h-7 w-7" />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-400 nexus-pulse" />
          </div>
          <h3 className="font-mono text-sm font-semibold">Awaiting first job</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
            Enter a prompt, pick a style, and run the pipeline. Or launch a curated quick-start
            below. The multi-model chain produces a governed image with structured evidence.
          </p>
          <div className="mx-auto mt-4 grid max-w-xs grid-cols-3 gap-2">
            {[
              { k: "Generate", v: "FLUX.2" },
              { k: "Scan", v: "ST3GG" },
              { k: "Judge", v: "CPM-V" },
            ].map((s) => (
              <div key={s.k} className="rounded-lg border border-border/40 bg-background/40 px-2 py-1.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.k}</div>
                <div className="font-mono text-[10px] text-primary">{s.v}</div>
              </div>
            ))}
          </div>

          {onQuickStart ? (
            <div className="mx-auto mt-6 max-w-2xl">
              <div className="mb-2 flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <Zap className="h-3 w-3 text-amber-400" /> Quick Start
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {quickStarts.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => onQuickStart(q.prompt, q.style, q.aspect)}
                    className="nexus-press nexus-card-hover group rounded-lg border border-border/50 bg-background/40 p-2.5 text-left transition hover:border-primary/40"
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="text-base">{q.emoji}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground group-hover:text-primary">
                        {q.label}
                      </span>
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground/80" title={q.prompt}>
                      {q.prompt.slice(0, 42)}…
                    </div>
                    <div className="mt-1 flex items-center gap-1">
                      <span className="rounded bg-primary/10 px-1 py-0.5 font-mono text-[8px] text-primary">{q.style}</span>
                      <span className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[8px] text-muted-foreground">{q.aspect}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ResultPanel({
  result,
  onGallery,
  onCompliance,
  onRerun,
  onArtisticRetry,
}: {
  result: NonNullable<ReturnType<typeof useNexus.getState>["result"]>;
  onGallery: () => void;
  onCompliance: () => void;
  onRerun: () => void;
  onArtisticRetry: () => void;
}) {
  const totalMs = result.timings
    ? Object.values(result.timings).reduce<number>((a, b) => a + (typeof b === "number" ? b : 0), 0)
    : 0;

  // M4: image-approval → video step-2 flow.
  // `approved` flips to true when the user clicks either the "Approve &
  // Animate →" affordance on the image, or the "Animate →" button inside the
  // VideoStepCard. Once approved, a ✓ Approved badge appears on the image and
  // the VideoStepCard is rendered (below the ProvenanceCard).
  const [approved, setApproved] = useState(false);
  const [videoPulse, setVideoPulse] = useState(false);
  const videoCardRef = useRef<HTMLDivElement | null>(null);

  const handleApproveAndAnimate = useCallback(() => {
    setApproved(true);
    setVideoPulse(true);
    // Brief emerald ring pulse on the VideoStepCard so the user's eye lands on it.
    window.setTimeout(() => setVideoPulse(false), 1500);
    // Defer the scroll until the card has actually rendered.
    window.setTimeout(() => {
      videoCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }, []);

  // Policy refusal — dedicated blocked-state UI (not an error).
  if (result.status === "blocked") {
    return (
      <div className="space-y-4 nexus-rise">
        <div className="nexus-card rounded-2xl border border-rose-500/40 bg-rose-500/5 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-500/15 text-rose-400 nexus-glow">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-mono text-sm font-semibold text-rose-200">
                  Run blocked by safety policy
                </h3>
                {result.maturityTier ? (
                  <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-rose-300">
                    tier: {result.maturityTier}
                  </span>
                ) : null}
              </div>
              <p className="mt-1.5 text-sm text-rose-100/80">
                {result.blockReason ?? "The pipeline refused to render this prompt."}
              </p>
              {result.safety ? (
                <div className="mt-3 rounded-lg border border-rose-500/20 bg-background/40 p-2.5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      ST3GG safety scan
                    </span>
                    <span className="font-mono text-[10px] text-rose-300">
                      risk: {result.safety?.riskLevel ?? "unknown"} · score {result.safety?.score ?? "—"}
                    </span>
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    {result.safety?.rationale ?? "No rationale provided."}
                  </p>
                  {(result.safety?.flags?.length ?? 0) > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {result.safety!.flags!.map((f) => (
                        <span
                          key={f}
                          className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[9px] text-rose-300"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={onCompliance}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-rose-200 transition hover:bg-rose-500/20"
                >
                  <ShieldAlert className="h-3 w-3" /> Review policy in Compliance
                  <ArrowRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={onRerun}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" /> Adjust &amp; retry
                </button>
                {result.safety && (result.safety?.score ?? 0) >= 40 ? (
                  <button
                    type="button"
                    onClick={() => {
                      // M3: artistic-override retry — re-runs with a temporary
                      // policy override that lowers the minSafetyScore threshold.
                      // The HARD blocklist (csam, nonconsensual, real-person, etc.)
                      // is ALWAYS enforced and cannot be overridden.
                      toast.info("Retrying as artistic reference…", {
                        description: "Hard blocklist still enforced. Non-distributable.",
                      });
                      onArtisticRetry();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-200 transition hover:bg-amber-500/20"
                    title="Re-runs with a lowered safety threshold for artistic/editorial work. The hard blocklist (CSAM, nonconsensual, real-person) is always enforced."
                  >
                    <Palette className="h-3 w-3" /> Retry as artistic
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <ProvenanceCard result={result} />
      </div>
    );
  }

  return (
    <div className="space-y-4 nexus-rise">
      {/* Image + verdict */}
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
        <div className="nexus-card group relative overflow-hidden rounded-2xl">
          {result.imagePath ? (
             
            <img src={result.imagePath} alt={result.prompt} className="w-full object-cover" />
          ) : (
            <div className="grid aspect-square place-items-center text-muted-foreground">
              <XCircle className="h-8 w-8" />
            </div>
          )}
          {/* M4: ✓ Approved badge — top-right corner of the image, visible once the
              user clicks either "Approve & Animate →" on the image or "Animate →"
              in the VideoStepCard. Signifies the still was approved for I2V. */}
          {result.imagePath && approved ? (
            <div className="pointer-events-none absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-200 backdrop-blur-sm">
              <CheckCircle2 className="h-3 w-3" /> Approved
            </div>
          ) : null}
          {result.imagePath ? (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
              {/* M4: Approve & Animate → scrolls to / pulses the VideoStepCard */}
              <button
                type="button"
                onClick={handleApproveAndAnimate}
                className="inline-flex items-center gap-1 rounded-md bg-primary/90 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-primary-foreground transition hover:bg-primary"
                title="Approve this image and jump to the I2V video step"
              >
                <Film className="h-3 w-3" /> Approve &amp; Animate →
              </button>
              <button
                onClick={() => downloadImage(result.imagePath!, `nexus-${result.id.slice(-8)}.png`)}
                className="inline-flex items-center gap-1 rounded-md nexus-glass px-2 py-1 font-mono text-[10px] text-foreground transition hover:text-primary"
              >
                <Download className="h-3 w-3" /> PNG
              </button>
            </div>
          ) : null}
        </div>
        <div className="nexus-card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Verdict</span>
            <VerdictBadge verdict={result.verdict} size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <ScoreRing value={result.overallScore} size={76} label="Overall" />
            <div className="flex-1 space-y-1.5">
              {result.judge ? (
                <>
                  <ScoreBar label="Prompt adherence" value={result.judge?.promptAdherence ?? 0} />
                  <ScoreBar label="Visual quality" value={result.judge?.visualQuality ?? 0} />
                  <ScoreBar label="Aesthetic" value={result.judge?.aestheticScore ?? 0} />
                  <ScoreBar label="Safety" value={result.judge?.safetyScore ?? 0} />
                </>
              ) : null}
            </div>
          </div>
          {totalMs > 0 ? (
            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 px-2.5 py-1.5 text-[10px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" /> Total
              </span>
              <span className="font-mono text-primary">{(totalMs / 1000).toFixed(1)}s</span>
            </div>
          ) : null}
          <div className="mt-auto grid grid-cols-2 gap-1.5">
            <button
              onClick={onRerun}
              className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <RotateCcw className="mr-1 inline h-3 w-3" /> Re-run
            </button>
            <button
              onClick={onGallery}
              className="rounded-lg border border-border/60 bg-background/40 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              Gallery →
            </button>
          </div>
        </div>
      </div>

      {/* Safety + Judge detail */}
      <div className="grid gap-4 md:grid-cols-2">
        {result.safety ? (
          <DetailCard title="ST3GG Safety Scan" icon={<ShieldMark />} tone={result.safety?.passed ? "ok" : "warn"}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-mono text-xs text-muted-foreground">Risk: {result.safety?.riskLevel ?? "unknown"}</span>
              <ScoreRing value={result.safety?.score ?? 0} size={48} />
            </div>
            <p className="text-xs text-muted-foreground">{result.safety?.rationale ?? "No rationale provided."}</p>
            {(result.safety?.flags?.length ?? 0) > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {result.safety!.flags!.map((f) => (
                  <span key={f} className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] text-amber-300">
                    {f}
                  </span>
                ))}
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-1 text-[10px] text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> No flags raised
              </div>
            )}
          </DetailCard>
        ) : null}

        {result.judge ? (
          <DetailCard
            title="Visual Judge Report"
            icon={<ScanEye className="h-4 w-4" />}
            tone={result.judge?.verdict === "approved" ? "ok" : result.judge?.verdict === "rejected" ? "bad" : "warn"}
          >
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <ScoreBar label="Wardrobe match" value={result.judge?.wardrobeMatch ?? 0} />
              <ScoreBar label="Prompt adherence" value={result.judge?.promptAdherence ?? 0} />
            </div>
            {(result.judge?.strengths?.length ?? 0) > 0 ? (
              <div className="mt-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-emerald-400">Strengths</div>
                <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                  {result.judge!.strengths!.map((s, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-emerald-400">+</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {(result.judge?.weaknesses?.length ?? 0) > 0 ? (
              <div className="mt-2">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-rose-400">Weaknesses</div>
                <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                  {result.judge!.weaknesses!.map((s, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="text-rose-400">−</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </DetailCard>
        ) : null}
      </div>

      {/* Structured evidence */}
      {result.evidence ? (
        <DetailCard
          title="Structured Evidence"
          icon={<FileJson className="h-4 w-4" />}
          action={
            <button
              onClick={() =>
                downloadFile(
                  `nexus-evidence-${result.id.slice(-8)}.json`,
                  JSON.stringify(result.evidence, null, 2),
                  "application/json"
                )
              }
              className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <Download className="h-3 w-3" /> Export
            </button>
          }
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={(result.evidence?.finalVerdict as string) ?? result.verdict ?? "unknown"} size="sm" />
            {typeof result.evidence?.confidence === "number" ? (
              <span className="font-mono text-[10px] text-muted-foreground">
                confidence {String(result.evidence.confidence)}
              </span>
            ) : null}
          </div>
          {typeof result.evidence?.summary === "string" ? (
            <p className="mb-3 text-sm text-foreground">{result.evidence.summary}</p>
          ) : null}
          {Array.isArray(result.evidence?.keyFindings) ? (
            <div className="mb-3">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Key Findings</div>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {result.evidence.keyFindings.map((f, i) => (
                  <li key={i}>• {String(f)}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <details className="rounded-lg border border-border/40 bg-background/40">
            <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Raw evidence JSON
            </summary>
            <pre className="nexus-scroll max-h-72 overflow-auto px-3 pb-3 text-[10px] leading-relaxed text-foreground/80">
{JSON.stringify(result.evidence, null, 2)}
            </pre>
          </details>
        </DetailCard>
      ) : null}

      {/* v4: OCR tool — extracts every text element from the generated image */}
      {result.imagePath ? <OcrTool imagePath={result.imagePath} /> : null}

      {/* M5: NO8D-Inpainting — mask-draw canvas + denoise + session history */}
      {result.status === "completed" && result.imagePath ? (
        <InpaintCard sourceImagePath={result.imagePath} />
      ) : null}

      {/* M5: NO8D-A/B preview — split-line comparison of two images */}
      {result.status === "completed" && result.imagePath ? (
        <ABPreviewCard currentImagePath={result.imagePath} />
      ) : null}

      {/* v3: Provenance — calibration + LoRA + maturity tier */}
      <ProvenanceCard result={result} />

      {/* M4: image-approval → video step-2 (I2V). Renders only when the still
          image is complete + on disk. The user can either click "Approve &
          Animate →" on the image above (which scrolls to this card) or click
          "Animate →" directly inside the card. */}
      {result.status === "completed" && result.imagePath ? (
        <VideoStepCard
          result={result}
          cardRef={videoCardRef}
          pulse={videoPulse}
          onApproved={() => setApproved(true)}
        />
      ) : null}
    </div>
  );
}

/**
 * VideoStepCard (M4) — image-approval → video step-2 flow.
 *
 * Rendered inside ResultPanel after the still image is generated + approved.
 * Lets the user pick a video engine, edit the motion prompt, choose a duration,
 * and POST to /api/video/run. The backend is intentionally a stub in this
 * sandbox (the Modal endpoint serves FLUX.2-klein-9B image only — no video GPU),
 * so the card gracefully surfaces the structured errorMessage in a rose callout
 * with a one-click link to Cost Lab.
 */
function VideoStepCard({
  result,
  cardRef,
  pulse,
  onApproved,
}: {
  result: RunResult;
  cardRef: React.RefObject<HTMLDivElement | null>;
  pulse: boolean;
  onApproved: () => void;
}) {
  const videoEngines = enginesByType("video");
  const [selectedEngineId, setSelectedEngineId] = useState<string>(
    DEFAULT_VIDEO_ENGINE_ID
  );
  const [durationSec, setDurationSec] = useState<number>(4);
  const [motionPrompt, setMotionPrompt] = useState<string>(
    `${result.prompt} cinematic motion, smooth camera pan`
  );
  const [videoResult, setVideoResult] = useState<{
    videoPath: string | null;
    errorMessage: string | null;
    loading: boolean;
  }>({ videoPath: null, errorMessage: null, loading: false });
  const abortRef = useRef<AbortController | null>(null);
  const setView = useNexus((s) => s.setView);

  const activeEngine = getEngine(selectedEngineId);

  // Re-seed the motion prompt when the underlying image prompt changes
  // (e.g. user re-runs with a new prompt and the same ResultPanel re-mounts).
  useEffect(() => {
    setMotionPrompt(`${result.prompt} cinematic motion, smooth camera pan`);
  }, [result.prompt]);

  // Cancel any in-flight video request when the card unmounts (e.g. user
  // starts a new image run while the previous video is still animating).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleAnimate = async () => {
    if (!result.imagePath || !motionPrompt.trim()) return;
    // Mark the image as approved for video step-2 (drives the ✓ Approved badge).
    onApproved();

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // Same 300s timeout pattern as the image pipeline run.
    const timer = setTimeout(() => ctrl.abort(), 300_000);

    setVideoResult({ videoPath: null, errorMessage: null, loading: true });

    try {
      const res = await fetch("/api/video/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceImagePath: result.imagePath,
          prompt: motionPrompt,
          engineId: selectedEngineId,
          durationSec,
        }),
        signal: ctrl.signal,
      });

      // CRITICAL: check content-type before parsing JSON — dev server crash returns HTML
      const videoContentType = res.headers.get("content-type") || "";
      if (!videoContentType.includes("application/json")) {
        const msg = res.status === 504
          ? "Gateway timed out. The video backend may be cold-starting (2-5 min). Try again in a minute."
          : `Unexpected response (HTTP ${res.status}). The video backend may be cold-starting or the dev server crashed.`;
        throw new Error(msg);
      }

      const data = (await res.json()) as {
        videoPath?: string | null;
        errorMessage?: string | null;
        error?: string;
      };

      if (!res.ok) {
        const errMsg =
          (typeof data.error === "string" && data.error) ||
          (typeof data.errorMessage === "string" && data.errorMessage) ||
          `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      setVideoResult({
        videoPath: data.videoPath ?? null,
        errorMessage: data.errorMessage ?? null,
        loading: false,
      });

      if (data.videoPath) {
        toast.success("Video generated", {
          description: `${activeEngine.shortName} · ${durationSec}s · backend OK`,
        });
      } else if (data.errorMessage) {
        toast.error("Video backend not available", {
          description: data.errorMessage.slice(0, 140),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const aborted =
        msg.toLowerCase().includes("abort") ||
        msg.toLowerCase().includes("timeout");
      const finalMsg = aborted
        ? "Animation timed out after 5 minutes. Modal video runs typically take 30-120s warm; cold starts can take several minutes."
        : msg;
      setVideoResult({
        videoPath: null,
        errorMessage: finalMsg,
        loading: false,
      });
      toast.error("Animation failed", {
        description: finalMsg.slice(0, 140),
      });
    } finally {
      clearTimeout(timer);
    }
  };

  const loading = videoResult.loading;
  const warmSec = Math.round(activeEngine.estWarmMs / 1000);

  return (
    <div
      ref={cardRef}
      className={cn(
        "nexus-card rounded-2xl p-4 transition-all duration-500 sm:p-6",
        pulse && "ring-2 ring-emerald-500/60 ring-offset-2 ring-offset-background"
      )}
    >
      {/* Header */}
      <div className="mb-3 flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary nexus-glow">
          <Film className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Step 2 · Animate this image
          </div>
          <div className="text-sm font-semibold text-foreground">
            Image-to-Video (I2V)
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-primary/40 text-primary"
        >
          <Video className="h-3 w-3" /> I2V
        </Badge>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Send the approved still to a video engine for image-to-video (I2V)
        generation. The image becomes the first frame of the output clip.
      </p>

      {/* Engine picker (radio chips) */}
      <div className="mb-4">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Video engine
        </div>
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto nexus-scroll pr-1">
          {videoEngines.map((eng) => {
            const selected = eng.id === selectedEngineId;
            const engWarmSec = Math.round(eng.estWarmMs / 1000);
            return (
              <button
                key={eng.id}
                type="button"
                onClick={() => setSelectedEngineId(eng.id)}
                aria-pressed={selected}
                title={eng.description}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {eng.shortName} · ~{engWarmSec}s warm
              </button>
            );
          })}
        </div>
      </div>

      {/* Motion prompt */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Motion prompt
          </span>
          <span className="font-mono text-[9px] text-muted-foreground/60">
            {motionPrompt.length} chars
          </span>
        </div>
        <Textarea
          value={motionPrompt}
          onChange={(e) => setMotionPrompt(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Describe the desired motion…"
          className="font-mono text-xs"
          disabled={loading}
        />
      </div>

      {/* Duration */}
      <div className="mb-4">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Duration
        </div>
        <Select
          value={String(durationSec)}
          onValueChange={(v) => setDurationSec(Number(v))}
          disabled={loading}
        >
          <SelectTrigger className="w-full sm:w-44" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2 seconds</SelectItem>
            <SelectItem value="4">4 seconds</SelectItem>
            <SelectItem value="6">6 seconds</SelectItem>
            <SelectItem value="10">10 seconds</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Animate button + warm estimate */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={handleAnimate}
          disabled={loading || !motionPrompt.trim() || !result.imagePath}
          className="gap-1.5"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Animating on {activeEngine.shortName}…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Animate →
            </>
          )}
        </Button>
        {!loading ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            ~{warmSec}s warm · 30-120s total · cold starts longer
          </span>
        ) : null}
      </div>

      {/* Loading hint */}
      {loading ? (
        <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[10px] leading-snug text-amber-200/90">
          Animating on <strong>{activeEngine.shortName}</strong>… this can take
          30-120s (cold starts longer). The page is still working — please don&apos;t
          close it.
        </div>
      ) : null}

      {/* Success result */}
      {!loading && videoResult.videoPath ? (
        <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Video ready · {activeEngine.shortName} · {durationSec}s
          </div>
          <video
            src={videoResult.videoPath}
            controls
            autoPlay
            loop
            muted
            playsInline
            className="w-full rounded-md border border-border/40 bg-black"
          >
            <track kind="captions" />
          </video>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <a
              href={videoResult.videoPath}
              download
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <Download className="h-3 w-3" /> Download MP4
            </a>
            <button
              type="button"
              onClick={() => setView("gallery")}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <Play className="h-3 w-3" /> Open in Gallery
            </button>
          </div>
        </div>
      ) : null}

      {/* Error result */}
      {!loading && videoResult.errorMessage && !videoResult.videoPath ? (
        <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3">
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-rose-300">
            <ShieldAlert className="h-3 w-3" /> Video not available
          </div>
          <p className="text-xs leading-relaxed text-rose-100/90">
            {videoResult.errorMessage}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setView("costlab")}
              className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-rose-200 transition hover:bg-rose-500/20"
            >
              <ExternalLink className="h-3 w-3" /> Deploy a video Modal app in Cost Lab
              <ArrowRight className="h-3 w-3" />
            </button>
            <a
              href={activeEngine.hfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> {activeEngine.shortName} weights
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * ProvenanceCard — surfaces the calibration preset, applied LoRAs and maturity
 * tier for a completed (or blocked) run. Lets the user audit exactly which
 * params produced an image — required for EU AI Act transparency obligations.
 */
function ProvenanceCard({ result }: { result: RunResult }) {
  // v4: pull the current store engine/brain for provenance display. Prefer the
  // engine recorded in the run's calibration; fall back to the store's current
  // engineId (the user may have switched engines after the run completed).
  const storeEngineId = useNexus((s) => s.engineId);
  const storeBrainId = useNexus((s) => s.brainId);
  const engine = getEngine(result.calibration?.engineId ?? storeEngineId);
  const brain = getBrain(storeBrainId);

  const hasLoras = result.loraIds.length > 0;
  const hasTier = !!result.maturityTier;
  // engine + brain are always available from the store, so the card always
  // renders (it shows the v4 engine + brain provenance even on a fresh run).

  return (
    <DetailCard title="Provenance" icon={<FileJson className="h-4 w-4" />}>
      {/* v4: Engine + Brain provenance strip */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
          <Cpu className="h-2.5 w-2.5" /> {engine.shortName}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground/60">{engine.family}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-300">
          <Brain className="h-2.5 w-2.5" /> {brain.shortName}
        </span>
        {brain.uncensored ? (
          <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/60">
            uncensored
          </span>
        ) : null}
      </div>

      {/* v4: Backend mismatch warning — the user selected an engine (e.g. Krea 2)
          but the Modal endpoint serves FLUX.2-klein-9B. Surface this clearly so
          they know the actual model used ≠ the selected one. */}
      {result.backendMismatch ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/8 p-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <div className="text-[10px] leading-relaxed text-amber-200/90">
            <span className="font-semibold text-amber-300">Backend mismatch:</span>{" "}
            You selected <span className="font-mono">{engine.name}</span> but the Modal
            endpoint currently serves FLUX.2-klein-9B. The generated image uses FLUX.2-klein-9B
            weights. Deploy the optimized app from{" "}
            <button
              onClick={() => useNexus.getState().setView("costlab")}
              className="underline decoration-dotted hover:text-amber-100"
            >
              Cost Lab
            </button>{" "}
            to serve {engine.name} on a right-sized GPU.
          </div>
        </div>
      ) : null}

      {/* v4: z-ai fallback warning — Modal was not used (MODAL_USE=false or Modal failed) */}
      {result.backend === "zai" ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/8 p-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
          <div className="text-[10px] leading-relaxed text-rose-200/90">
            <span className="font-semibold text-rose-300">z-ai fallback used:</span>{" "}
            This generation used the z-ai hosted SDK, not your Modal GPU. Set{" "}
            <code className="font-mono text-rose-100">MODAL_USE=true</code> in{" "}
            <code className="font-mono text-rose-100">.env</code> and ensure your Modal app
            is deployed. The z-ai fallback does not use your calibration steps/CFG/sampler
            as real diffusion params — it only injects quality tokens into the prompt.
          </div>
        </div>
      ) : null}

      {result.calibration ? (
        <div className="mb-3">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
              {getPreset(result.calibration.presetId).name}
            </span>
            <span className="font-mono text-[9px] text-muted-foreground">
              {result.calibration.model}
            </span>
            {result.calibration.appliedOverrides.length > 0 ? (
              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-300">
                {result.calibration.appliedOverrides.length} override(s)
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] sm:grid-cols-4">
            <span>
              <span className="text-muted-foreground/60">steps:</span>{" "}
              <span className="text-foreground">{result.calibration.steps}</span>
            </span>
            <span>
              <span className="text-muted-foreground/60">cfg:</span>{" "}
              <span className="text-foreground">{result.calibration.cfg.toFixed(1)}</span>
            </span>
            <span>
              <span className="text-muted-foreground/60">sampler:</span>{" "}
              <span className="text-foreground">{result.calibration.sampler}</span>
            </span>
            <span>
              <span className="text-muted-foreground/60">res:</span>{" "}
              <span className="text-foreground">{result.calibration.resolution}</span>
            </span>
          </div>
          {/* Seed provenance — shows the random seed used for THIS run. Because
              a new seed is generated per run, this number changes every time,
              confirming creative variation is active (different initial noise →
              different composition/pose/lighting). If two runs show the same
              seed, that would indicate a seed bug. */}
          {result.seed != null ? (
            <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px]">
              <span className="text-muted-foreground/60">seed:</span>
              <span className="text-emerald-300" title="Randomized per run — different every time">
                {result.seed.toLocaleString()}
              </span>
              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1 py-0.5 text-[8px] uppercase tracking-wider text-emerald-400">
                <Shuffle className="h-2.5 w-2.5" /> randomized
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasLoras ? (
        <div className="mb-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            LoRAs applied
          </div>
          <div className="flex flex-wrap gap-1">
            {result.loraIds.map((id) => {
              const l = getLora(id);
              const mature = l?.mature === true;
              return (
                <span
                  key={id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px]",
                    mature
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : "border-border/50 bg-background/40 text-foreground"
                  )}
                  title={l?.purpose ?? id}
                >
                  {l?.name ?? id}
                  {mature ? (
                    <span className="text-[8px] uppercase tracking-wider">18+</span>
                  ) : null}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      {hasTier ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Maturity tier:
          </span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
              result.maturityTier === "safe" && "bg-emerald-500/15 text-emerald-300",
              result.maturityTier === "mature" && "bg-amber-500/15 text-amber-300",
              result.maturityTier === "blocked" && "bg-rose-500/15 text-rose-300"
            )}
          >
            {result.maturityTier}
          </span>
        </div>
      ) : null}
    </DetailCard>
  );
}

function DetailCard({
  title,
  icon,
  children,
  tone = "neutral",
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "ok" | "warn" | "bad" | "neutral";
  action?: React.ReactNode;
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-500/30"
      : tone === "warn"
        ? "border-amber-500/30"
        : tone === "bad"
          ? "border-rose-500/30"
          : "border-border/60";
  return (
    <div className={cn("nexus-card rounded-2xl p-4", toneCls)}>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </h4>
        {action}
      </div>
      {children}
    </div>
  );
}

/**
 * CalibrationPanel — FLUX.2 calibration preset picker + advanced overrides.
 * Renders the 6 presets as a horizontal chip row, shows a compact key/value
 * grid for the active preset, and exposes steps/cfg/denoise/loraWeight
 * sliders in a collapsible "Advanced overrides" section.
 */
function CalibrationPanel() {
  const {
    calibrationId,
    setCalibration,
    calibrationOverrides,
    setCalibrationOverride,
    clearCalibrationOverrides,
  } = useNexus();
  const preset = getPreset(calibrationId);
  const [advOpen, setAdvOpen] = useState(false);

  // Effective values: preset base, optionally overridden.
  const steps = (calibrationOverrides.steps as number | undefined) ?? preset.steps;
  const cfg = (calibrationOverrides.cfg as number | undefined) ?? preset.cfg;
  const denoise = (calibrationOverrides.denoise as number | undefined) ?? preset.denoise;
  const loraWeight =
    (calibrationOverrides.loraWeight as number | undefined) ?? preset.loraWeight;

  // Has the user diverged from the preset base on any of the slider keys?
  const modifiedKeys = (["steps", "cfg", "denoise", "loraWeight"] as const).filter((k) => {
    const v = calibrationOverrides[k];
    return typeof v === "number" && v !== preset[k];
  });
  const modified = modifiedKeys.length > 0;

  return (
    <div className="nexus-card rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <Cpu className="h-3.5 w-3.5 text-primary" /> FLUX Calibration
        </span>
        {modified ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-300">
            <AlertTriangle className="h-2.5 w-2.5" /> modified
          </span>
        ) : null}
      </div>

      {/* Preset chips — horizontal scroll on narrow screens */}
      <div className="mt-2 flex gap-1.5 overflow-x-auto nexus-scroll pb-1.5">
        {CALIBRATION_PRESETS.map((p) => {
          const active = p.id === calibrationId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setCalibration(p.id)}
              className={cn(
                "nexus-chip nexus-card-hover shrink-0 rounded-md border px-2 py-1 text-left transition",
                active
                  ? "nexus-chip-active"
                  : "border-border/50 bg-background/40 hover:border-primary/30"
              )}
            >
              <div className="text-[11px] font-medium leading-tight">{p.name}</div>
              <div className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground/70">
                {p.tag}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active preset detail */}
      <div className="mt-2 rounded-lg border border-border/40 bg-background/30 p-2.5">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary">
            {presetCategoryLabel(preset.category)}
          </span>
          <span className="font-mono text-[9px] text-muted-foreground/70">{preset.model}</span>
          <span className="font-mono text-[9px] text-muted-foreground/60">
            · ~{(preset.estWarmMs / 1000).toFixed(1)}s warm
          </span>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{preset.description}</p>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[10px] sm:grid-cols-3">
          <KV k="steps" v={String(steps)} highlight={modifiedKeys.includes("steps")} />
          <KV k="cfg" v={cfg.toFixed(1)} highlight={modifiedKeys.includes("cfg")} />
          <KV k="sampler" v={preset.sampler} />
          <KV k="scheduler" v={preset.scheduler} />
          <KV k="denoise" v={denoise.toFixed(2)} highlight={modifiedKeys.includes("denoise")} />
          <KV k="resolution" v={preset.resolution} />
          <KV k="loraWeight" v={loraWeight.toFixed(2)} highlight={modifiedKeys.includes("loraWeight")} />
          <KV k="refinerPass" v={preset.refinerPass ? "yes" : "no"} />
          <KV k="estWarmMs" v={`${preset.estWarmMs}ms`} />
        </div>
      </div>

      {/* Advanced overrides */}
      <Collapsible open={advOpen} onOpenChange={setAdvOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-between rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              <Sliders className="h-3 w-3" /> Advanced overrides
            </span>
            <ChevronRight className={cn("h-3 w-3 transition", advOpen && "rotate-90")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2.5">
          <SliderRow
            label="steps"
            min={1}
            max={40}
            step={1}
            value={steps}
            onChange={(v) => setCalibrationOverride("steps", v)}
            display={String(steps)}
          />
          <SliderRow
            label="cfg"
            min={1}
            max={20}
            step={0.5}
            value={cfg}
            onChange={(v) => setCalibrationOverride("cfg", v)}
            display={cfg.toFixed(1)}
          />
          <SliderRow
            label="denoise"
            min={0}
            max={1}
            step={0.05}
            value={denoise}
            onChange={(v) => setCalibrationOverride("denoise", v)}
            display={denoise.toFixed(2)}
          />
          <SliderRow
            label="loraWeight"
            min={0}
            max={1}
            step={0.05}
            value={loraWeight}
            onChange={(v) => setCalibrationOverride("loraWeight", v)}
            display={loraWeight.toFixed(2)}
          />
          {modified ? (
            <button
              type="button"
              onClick={() => clearCalibrationOverrides()}
              className="flex w-full items-center justify-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-300 transition hover:bg-amber-500/20"
            >
              <RotateCcw className="h-3 w-3" /> Reset to preset
            </button>
          ) : (
            <p className="text-center font-mono text-[9px] text-muted-foreground/50">
              All values at preset base
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>

      <p className="mt-2 text-[9px] leading-snug text-muted-foreground/60">
        Modal L40S backend receives steps/cfg/sampler as real params. The z-ai
        fallback injects qualityTokens into the prompt (steps/cfg recorded as
        provenance).
      </p>
    </div>
  );
}

function KV({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-1">
      <span className={cn("text-muted-foreground/60", highlight && "text-amber-300")}>{k}</span>
      <span className={cn("text-foreground", highlight && "text-amber-200")}>{v}</span>
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  display,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  display: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between font-mono text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground">{display}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
        className="cursor-pointer"
      />
    </div>
  );
}

/**
 * LoraStack — M5 NO8D-LoRA-stack equivalent.
 *
 * Shows the currently applied LoRAs with per-LoRA:
 *   • weight slider (0..1, step 0.05) bound to setLoraWeight
 *   • enable/disable Switch bound to toggleLoraEnabled
 *   • "Reset to recommended" button (sets weight back to recommendedWeight)
 *   • remove button (X)
 *
 * Disabled LoRAs render struck-through + reduced opacity. The header still
 * shows the global calibration `loraWeight` (now purely informational — it's
 * only used as the default for newly-applied LoRAs that have no
 * recommendedWeight; in practice every curated LoRA has one).
 */
function LoraStack() {
  const {
    loraIds,
    loraWeights,
    loraEnabled,
    toggleLora,
    clearLoras,
    setLoraWeight,
    toggleLoraEnabled,
    resetLoraWeight,
    calibrationId,
    matureUnlocked,
    setView,
  } = useNexus();
  const preset = getPreset(calibrationId);
  const unlocked = matureUnlocked();
  const loras: LoraEntry[] = loraIds
    .map((id) => getLora(id))
    .filter((l): l is LoraEntry => !!l);
  const hasMatureBlocked = loras.some((l) => l.mature && !unlocked);

  const activeCount = loraIds.filter((id) => loraEnabled[id] !== false).length;

  return (
    <div className="nexus-card rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <Layers className="h-3.5 w-3.5 text-primary" /> LoRA Stack
          <Sliders className="h-3 w-3 text-primary/70" />
        </span>
        <span className="font-mono text-[9px] text-muted-foreground/60">
          default w: <span className="text-foreground">{preset.loraWeight.toFixed(2)}</span> ·{" "}
          {activeCount}/{loras.length} active
        </span>
      </div>

      {hasMatureBlocked ? (
        <div className="mb-2 flex items-start gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[10px] leading-snug text-rose-300">
          <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            A mature LoRA is selected but mature mode is locked. This run will be blocked.
          </span>
        </div>
      ) : null}

      {loras.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/40 px-3 py-3 text-center text-[11px] text-muted-foreground">
          No LoRAs applied — generation uses the base FLUX model only.
        </div>
      ) : (
        <ul className="max-h-80 space-y-1.5 overflow-y-auto nexus-scroll pr-0.5">
          {loras.map((l) => {
            const matureFlagged = l.mature && !unlocked;
            const weight =
              typeof loraWeights[l.id] === "number"
                ? loraWeights[l.id]
                : l.recommendedWeight;
            const enabled = loraEnabled[l.id] !== false;
            return (
              <li
                key={l.id}
                className={cn(
                  "rounded-md border px-2 py-1.5 transition",
                  matureFlagged
                    ? "border-rose-500/40 bg-rose-500/5"
                    : "border-border/40 bg-background/30 hover:border-primary/30",
                  !enabled && "opacity-55"
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span
                        className={cn(
                          "truncate text-[11px] font-medium text-foreground",
                          !enabled && "line-through decoration-muted-foreground/60"
                        )}
                      >
                        {l.name}
                      </span>
                      {matureFlagged ? (
                        <ShieldAlert className="h-3 w-3 shrink-0 text-rose-400" />
                      ) : null}
                      {!enabled ? (
                        <span className="rounded bg-muted/40 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                          off
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
                      <span className="rounded bg-foreground/10 px-1 py-0.5 uppercase tracking-wider">
                        {l.category}
                      </span>
                      <span className="truncate">
                        {l.engineFamilies.length > 0 ? l.engineFamilies.join(" · ") : "Universal"}
                      </span>
                      <span>
                        · rec:{" "}
                        <span className="text-foreground">{l.recommendedWeight.toFixed(2)}</span>
                      </span>
                    </div>
                  </div>
                  {/* Enable/disable toggle (NO8D per-LoRA enable) */}
                  <Switch
                    checked={enabled}
                    onCheckedChange={() => toggleLoraEnabled(l.id)}
                    aria-label={`Toggle ${l.name}`}
                    title={enabled ? "Disable LoRA" : "Enable LoRA"}
                  />
                  <button
                    type="button"
                    onClick={() => toggleLora(l.id)}
                    className="shrink-0 rounded p-1 text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-300"
                    title={`Remove ${l.name}`}
                    aria-label={`Remove ${l.name}`}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
                {/* Per-LoRA weight slider row (NO8D per-LoRA weight) */}
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                    weight
                  </span>
                  <Slider
                    value={[weight]}
                    onValueChange={(v) => setLoraWeight(l.id, v[0] ?? 0)}
                    min={0}
                    max={1}
                    step={0.05}
                    disabled={!enabled}
                    className="flex-1"
                    aria-label={`${l.name} weight`}
                  />
                  <span
                    className={cn(
                      "w-9 shrink-0 text-right font-mono text-[10px]",
                      Math.abs(weight - l.recommendedWeight) > 0.001
                        ? "text-amber-300"
                        : "text-foreground"
                    )}
                  >
                    {weight.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => resetLoraWeight(l.id)}
                    disabled={!enabled || Math.abs(weight - l.recommendedWeight) < 0.001}
                    className="shrink-0 rounded p-1 text-muted-foreground transition hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                    title={`Reset to recommended (${l.recommendedWeight.toFixed(2)})`}
                    aria-label={`Reset ${l.name} weight to recommended`}
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-2.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => setView("library")}
          className="nexus-chip flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border/50 bg-background/40 px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Add LoRA
        </button>
        {loras.length > 0 ? (
          <button
            type="button"
            onClick={() => clearLoras()}
            className="flex items-center justify-center gap-1 rounded-md border border-border/50 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-300"
            title="Remove all applied LoRAs"
          >
            <XCircle className="h-3 w-3" /> Clear all
          </button>
        ) : null}
      </div>

      <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground/60">
        Per-LoRA weight + enable/disable · default from preset · reset to recommended per row.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// M5 — NO8D-style control system. Our own implementation inspired by NO8D's
// ComfyUI-Controls architecture (https://github.com/no8d/ComfyUI-NO8D-controls)
// but built for the web app, NOT ComfyUI. Three card components below:
//   1. InpaintCard — mask-draw canvas + denoise + session history
//   2. ABPreviewCard — draggable split-line image comparison
//   3. PromptPlusCard — LLM prompt expansion + image→prompt reverse
// ─────────────────────────────────────────────────────────────────────────────

/**
 * InpaintCard — M5 NO8D-Inpainting equivalent.
 *
 * Canvas-based mask-drawing tool overlaid on the generated image:
 *   • Brush size + feather sliders, semi-transparent rose mask color
 *   • Clear mask + Invert mask buttons
 *   • Denoise strength slider (0.1-1.0, default 0.75)
 *   • Inpaint prompt textarea
 *   • "Run inpaint →" button → POST /api/inpaint/run
 *   • Side-by-side comparison (original + result OR error callout)
 *   • Session history strip — thumbnails of previous bases; click to set as new base
 *
 * Backend is a stub (no inpaint GPU in this sandbox). The endpoint returns
 * { imagePath: null, errorMessage: "..." } and the UI renders a clear rose
 * callout. Once MODAL_INPAINT_BASE_URL is set, the same UI works end-to-end.
 */
function InpaintCard({ sourceImagePath }: { sourceImagePath: string }) {
  const [brushSize, setBrushSize] = useState(40);
  const [feather, setFeather] = useState(0.4);
  const [denoise, setDenoise] = useState(0.75);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    imagePath: string | null;
    errorMessage: string | null;
  } | null>(null);
  // Session history: image paths the user has worked with. The first entry is
  // always the original source. Successful inpaint results prepend to the list.
  const [history, setHistory] = useState<string[]>([sourceImagePath]);
  const [baseImage, setBaseImage] = useState<string>(sourceImagePath);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // Reset everything when the underlying source image changes (new run).
  useEffect(() => {
    setBaseImage(sourceImagePath);
    setHistory([sourceImagePath]);
    setResult(null);
    setPrompt("");
  }, [sourceImagePath]);

  // Clear the mask canvas whenever the base image changes (after the new
  // image loads + the canvas is resized in onImageLoad).
  useEffect(() => {
    const id = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, 50);
    return () => window.clearTimeout(id);
  }, [baseImage]);

  const onImageLoad = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    // Cap the canvas internal resolution at 1024px on the long edge so the
    // mask data URL stays reasonable in size.
    const maxDim = 1024;
    const scale = Math.min(
      1,
      maxDim / Math.max(img.naturalWidth || maxDim, img.naturalHeight || maxDim)
    );
    canvas.width = Math.max(1, Math.round((img.naturalWidth || maxDim) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || maxDim) * scale));
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const drawStroke = (
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const color = "rgba(244, 63, 94, 0.45)"; // rose-500 at 45% alpha
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;
    // Feather via shadowBlur — scales with brush size + feather slider.
    ctx.shadowBlur = brushSize * feather * 0.5;
    ctx.shadowColor = color;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    // Fill a circle at the endpoint so a single tap leaves a visible dot.
    ctx.beginPath();
    ctx.arc(to.x, to.y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const pos = getCanvasPos(e);
    lastPosRef.current = pos;
    drawStroke(pos, pos);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    if (lastPosRef.current) {
      drawStroke(lastPosRef.current, pos);
    }
    lastPosRef.current = pos;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastPosRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore — pointer may already be released
    }
  };

  const clearMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const invertMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      const newA = 255 - a;
      data[i + 3] = newA;
      // Force the RGB channels to rose where any alpha remains, so the
      // inverted mask still reads as the same rose color.
      if (newA > 0) {
        data[i] = 244;
        data[i + 1] = 63;
        data[i + 2] = 94;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  const runInpaint = async () => {
    if (!prompt.trim()) {
      toast.error("Inpaint prompt is empty — describe the edit you want.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Verify the user actually drew something — empty mask → clear error.
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hasMask = false;
    for (let i = 3; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 0) {
        hasMask = true;
        break;
      }
    }
    if (!hasMask) {
      toast.error("Draw a mask over the area to inpaint first.");
      return;
    }

    const maskDataUrl = canvas.toDataURL("image/png");
    setRunning(true);
    setResult(null);

    try {
      const res = await fetch("/api/inpaint/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceImagePath: baseImage,
          maskDataUrl,
          prompt: prompt.trim(),
          denoise,
        }),
      });
      const data = (await res.json()) as {
        imagePath?: string | null;
        errorMessage?: string | null;
        error?: string;
      };
      if (!res.ok) {
        const msg =
          (typeof data.error === "string" && data.error) ||
          (typeof data.errorMessage === "string" && data.errorMessage) ||
          `HTTP ${res.status}`;
        setResult({ imagePath: null, errorMessage: msg });
        toast.error("Inpaint failed", { description: msg.slice(0, 140) });
        return;
      }
      setResult({
        imagePath: data.imagePath ?? null,
        errorMessage: data.errorMessage ?? null,
      });
      if (data.imagePath) {
        toast.success("Inpaint complete");
        setHistory((h) => [data.imagePath as string, ...h].slice(0, 8));
      } else if (data.errorMessage) {
        toast.error("Inpaint backend not available", {
          description: data.errorMessage.slice(0, 140),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ imagePath: null, errorMessage: msg });
      toast.error("Inpaint failed", { description: msg.slice(0, 140) });
    } finally {
      setRunning(false);
    }
  };

  const pickFromHistory = (imgPath: string) => {
    if (imgPath === baseImage) return;
    setBaseImage(imgPath);
    setResult(null);
    setPrompt("");
    // The useEffect on [baseImage] clears the canvas after the image loads.
  };

  return (
    <div className="nexus-card rounded-2xl p-4 sm:p-6">
      {/* Header */}
      <div className="mb-3 flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-rose-400 nexus-glow">
          <Brush className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            NO8D · Inpainting
          </div>
          <div className="text-sm font-semibold text-foreground">
            Mask &amp; redraw a region
          </div>
        </div>
        <Badge variant="outline" className="border-rose-500/40 text-rose-300">
          <Brush className="h-3 w-3" /> mask
        </Badge>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Brush a mask over the area to redraw, describe the change, and run inpaint.
        The mask + prompt are sent to the inpaint backend — when no GPU is deployed
        you&apos;ll see a clear &quot;not yet deployed&quot; message.
      </p>

      {/* Canvas + image overlay */}
      <div className="relative overflow-hidden rounded-lg border border-border/40 bg-black/40">
        <img
          ref={imageRef}
          src={baseImage}
          alt="inpaint base"
          onLoad={onImageLoad}
          className="block w-full select-none"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
          style={{ backgroundImage: "none" }}
        />
        {/* Brush size cursor hint — top-right */}
        <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-rose-200 backdrop-blur-sm">
          brush {brushSize}px · feather {feather.toFixed(2)}
        </div>
      </div>

      {/* Brush controls */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Brush size</span>
            <span className="text-foreground">{brushSize}px</span>
          </label>
          <Slider
            value={[brushSize]}
            onValueChange={(v) => setBrushSize(v[0] ?? 40)}
            min={10}
            max={100}
            step={1}
          />
        </div>
        <div>
          <label className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Feather</span>
            <span className="text-foreground">{feather.toFixed(2)}</span>
          </label>
          <Slider
            value={[feather]}
            onValueChange={(v) => setFeather(v[0] ?? 0.4)}
            min={0}
            max={1}
            step={0.05}
          />
        </div>
      </div>

      {/* Mask actions */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={clearMask}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-300"
        >
          <Eraser className="h-3 w-3" /> Clear mask
        </button>
        <button
          type="button"
          onClick={invertMask}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <FlipHorizontal2 className="h-3 w-3" /> Invert mask
        </button>
      </div>

      {/* Denoise + prompt */}
      <div className="mt-4">
        <label className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Denoise strength</span>
          <span className="text-foreground">{denoise.toFixed(2)}</span>
        </label>
        <Slider
          value={[denoise]}
          onValueChange={(v) => setDenoise(v[0] ?? 0.75)}
          min={0.1}
          max={1}
          step={0.05}
        />
      </div>

      <div className="mt-3">
        <label className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Inpaint prompt</span>
          <span className="font-mono text-[9px] text-muted-foreground/60">
            {prompt.length}/2000
          </span>
        </label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
          rows={2}
          placeholder="e.g. change the coat to red velvet"
          className="text-xs"
          disabled={running}
        />
      </div>

      {/* Run button */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={runInpaint}
          disabled={running || !prompt.trim()}
          className="gap-1.5"
        >
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Inpainting…
            </>
          ) : (
            <>
              <Brush className="h-3.5 w-3.5" />
              Run inpaint →
            </>
          )}
        </Button>
        <span className="font-mono text-[10px] text-muted-foreground">
          mask + prompt sent to /api/inpaint/run
        </span>
      </div>

      {/* Result / error */}
      {result ? (
        <div className="mt-4">
          {result.imagePath ? (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Inpaint result
              </div>
              <div className="grid grid-cols-2 gap-2">
                <figure>
                  <img
                    src={baseImage}
                    alt="before"
                    className="aspect-square w-full rounded-md border border-border/40 object-cover"
                  />
                  <figcaption className="mt-1 text-center font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    before
                  </figcaption>
                </figure>
                <figure>
                  <img
                    src={result.imagePath}
                    alt="after"
                    className="aspect-square w-full rounded-md border border-emerald-500/40 object-cover"
                  />
                  <figcaption className="mt-1 text-center font-mono text-[9px] uppercase tracking-wider text-emerald-300">
                    after
                  </figcaption>
                </figure>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3">
              <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-rose-300">
                <ShieldAlert className="h-3 w-3" /> Inpaint backend not available
              </div>
              <p className="text-xs leading-relaxed text-rose-100/90">
                {result.errorMessage}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* Session history strip */}
      <div className="mt-4">
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Session history · click to set as new base
        </div>
        {history.length > 0 ? (
          <div className="flex gap-1.5 overflow-x-auto nexus-scroll pb-1">
            {history.map((h, i) => {
              const active = h === baseImage;
              return (
                <button
                  key={`${h}-${i}`}
                  type="button"
                  onClick={() => pickFromHistory(h)}
                  className={cn(
                    "relative h-14 w-14 shrink-0 overflow-hidden rounded-md border transition",
                    active
                      ? "border-rose-500/60 ring-2 ring-rose-500/40"
                      : "border-border/50 hover:border-primary/40"
                  )}
                  title={i === 0 ? "Original source" : `Inpaint result ${i}`}
                >
                  <img
                    src={h}
                    alt={i === 0 ? "source" : `result ${i}`}
                    className="h-full w-full object-cover"
                  />
                  {i === 0 ? (
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-0.5 py-0.5 text-center font-mono text-[8px] uppercase tracking-wider text-rose-200">
                      src
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/40 px-3 py-2 text-center text-[10px] text-muted-foreground">
            No history yet
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ABPreviewCard — M5 NO8D-A/B preview equivalent.
 *
 * Draggable vertical split-line comparison of two images:
 *   • Image A (default = current result) on the left of the line
 *   • Image B (default = null, picked from gallery) on the right
 *   • Drag the handle to move the split
 *   • "Swap A/B" swaps the two images
 *   • "Pick from Gallery" opens a thumbnail picker (fetches /api/gallery?limit=12)
 *
 * Pure client-side — no backend needed.
 */
function ABPreviewCard({ currentImagePath }: { currentImagePath: string }) {
  const [imageA, setImageA] = useState<string>(currentImagePath);
  const [imageB, setImageB] = useState<string | null>(null);
  const [split, setSplit] = useState(50); // 0..100 (percent)
  const [pickerOpen, setPickerOpen] = useState(false);
  const [gallery, setGallery] = useState<
    Array<{ id: string; imagePath: string; prompt: string }>
  >([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  // Which slot (A or B) the picker is targeting.
  const [pickerTarget, setPickerTarget] = useState<"A" | "B">("B");

  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Sync A with the current image when a new run completes.
  useEffect(() => {
    setImageA(currentImagePath);
  }, [currentImagePath]);

  const fetchGallery = useCallback(async () => {
    setGalleryLoading(true);
    try {
      const res = await fetch("/api/gallery?limit=12", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        items?: Array<{
          id: string;
          imagePath: string | null;
          prompt: string;
        }>;
      };
      setGallery(
        (data.items ?? []).filter((it): it is { id: string; imagePath: string; prompt: string } =>
          !!it.imagePath
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Could not load gallery", { description: msg.slice(0, 140) });
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  const openPicker = (target: "A" | "B") => {
    setPickerTarget(target);
    setPickerOpen(true);
    if (gallery.length === 0) {
      void fetchGallery();
    }
  };

  const pickImage = (imgPath: string) => {
    if (pickerTarget === "A") {
      setImageA(imgPath);
    } else {
      setImageB(imgPath);
    }
    setPickerOpen(false);
  };

  const swap = () => {
    if (!imageB) {
      toast.info("Pick an image B first to swap.");
      return;
    }
    const a = imageA;
    setImageA(imageB);
    setImageB(a);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
    setSplit(Math.max(0, Math.min(100, pct)));
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = true;
    // Move the split immediately to the click position.
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100;
      setSplit(Math.max(0, Math.min(100, pct)));
    }
  };

  const endDrag = () => {
    draggingRef.current = false;
  };

  // No B picked yet — show a "pick an image B" prompt.
  if (!imageB) {
    return (
      <div className="nexus-card rounded-2xl p-4 sm:p-6">
        <div className="mb-3 flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-500/15 text-teal-300 nexus-glow">
            <GitCompareArrows className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              NO8D · A/B preview
            </div>
            <div className="text-sm font-semibold text-foreground">
              Split-line comparison
            </div>
          </div>
          <Badge variant="outline" className="border-teal-500/40 text-teal-300">
            <GitCompareArrows className="h-3 w-3" /> A/B
          </Badge>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Pick a second image to compare side-by-side with the current result.
          Drag the vertical split line to compare any region.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <figure className="overflow-hidden rounded-lg border border-border/40">
            <img
              src={imageA}
              alt="A"
              className="aspect-square w-full object-cover"
            />
            <figcaption className="bg-background/40 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              A · current result
            </figcaption>
          </figure>
          <button
            type="button"
            onClick={() => openPicker("B")}
            className="grid aspect-square w-full place-items-center rounded-lg border border-dashed border-border/50 bg-background/30 text-center transition hover:border-teal-500/40 hover:text-teal-300"
          >
            <div>
              <Plus className="mx-auto h-6 w-6 text-muted-foreground" />
              <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Pick image B
              </div>
              <div className="mt-0.5 text-[9px] text-muted-foreground/60">
                from gallery
              </div>
            </div>
          </button>
        </div>

        {pickerOpen ? (
          <GalleryPicker
            loading={galleryLoading}
            items={gallery}
            onPick={pickImage}
            onClose={() => setPickerOpen(false)}
            target={pickerTarget}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="nexus-card rounded-2xl p-4 sm:p-6">
      <div className="mb-3 flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-500/15 text-teal-300 nexus-glow">
          <GitCompareArrows className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            NO8D · A/B preview
          </div>
          <div className="text-sm font-semibold text-foreground">
            Split-line comparison · drag the handle
          </div>
        </div>
        <Badge variant="outline" className="border-teal-500/40 text-teal-300">
          <GitCompareArrows className="h-3 w-3" /> A/B
        </Badge>
      </div>

      {/* Split comparison */}
      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        className="relative select-none overflow-hidden rounded-lg border border-border/40 bg-black/40"
        style={{ aspectRatio: "1 / 1" }}
      >
        {/* Image B is the base (always rendered full). */}
        <img
          src={imageB}
          alt="B"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        {/* Image A on top, clipped to show only its left portion (0..split%). */}
        <img
          src={imageA}
          alt="A"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          draggable={false}
          style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
        />
        {/* Labels */}
        <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-teal-200 backdrop-blur-sm">
          A
        </div>
        <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-rose-200 backdrop-blur-sm">
          B
        </div>
        {/* Split line + handle */}
        <div
          className="absolute top-0 bottom-0 z-10 w-0.5 bg-white/80 shadow-[0_0_8px_rgba(0,0,0,0.6)]"
          style={{ left: `${split}%`, transform: "translateX(-50%)" }}
        >
          <div
            onPointerDown={startDrag}
            className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80"
            role="slider"
            aria-label="A/B split position"
            aria-valuenow={Math.round(split)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <ArrowLeftRight className="h-4 w-4" />
          </div>
        </div>
        {/* Click anywhere on the container to move the split (in addition to
            dragging the handle). */}
        <div
          onPointerDown={startDrag}
          className="absolute inset-0 z-0 cursor-ew-resize"
        />
      </div>

      {/* Controls */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={swap}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-teal-500/40 hover:text-teal-300"
        >
          <ArrowLeftRight className="h-3 w-3" /> Swap A/B
        </button>
        <button
          type="button"
          onClick={() => openPicker("A")}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <ImageIcon className="h-3 w-3" /> Pick A from gallery
        </button>
        <button
          type="button"
          onClick={() => openPicker("B")}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <ImageIcon className="h-3 w-3" /> Pick B from gallery
        </button>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          split: {Math.round(split)}%
        </span>
      </div>

      {pickerOpen ? (
        <GalleryPicker
          loading={galleryLoading}
          items={gallery}
          onPick={pickImage}
          onClose={() => setPickerOpen(false)}
          target={pickerTarget}
        />
      ) : null}
    </div>
  );
}

/**
 * GalleryPicker — small thumbnail grid shown when the user picks an image for
 * the A/B preview. Fetches /api/gallery?limit=12 if the parent hasn't already.
 */
function GalleryPicker({
  loading,
  items,
  onPick,
  onClose,
  target,
}: {
  loading: boolean;
  items: Array<{ id: string; imagePath: string; prompt: string }>;
  onPick: (imgPath: string) => void;
  onClose: () => void;
  target: "A" | "B";
}) {
  return (
    <div className="mt-3 rounded-lg border border-border/50 bg-background/40 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Pick image {target} · gallery
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground transition hover:text-foreground"
          aria-label="Close picker"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center gap-1.5 py-6 font-mono text-[10px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading gallery…
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/40 px-3 py-3 text-center text-[10px] text-muted-foreground">
          No gallery images yet — generate some first.
        </div>
      ) : (
        <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto nexus-scroll sm:grid-cols-4">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onPick(it.imagePath as string)}
              title={it.prompt}
              className="group relative aspect-square overflow-hidden rounded-md border border-border/50 transition hover:border-primary/50"
            >
              <img
                src={it.imagePath as string}
                alt={it.prompt}
                className="h-full w-full object-cover transition group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * PromptPlusCard — M5 NO8D-Prompt-plus equivalent.
 *
 * Two modes, toggled by a tab:
 *   • Expand — text→prompt via /api/prompt/enhance
 *   • Reverse — image→prompt via /api/prompt/reverse
 *
 * Both modes show the AI-generated result in an EDITABLE textarea (NO8D "auto
 * off" pattern — the user reviews before sending). A "Send to Studio" button
 * loads the edited prompt into the main prompt input.
 */
function PromptPlusCard() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"expand" | "reverse">("expand");

  // Expand mode state
  const setPrompt = useNexus((s) => s.setPrompt);
  const currentPrompt = useNexus((s) => s.prompt);
  const [expandIdea, setExpandIdea] = useState("");
  const [extraRules, setExtraRules] = useState("");
  const [expandResult, setExpandResult] = useState("");
  const [expandLoading, setExpandLoading] = useState(false);

  // Reverse mode state
  const [reverseImagePath, setReverseImagePath] = useState<string | null>(null);
  const [reverseImageDataUrl, setReverseImageDataUrl] = useState<string | null>(null);
  const [reverseResult, setReverseResult] = useState("");
  const [reverseLoading, setReverseLoading] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [gallery, setGallery] = useState<
    Array<{ id: string; imagePath: string; prompt: string }>
  >([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEnhance = async () => {
    const idea = expandIdea.trim();
    if (!idea) {
      toast.error("Enter a rough idea first.");
      return;
    }
    setExpandLoading(true);
    setExpandResult("");
    try {
      const res = await fetch("/api/prompt/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: idea,
          extraRules: extraRules.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { enhanced?: string; error?: string };
      if (!res.ok || !data.enhanced) {
        const msg = data.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setExpandResult(data.enhanced);
      toast.success("Prompt enhanced — review then send to Studio.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Enhance failed", { description: msg.slice(0, 140) });
    } finally {
      setExpandLoading(false);
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please pick an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === "string" ? reader.result : null;
      setReverseImageDataUrl(url);
      setReverseImagePath(null);
      setReverseResult("");
    };
    reader.readAsDataURL(file);
  };

  const fetchGallery = useCallback(async () => {
    setGalleryLoading(true);
    try {
      const res = await fetch("/api/gallery?limit=12", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        items?: Array<{
          id: string;
          imagePath: string | null;
          prompt: string;
        }>;
      };
      setGallery(
        (data.items ?? []).filter(
          (it): it is { id: string; imagePath: string; prompt: string } =>
            !!it.imagePath
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Could not load gallery", { description: msg.slice(0, 140) });
    } finally {
      setGalleryLoading(false);
    }
  }, []);

  const handleReverse = async () => {
    if (!reverseImagePath && !reverseImageDataUrl) {
      toast.error("Pick or upload an image first.");
      return;
    }
    setReverseLoading(true);
    setReverseResult("");
    try {
      const res = await fetch("/api/prompt/reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reverseImagePath
            ? { imagePath: reverseImagePath }
            : { imageDataUrl: reverseImageDataUrl }
        ),
      });
      const data = (await res.json()) as { prompt?: string; error?: string };
      if (!res.ok || !data.prompt) {
        const msg = data.error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setReverseResult(data.prompt);
      toast.success("Prompt reverse-engineered — review then send to Studio.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Reverse-engineer failed", { description: msg.slice(0, 140) });
    } finally {
      setReverseLoading(false);
    }
  };

  const sendToStudio = (text: string) => {
    if (!text.trim()) {
      toast.error("Nothing to send — generate a prompt first.");
      return;
    }
    setPrompt(text.trim());
    toast.success("Loaded into Studio prompt");
    setOpen(false);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="nexus-card rounded-2xl p-4">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between"
            aria-expanded={open}
          >
            <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <Wand className="h-3.5 w-3.5 text-amber-400" /> Prompt+
              <Badge
                variant="outline"
                className="ml-1 border-amber-500/40 bg-amber-500/10 text-[9px] text-amber-300"
              >
                NO8D
              </Badge>
            </span>
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition",
                open && "rotate-90"
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <p className="mb-3 mt-2 text-[11px] leading-snug text-muted-foreground">
            LLM prompt expansion + image→prompt reverse engineering. Results are
            editable before sending — the NO8D &quot;auto off&quot; pattern.
          </p>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "expand" | "reverse")}>
            <TabsList className="mb-3 h-8 w-full">
              <TabsTrigger value="expand" className="gap-1 text-[10px]">
                <Sparkles className="h-3 w-3" /> Expand
              </TabsTrigger>
              <TabsTrigger value="reverse" className="gap-1 text-[10px]">
                <ScanEye className="h-3 w-3" /> Reverse
              </TabsTrigger>
            </TabsList>

            {/* ── Expand ───────────────────────────────────────────── */}
            <TabsContent value="expand" className="mt-0 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Rough idea
                </label>
                <button
                  type="button"
                  onClick={() => setExpandIdea(currentPrompt)}
                  disabled={!currentPrompt}
                  className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition hover:text-primary disabled:opacity-40"
                  title="Use the current Studio prompt as the idea"
                >
                  Use current
                </button>
              </div>
              <Textarea
                value={expandIdea}
                onChange={(e) => setExpandIdea(e.target.value.slice(0, 2000))}
                rows={2}
                placeholder="e.g. a lone astronaut discovering a bioluminescent forest"
                className="text-xs"
                disabled={expandLoading}
              />

              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Extra rules (optional)
                </label>
                <input
                  value={extraRules}
                  onChange={(e) => setExtraRules(e.target.value.slice(0, 500))}
                  placeholder="e.g. red hair, pink glasses"
                  className="nexus-input w-full rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-xs outline-none"
                  disabled={expandLoading}
                />
              </div>

              <Button
                type="button"
                onClick={handleEnhance}
                disabled={expandLoading || !expandIdea.trim()}
                className="w-full gap-1.5"
                variant="outline"
              >
                {expandLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Enhancing…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-3.5 w-3.5" />
                    Enhance with AI
                  </>
                )}
              </Button>

              {expandResult ? (
                <div className="space-y-2">
                  <label className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>Enhanced prompt — edit before sending</span>
                    <span className="text-amber-300">auto off</span>
                  </label>
                  <Textarea
                    value={expandResult}
                    onChange={(e) => setExpandResult(e.target.value)}
                    rows={4}
                    className="text-xs"
                  />
                  <Button
                    type="button"
                    onClick={() => sendToStudio(expandResult)}
                    className="w-full gap-1.5"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    Send to Studio
                  </Button>
                </div>
              ) : null}
            </TabsContent>

            {/* ── Reverse ─────────────────────────────────────────── */}
            <TabsContent value="reverse" className="mt-0 space-y-2.5">
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border/50 bg-background/40 px-2.5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  <Upload className="h-3 w-3" /> Upload image
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGalleryOpen(true);
                    if (gallery.length === 0) void fetchGallery();
                  }}
                  className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border/50 bg-background/40 px-2.5 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  <ImageIcon className="h-3 w-3" /> Pick from gallery
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />

              {(reverseImagePath || reverseImageDataUrl) && (
                <div className="overflow-hidden rounded-md border border-border/40">
                  <img
                    src={reverseImageDataUrl ?? reverseImagePath ?? undefined}
                    alt="reverse source"
                    className="max-h-40 w-full object-contain bg-black/40"
                  />
                </div>
              )}

              {galleryOpen ? (
                <div className="rounded-lg border border-border/50 bg-background/40 p-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Gallery
                    </span>
                    <button
                      type="button"
                      onClick={() => setGalleryOpen(false)}
                      className="rounded p-0.5 text-muted-foreground transition hover:text-foreground"
                      aria-label="Close gallery"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  {galleryLoading ? (
                    <div className="flex items-center justify-center gap-1.5 py-3 font-mono text-[10px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                    </div>
                  ) : gallery.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border/40 px-3 py-2 text-center text-[10px] text-muted-foreground">
                      No gallery images yet
                    </div>
                  ) : (
                    <div className="grid max-h-40 grid-cols-4 gap-1 overflow-y-auto nexus-scroll">
                      {gallery.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => {
                            setReverseImagePath(it.imagePath as string);
                            setReverseImageDataUrl(null);
                            setReverseResult("");
                            setGalleryOpen(false);
                          }}
                          title={it.prompt}
                          className="aspect-square overflow-hidden rounded border border-border/50 transition hover:border-primary/50"
                        >
                          <img
                            src={it.imagePath as string}
                            alt={it.prompt}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              <Button
                type="button"
                onClick={handleReverse}
                disabled={
                  reverseLoading || (!reverseImagePath && !reverseImageDataUrl)
                }
                className="w-full gap-1.5"
                variant="outline"
              >
                {reverseLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Reverse-engineering…
                  </>
                ) : (
                  <>
                    <ScanEye className="h-3.5 w-3.5" />
                    Reverse-engineer prompt
                  </>
                )}
              </Button>

              {reverseResult ? (
                <div className="space-y-2">
                  <label className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span>Extracted prompt — edit before sending</span>
                    <span className="text-amber-300">auto off</span>
                  </label>
                  <Textarea
                    value={reverseResult}
                    onChange={(e) => setReverseResult(e.target.value)}
                    rows={4}
                    className="text-xs"
                  />
                  <Button
                    type="button"
                    onClick={() => sendToStudio(reverseResult)}
                    className="w-full gap-1.5"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    Send to Studio
                  </Button>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// v4 additions — Engine picker, Video stage toggle, Brain selector, OCR tool,
// Grok success prompt cards. These are pure-presentational components that read
// the store directly via useNexus so they can be dropped into the layout
// without prop drilling.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps an engine's `badge` field to a Tailwind chip style.
 * primary=emerald, trending=amber pulse, fastest=cyan, typography=violet,
 * edit=teal, video=rose, control=amber.
 */
function engineBadgeClass(badge: string | undefined): string | null {
  if (!badge) return null;
  switch (badge) {
    case "primary":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
    case "trending":
      return "border-amber-500/40 bg-amber-500/15 text-amber-300 nexus-pulse";
    case "fastest":
      return "border-cyan-500/40 bg-cyan-500/15 text-cyan-300";
    case "typography":
      return "border-violet-500/40 bg-violet-500/15 text-violet-300";
    case "edit":
      return "border-teal-500/40 bg-teal-500/15 text-teal-300";
    case "video":
      return "border-rose-500/40 bg-rose-500/15 text-rose-300";
    case "control":
      return "border-amber-500/40 bg-amber-500/15 text-amber-300";
    default:
      return null;
  }
}

/**
 * EnginePicker — top of the studio control column. Tabs for Image/Edit/Video,
 * horizontal scrollable chips for engines of the selected type, compact detail
 * strip for the active engine, external HF link, and mature-capable flag.
 *
 * When the user switches to the Video tab and picks a video engine, videoEnabled
 * is auto-set to true. Switching back to image/edit leaves videoEnabled as-is
 * but the VideoStageToggle below shows a hint.
 */
function EnginePicker() {
  const {
    engineId,
    setEngine,
    syncCalibrationToEngine,
    setVideoEnabled,
  } = useNexus();

  const activeEngine: Engine = getEngine(engineId);
  const [tab, setTab] = useState<EngineType>(activeEngine.type);
  // Track the previous engine type so we can keep the tab in sync when the
  // engine changes externally (e.g. via a Grok template). This is the
  // recommended "adjust state during render" pattern — not an effect.
  const [prevEngineType, setPrevEngineType] = useState<EngineType>(activeEngine.type);
  if (activeEngine.type !== prevEngineType) {
    setPrevEngineType(activeEngine.type);
    setTab(activeEngine.type);
  }

  const engines = enginesByType(tab);

  const handlePick = (e: Engine) => {
    setEngine(e.id);
    syncCalibrationToEngine();
    // Auto-enable video when picking a video engine from the Video tab.
    if (tab === "video" && e.type === "video") {
      setVideoEnabled(true);
      toast.success(`Video engine selected — I2V stage enabled`, {
        description: `${e.name} · ${e.family}`,
      });
    }
  };

  const presetCount = presetsForEngine(activeEngine.id).length;
  const isDefaultEngine = activeEngine.id === DEFAULT_IMAGE_ENGINE_ID;

  // ── Engine deploy status (smart rotator) ─────────────────────────────────
  // Fetches which Modal apps are deployed vs stopped. H100 engines show a
  // deploy/stop toggle. FLUX.2 is always-on (no toggle).
  const [engineStatuses, setEngineStatuses] = useState<Record<string, { status: string; gpu: string; alwaysOn: boolean }>>({});
  const [deploying, setDeploying] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStatuses = async () => {
      try {
        const res = await fetch("/api/modal/engine-manager", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.engines) {
          setEngineStatuses(data.engines);
        }
      } catch {
        // Non-fatal — status display is advisory
      }
    };
    fetchStatuses();
    // Poll every 120s (was 20s — slower polling = less cost, status is advisory)
    const interval = setInterval(fetchStatuses, 120000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const handleDeployToggle = async (eid: string) => {
    const current = engineStatuses[eid];
    if (!current) return;
    setDeploying(eid);
    try {
      const action = current.status === "deployed" ? "stop" : "deploy";
      const res = await fetch("/api/modal/engine-manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, engineId: eid }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        // Refresh statuses
        const statusRes = await fetch("/api/modal/engine-manager", { cache: "no-store" });
        const statusData = await statusRes.json();
        if (statusData.engines) setEngineStatuses(statusData.engines);
      } else {
        toast.error(data.message || "Engine operation failed");
      }
    } catch (err) {
      toast.error("Engine operation failed");
    } finally {
      setDeploying(null);
    }
  };

  const activeStatus = engineStatuses[activeEngine.id];
  const isH100 = activeStatus?.gpu === "H100";
  const isDeployed = activeStatus?.status === "deployed";
  const isAlwaysOn = activeStatus?.alwaysOn === true;

  return (
    <div className="nexus-card rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <Cpu className="h-3.5 w-3.5 text-primary" /> Engine
        </span>
        <span className="font-mono text-[9px] text-muted-foreground/60">
          {engineTypeLabel(tab)} · {engines.length}
        </span>
      </div>

      {/* Type tabs — Image / Edit / Video */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as EngineType)}>
        <TabsList className="h-8 w-full">
          <TabsTrigger value="image" className="gap-1 text-[10px]">
            <ImageIcon className="h-3 w-3" /> Image
          </TabsTrigger>
          <TabsTrigger value="edit" className="gap-1 text-[10px]">
            <Wand2 className="h-3 w-3" /> Edit
          </TabsTrigger>
          <TabsTrigger value="video" className="gap-1 text-[10px]">
            <Film className="h-3 w-3" /> Video
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Engine chips — horizontal scroll */}
      <div className="mt-2 flex gap-1.5 overflow-x-auto nexus-scroll pb-1.5">
        {engines.map((e) => {
          const active = e.id === engineId;
          const badgeCls = engineBadgeClass(e.badge);
          const eStatus = engineStatuses[e.id];
          const eAlwaysOn = eStatus?.alwaysOn === true;
          const eDeployed = eStatus?.status === "deployed";
          // Status dot: green=deployed/always-on, gray=stopped, blue=unknown
          const dotColor = eAlwaysOn || eDeployed ? "bg-emerald-400" : eStatus?.status === "stopped" ? "bg-zinc-500" : "bg-sky-400";
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => handlePick(e)}
              title={`${e.name} — ${eAlwaysOn ? "always on" : eStatus?.status ?? "unknown"}`}
              className={cn(
                "nexus-chip nexus-card-hover relative shrink-0 rounded-md border px-2.5 py-1.5 text-left transition",
                active
                  ? "nexus-chip-active"
                  : "border-border/50 bg-background/40 hover:border-primary/30"
              )}
            >
              {/* Status dot — top-right corner */}
              <span
                className={cn("absolute right-1 top-1 h-1.5 w-1.5 rounded-full", dotColor)}
                title={eAlwaysOn ? "Always on (L40S)" : eDeployed ? "Deployed" : eStatus?.status === "stopped" ? "Stopped — will auto-deploy on run" : "Unknown"}
              />
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-medium leading-tight">
                  {e.shortName}
                </span>
                {e.badge ? (
                  <span
                    className={cn(
                      "rounded border px-1 py-0 font-mono text-[7px] uppercase tracking-wider",
                      badgeCls ?? "border-border/40 bg-background/40 text-muted-foreground"
                    )}
                  >
                    {e.badge}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground/70">
                {e.family}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active engine detail strip */}
      <div className="mt-2 rounded-lg border border-border/40 bg-background/30 p-2.5">
        <div className="mb-1 flex flex-wrap items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-semibold leading-tight text-foreground">
                {activeEngine.name}
              </span>
              {isDefaultEngine ? (
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-300">
                  default
                </span>
              ) : null}
              {activeEngine.trend === "rising" ? (
                <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-300">
                  <Sparkle className="h-2 w-2" /> rising
                </span>
              ) : null}
              {/* Engine deploy status badge + toggle (H100 engines only) */}
              {isAlwaysOn ? (
                <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> always on
                </span>
              ) : isH100 ? (
                <button
                  type="button"
                  onClick={(ev) => { ev.stopPropagation(); handleDeployToggle(activeEngine.id); }}
                  disabled={deploying === activeEngine.id}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded border px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider transition",
                    isDeployed
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                      : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20",
                    deploying === activeEngine.id && "opacity-50"
                  )}
                  title={isDeployed ? "Click to stop (saves H100 idle cost)" : "Click to deploy (H100 cold start ~2-5 min)"}
                >
                  {deploying === activeEngine.id ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <span className={cn("h-1.5 w-1.5 rounded-full", isDeployed ? "bg-emerald-400" : "bg-zinc-500")} />
                  )}
                  {isDeployed ? "deployed" : "stopped"}
                </button>
              ) : null}
            </div>
            <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
              {activeEngine.family} · {activeEngine.role}
            </div>
          </div>
          <a
            href={activeEngine.hfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border/50 bg-background/40 px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            title="Open HuggingFace model card"
          >
            HF <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
        <p className="line-clamp-1 text-[10px] leading-snug text-muted-foreground">
          {activeEngine.description}
        </p>

        {/* Mini-stats row */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[9px]">
          <span className="inline-flex items-center gap-0.5 rounded border border-border/40 bg-background/40 px-1.5 py-0.5 text-muted-foreground">
            <Clock className="h-2.5 w-2.5" /> ~{(activeEngine.estWarmMs / 1000).toFixed(1)}s warm
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5",
              activeEngine.loraCompatible
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-border/40 bg-background/40 text-muted-foreground/60"
            )}
          >
            {activeEngine.loraCompatible ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />} LoRA
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5",
              activeEngine.controlCompatible
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-border/40 bg-background/40 text-muted-foreground/60"
            )}
          >
            {activeEngine.controlCompatible ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />} Control
          </span>
          <span className="inline-flex items-center gap-0.5 rounded border border-border/40 bg-background/40 px-1.5 py-0.5 text-muted-foreground">
            <Sliders className="h-2.5 w-2.5" /> {presetCount} preset{presetCount === 1 ? "" : "s"}
          </span>
        </div>

        {!activeEngine.matureCapable ? (
          <div className="mt-1.5 inline-flex items-center gap-1 rounded border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground/60">
            <ShieldAlert className="h-2.5 w-2.5" /> no mature output
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * VideoStageToggle — a small "Output" card with a Switch for the I2V video
 * stage. When ON, the run pipeline records videoEnabled in provenance. Shows
 * contextual hints about video engine / LoRA requirements.
 */
function VideoStageToggle() {
  const { videoEnabled, setVideoEnabled, engineId } = useNexus();
  const activeEngine = getEngine(engineId);
  const isVideoEngine = activeEngine.type === "video";

  return (
    <div className="nexus-card rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <Video className="h-3.5 w-3.5 text-primary" /> Video stage (I2V)
        </span>
        <Switch checked={videoEnabled} onCheckedChange={setVideoEnabled} aria-label="Toggle video stage" />
      </div>

      {videoEnabled ? (
        <div className="mt-2 space-y-1.5">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] leading-snug text-amber-200/90">
            After image generation, an additional I2V video pass runs (longer wait).
            Requires a video engine or a video LoRA.
          </div>
          {!isVideoEngine ? (
            <div className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                Tip: pick a video engine (Wan 2.2 / LTX 2.3) in the Video tab for
                native I2V, or apply a video LoRA.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[10px] leading-snug text-emerald-300">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span>
                Active engine <strong>{activeEngine.shortName}</strong> supports native I2V.
              </span>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[10px] leading-snug text-muted-foreground/70">
          Off — image-only generation. Toggle on to record an I2V video stage in
          provenance (actual video gen is a future stage).
        </p>
      )}
    </div>
  );
}

/**
 * BrainSelector — uncensored reasoning brain picker. The brain ANALYZES content
 * (including mature) to produce safety verdicts + quality scores; it does not
 * generate mature content itself.
 */
function BrainSelector() {
  const { brainId, setBrain } = useNexus();
  const active: BrainModel = getBrain(brainId);

  return (
    <div className="nexus-card rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <Brain className="h-3.5 w-3.5 text-primary" /> Pipeline Brain
        </span>
        {active.uncensored ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex cursor-help items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-300">
                <ShieldAlert className="h-2.5 w-2.5" /> uncensored
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[220px] text-[10px] leading-snug">
              Uncensored brain — analyzes mature content without refusal. Used for
              safety scan + visual judge + evidence parse.
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {/* Brain chips */}
      <div className="flex gap-1.5 overflow-x-auto nexus-scroll pb-1.5">
        {BRAIN_MODELS.map((b) => {
          const isActive = b.id === brainId;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setBrain(b.id)}
              title={b.name}
              className={cn(
                "nexus-chip nexus-card-hover relative shrink-0 rounded-md border px-2.5 py-1.5 text-left transition",
                isActive
                  ? "nexus-chip-active"
                  : "border-border/50 bg-background/40 hover:border-primary/30"
              )}
            >
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-medium leading-tight">
                  {b.shortName}
                </span>
                {b.recommended ? (
                  <span className="text-[10px] text-amber-400" title="recommended">
                    ★
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground/70">
                {b.params}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active brain detail */}
      <div className="mt-2 rounded-lg border border-border/40 bg-background/30 p-2.5">
        <div className="mb-1 flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-semibold leading-tight text-foreground">
                {active.name}
              </span>
              {active.id === DEFAULT_BRAIN_ID ? (
                <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-300">
                  default
                </span>
              ) : null}
              {active.recommended ? (
                <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-300">
                  ★ recommended
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              {active.specialty}
            </p>
          </div>
          <a
            href={active.hfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border/50 bg-background/40 px-1.5 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            title="Open HuggingFace model card"
          >
            HF <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[9px] sm:grid-cols-3">
          <div>
            <span className="text-muted-foreground/60">params:</span>{" "}
            <span className="text-foreground">{active.params}</span>
          </div>
          <div>
            <span className="text-muted-foreground/60">ctx:</span>{" "}
            <span className="text-foreground">{active.contextWindow}</span>
          </div>
          <div>
            <span className="text-muted-foreground/60">quant:</span>{" "}
            <span className="text-foreground">{active.quantization}</span>
          </div>
          <div>
            <span className="text-muted-foreground/60">reasoning:</span>{" "}
            <span className="text-foreground">{active.reasoning}</span>
          </div>
          <div>
            <span className="text-muted-foreground/60">roles:</span>{" "}
            <span className="text-foreground">{active.roles.join("/")}</span>
          </div>
          <div>
            <span className="text-muted-foreground/60">~ms/call:</span>{" "}
            <span className="text-foreground">{active.estMsPerCall}</span>
          </div>
        </div>
        <p className="mt-1.5 text-[9px] leading-snug text-muted-foreground/60">
          The brain ANALYZES content (including mature) to produce safety verdicts
          + quality scores. It does not generate mature content itself.
        </p>
      </div>
    </div>
  );
}

/**
 * BrainAssistantCard — Task 15 advisory analysis of the current Studio config.
 *
 * Pulls engineId / loraIds / loraWeights / calibrationId / prompt / style from
 * the store and POSTs to /api/brain/analyze. Two modes:
 *   • Local (instant, deep:false) — runs automatically on mount + 2s after the
 *     config changes. Catches common LoRA-compat / step / weight issues.
 *   • Deep (3-5s, deep:true) — calls the z-ai chat completions API for a
 *     richer qualitative assessment. On-demand via the "Deep analysis" button.
 *
 * Renders each suggestion as a tinted card:
 *   - warning / compat → amber / rose tint, AlertTriangle icon
 *   - tip → emerald tint, Lightbulb icon
 *   - optimization → cyan tint, Zap icon
 * Action buttons apply the suggestion with one click (switch-engine,
 * remove-lora, adjust-steps, adjust-cfg) and toast confirmation.
 *
 * ADVISORY ONLY — never blocks generation.
 */

type BrainMode = "local" | "deep";
type BrainAction = "analyze-local" | "analyze-deep" | "config-changed";
interface BrainState {
  mode: BrainMode;
  trigger: number; // bumps to fire the refetch effect
}

function brainReducer(state: BrainState, action: BrainAction): BrainState {
  switch (action) {
    case "analyze-local":
      return { mode: "local", trigger: state.trigger + 1 };
    case "analyze-deep":
      return { mode: "deep", trigger: state.trigger + 1 };
    case "config-changed":
      // Config-change auto-runs are always local, even if the user previously
      // ran a deep analysis. Bumping trigger fires the refetch effect.
      return { mode: "local", trigger: state.trigger + 1 };
    default:
      return state;
  }
}
function BrainAssistantCard() {
  const {
    engineId,
    loraIds,
    loraWeights,
    calibrationId,
    calibrationOverrides,
    prompt,
    style,
    setEngine,
    syncCalibrationToEngine,
    toggleLora,
    setCalibrationOverride,
  } = useNexus();

  // Track the mode + a trigger counter via useReducer. Dispatching from an
  // effect is allowed (unlike setState, which the react-hooks/set-state-in-effect
  // rule forbids). The queryFn reads `mode` via closure; the refetch is gated
  // by `trigger` so it always fires AFTER `mode` has been committed.
  const [{ mode, trigger }, dispatch] = useReducer(brainReducer, {
    mode: "local",
    trigger: 0,
  });
  const [lastMode, setLastMode] = useState<"local" | "deep" | null>(null);
  const [aeonAnalysis, setAeonAnalysis] = useState<BrainAnalysis | null>(null);
  const [open, setOpen] = useState(true);

  // Resolve the calibration to send to the brain (preset + overrides merged).
  const calibration = resolveCalibration(
    calibrationId,
    calibrationOverrides as Partial<CalibrationPreset> | undefined
  );

  // Stable serialized keys for both the queryKey and the auto-run effect deps.
  const loraIdsKey = loraIds.join(",");
  const loraWeightsKey = JSON.stringify(loraWeights);
  const promptKey = prompt.slice(0, 50);

  const queryKey = [
    "brain-analysis",
    engineId,
    loraIdsKey,
    loraWeightsKey,
    calibrationId,
    promptKey,
  ];

  const { data, isFetching, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await fetch("/api/brain/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engineId,
          loraIds,
          loraWeights,
          calibration,
          prompt,
          style,
          deep: mode === "deep",
        }),
      });
      if (!res.ok) throw new Error(`brain analyze failed (${res.status})`);
      const result = (await res.json()) as BrainAnalysis;
      setLastMode(mode);
      return result;
    },
    enabled: false, // on-demand only — never auto-runs on queryKey change
    refetchInterval: false,
    retry: 0,
  });

  // Refetch whenever trigger bumps — this fires AFTER `mode` has been
  // committed (React batches the dispatch), so the queryFn closure always
  // has the latest mode.
  useEffect(() => {
    if (trigger === 0) return;
    void refetch();
  }, [trigger, refetch]);

  // Auto-run a LOCAL check on mount. `mode` already defaults to "local".
  useEffect(() => {
    dispatch("analyze-local");
  }, []);

  // Auto-run a LOCAL check 2s after the config changes (debounced). The
  // reducer forces mode back to "local" so a prior deep run doesn't persist.
  useEffect(() => {
    const t = setTimeout(() => {
      dispatch("config-changed");
    }, 2000);
    return () => clearTimeout(t);
  }, [engineId, loraIdsKey, loraWeightsKey, calibrationId, promptKey]);

  const onAnalyze = useCallback(() => {
    dispatch("analyze-local");
  }, []);

  const onDeepAnalyze = useCallback(async () => {
    // Try brain first (via /api/aeon/advice), fall back to old /api/brain/analyze
    try {
      const aeonRes = await fetch("/api/aeon/advice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          engine: engineId,
          params: {
            steps: calibration.steps,
            cfgScale: calibration.cfg,
            resolution: { width: parseInt(calibration.resolution.split("x")[0] || "1024"), height: parseInt(calibration.resolution.split("x")[1] || "1024") },
          },
          loraStack: loraIds.map((id) => {
            const lora = getLora(id);
            return {
              id,
              name: lora?.name ?? id,
              role: lora?.isControl ? "control" : lora?.category === "detailer" ? "detailer" : "style",
              weight: loraWeights[id] ?? lora?.recommendedWeight ?? 0.5,
              recommendedWeightRange: lora ? { min: 0.3, max: 0.6 } : undefined,
            };
          }),
          mode: "advice_only",
        }),
      });

      if (aeonRes.ok) {
        const aeonData = await aeonRes.json() as { advice?: { summary?: string; issues?: Array<{ severity: string; message: string }>; loraWeightSuggestions?: Array<{ loraId: string; toWeight: number; reason?: string }>; promptRewrite?: { rewritten: string; rationale?: string } }; meta?: { backend: string } };
        if (aeonData.advice) {
          const adv = aeonData.advice;
          const backendLabel = aeonData.meta?.backend === "aeon_modal" ? "Qwen 9B" : aeonData.meta?.backend === "gemma_31b" ? "Gemma 31B" : "z-ai";
          // Convert brain advice to BrainSuggestion format
          const suggestions: BrainSuggestion[] = [];
          for (const issue of adv.issues || []) {
            suggestions.push({
              kind: issue.severity === "error" ? "compat" : issue.severity === "warning" ? "warning" : "tip",
              title: issue.message.slice(0, 80),
              detail: issue.message,
            });
          }
          for (const ws of adv.loraWeightSuggestions || []) {
            suggestions.push({
              kind: "optimization",
              title: `Adjust ${ws.loraId} weight → ${ws.toWeight}`,
              detail: ws.reason || `Brain suggests weight ${ws.toWeight}`,
              action: { label: `Set ${ws.toWeight}`, type: "adjust-cfg", value: String(ws.toWeight) },
            });
          }
          if (adv.promptRewrite) {
            suggestions.push({
              kind: "tip",
              title: "Prompt rewrite suggested",
              detail: adv.promptRewrite.rationale || adv.promptRewrite.rewritten.slice(0, 200),
            });
          }
          // Replace the analysis with brain results
          setAeonAnalysis({
            suggestions,
            summary: `${adv.summary || "Brain analysis complete"} (via ${backendLabel})`,
            confidence: 85,
            ms: 0,
          });
          toast.success(`Brain analysis complete (via ${backendLabel})`);
          return;
        }
      }
    } catch {
      // Fall through to old brain analyze
    }
    // Fallback: old brain analyze
    dispatch("analyze-deep");
  }, [prompt, engineId, calibration, loraIds, loraWeights]);

  const applyAction = useCallback(
    (action: NonNullable<BrainSuggestion["action"]>) => {
      switch (action.type) {
        case "switch-engine":
          if (action.value) {
            setEngine(action.value);
            syncCalibrationToEngine();
            toast.success(`Engine switched to ${action.value}`);
          }
          break;
        case "remove-lora":
          if (action.value) {
            toggleLora(action.value);
            toast.success(`Removed LoRA "${action.value}"`);
          }
          break;
        case "adjust-steps":
          if (action.value) {
            const v = parseInt(action.value, 10);
            if (Number.isFinite(v)) {
              setCalibrationOverride("steps", v);
              toast.success(`Steps → ${v}`);
            }
          }
          break;
        case "adjust-cfg":
          if (action.value) {
            const v = parseFloat(action.value);
            if (Number.isFinite(v)) {
              setCalibrationOverride("cfg", v);
              toast.success(`CFG → ${v}`);
            }
          }
          break;
      }
    },
    [setEngine, syncCalibrationToEngine, toggleLora, setCalibrationOverride]
  );

  const suggestions = aeonAnalysis?.suggestions ?? data?.suggestions ?? [];
  const summary = aeonAnalysis?.summary ?? data?.summary ?? null;
  const confidence = data?.confidence ?? null;
  const isDeepFetching = isFetching && mode === "deep";

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="nexus-card rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
          >
            <Brain className="h-3.5 w-3.5 text-primary" />
            <span>Brain Assistant</span>
            <ChevronRight className={cn("h-3 w-3 transition", open && "rotate-90")} />
          </button>
        </CollapsibleTrigger>
        <div className="flex shrink-0 items-center gap-1.5">
          {lastMode ? (
            <span
              className={cn(
                "rounded border px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider",
                lastMode === "deep"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              )}
              title={lastMode === "deep" ? "Last analysis: AI deep" : "Last analysis: local rules"}
            >
              {lastMode}
            </span>
          ) : null}
          {typeof confidence === "number" ? (
            <span className="rounded border border-border/50 bg-background/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
              {Math.round(confidence * 100)}%
            </span>
          ) : null}
          <button
            type="button"
            onClick={onAnalyze}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-background/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            title="Run local compatibility checks (instant)"
          >
            {isFetching && !isDeepFetching ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Zap className="h-2.5 w-2.5" />
            )}
            Analyze
          </button>
          <button
            type="button"
            onClick={onDeepAnalyze}
            disabled={isFetching}
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            title="Run AI deep analysis via z-ai chat completions (~3-5s)"
          >
            {isDeepFetching ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Brain className="h-2.5 w-2.5" />
            )}
            Deep
          </button>
        </div>
      </div>

      <CollapsibleContent className="mt-2 space-y-2">
        {error ? (
          <div className="flex items-start gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[10px] leading-snug text-rose-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              {error instanceof Error ? error.message : "Brain analysis failed."}{" "}
              The brain is advisory only — you can still run the pipeline.
            </span>
          </div>
        ) : null}

        {isFetching && suggestions.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-border/40 bg-background/30 px-2.5 py-2 text-[10px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span>
              {isDeepFetching ? "Running AI deep analysis…" : "Analyzing config…"}
            </span>
          </div>
        ) : null}

        {!isFetching && suggestions.length === 0 && !error ? (
          <div className="flex items-start gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-[10px] leading-snug text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
            <span>No issues detected by the local rules. Click "Deep" for an AI-powered review.</span>
          </div>
        ) : null}

        {suggestions.length > 0 ? (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto nexus-scroll pr-0.5">
            {suggestions.map((s, i) => (
              <BrainSuggestionRow
                key={`${s.title}-${i}`}
                suggestion={s}
                onAction={applyAction}
                disabled={isFetching}
              />
            ))}
          </ul>
        ) : null}

        {summary ? (
          <div className="rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5 text-[10px] leading-snug text-muted-foreground">
            <span className="font-mono text-[9px] uppercase tracking-wider text-primary/80">summary</span>
            <span className="ml-1.5 text-foreground/80">{summary}</span>
          </div>
        ) : null}

        <p className="text-[9px] leading-snug text-muted-foreground/60">
          Advisory only — never blocks generation. Local checks run on mount + 2s
          after config changes. Deep analysis uses the z-ai chat completions API
          (~3-5s).
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function BrainSuggestionRow({
  suggestion,
  onAction,
  disabled,
}: {
  suggestion: BrainSuggestion;
  onAction: (action: NonNullable<BrainSuggestion["action"]>) => void;
  disabled?: boolean;
}) {
  const { kind, title, detail, action } = suggestion;
  const isWarn = kind === "warning" || kind === "compat";
  const isTip = kind === "tip";

  const Icon = isWarn ? AlertTriangle : isTip ? Lightbulb : Zap;
  const wrapCls = isWarn
    ? "border-amber-500/40 bg-amber-500/5"
    : isTip
      ? "border-emerald-500/40 bg-emerald-500/5"
      : "border-cyan-500/40 bg-cyan-500/5";
  const iconCls = isWarn ? "text-amber-300" : isTip ? "text-emerald-300" : "text-cyan-300";
  const labelCls = isWarn ? "text-amber-300" : isTip ? "text-emerald-300" : "text-cyan-300";

  return (
    <li className={cn("rounded-md border px-2 py-1.5", wrapCls)}>
      <div className="flex items-start gap-1.5">
        <Icon className={cn("mt-0.5 h-3 w-3 shrink-0", iconCls)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded bg-background/40 px-1 py-0.5 font-mono text-[7px] uppercase tracking-wider",
                labelCls
              )}
            >
              {kind}
            </span>
            <span className="truncate text-[11px] font-semibold leading-tight text-foreground">
              {title}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{detail}</p>
          {action ? (
            <button
              type="button"
              onClick={() => onAction(action)}
              disabled={disabled}
              className={cn(
                "mt-1.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition disabled:cursor-not-allowed disabled:opacity-50",
                isWarn
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
                  : isTip
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                    : "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
              )}
            >
              {action.label}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * GpuBoostToggle — Task 15 explicit Modal GPU opt-in.
 *
 * Default OFF → the run uses z-ai SDK (always warm, reliable, 20-30s/image).
 * When toggled ON → the run sends modalBoost=true and the route handler
 * temporarily sets MODAL_USE=true for that one request, routing to Modal L40S.
 *
 * Because the Modal endpoint has min_containers=0, max_containers=1, every
 * request to a cold container queues behind a 30-60s weight load. We surface
 * this clearly with an amber warning + a "Warm up Modal" button so the user
 * can pre-emptively spin up the container before generation.
 */
function GpuBoostToggle({
  useModalBoost,
  setUseModalBoost,
}: {
  useModalBoost: boolean;
  setUseModalBoost: (v: boolean) => void;
}) {
  const [warming, setWarming] = useState(false);

  const warmup = useCallback(async () => {
    setWarming(true);
    try {
      const res = await fetch("/api/modal/warmup", { method: "POST" });
      const data = (await res.json()) as {
        warmed?: boolean;
        enabled?: boolean;
        latencyMs?: number;
        error?: string | null;
        message?: string;
      };
      if (data.warmed) {
        toast.success(`Modal warm — ${data.latencyMs ?? "?"}ms`, {
          description: "Container is ready. Generation will be ~1.5-2s.",
        });
      } else if (!data.enabled) {
        toast.info("Modal disabled in env", {
          description: "z-ai SDK will run instead (always warm).",
        });
      } else {
        toast.warning("Modal still cold-starting", {
          description: "Try again in 1-2 minutes, or use z-ai (default).",
        });
      }
    } catch (e) {
      toast.error("Warm-up failed", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setWarming(false);
    }
  }, []);

  return (
    <div
      className={cn(
        "nexus-card rounded-2xl p-4",
        useModalBoost && "border-amber-500/40"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-md",
              useModalBoost
                ? "bg-amber-500/15 text-amber-300"
                : "bg-emerald-500/15 text-emerald-300"
            )}
          >
            {useModalBoost ? (
              <Cpu className="h-3.5 w-3.5" />
            ) : (
              <Cloud className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                GPU Boost
              </span>
              <span
                className={cn(
                  "rounded border px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider",
                  useModalBoost
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                )}
              >
                {useModalBoost ? "Modal GPU" : "z-ai (always warm)"}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              {useModalBoost
                ? "Modal L40S — may cold-start 30-60s. Click Warm up first."
                : "z-ai hosted inference — reliable, 20-30s per image (default)."}
            </p>
          </div>
        </div>
        <Switch
          checked={useModalBoost}
          onCheckedChange={setUseModalBoost}
          aria-label="Toggle Modal GPU boost"
        />
      </div>

      {useModalBoost ? (
        <div className="mt-2.5 space-y-1.5">
          <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-300">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Modal GPU enabled. The H100 may be cold (30-60s warm-up). Click
              &quot;Warm up Modal&quot; first, or the first generation will queue
              behind a cold start.
            </span>
          </div>
          <button
            type="button"
            onClick={warmup}
            disabled={warming}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-amber-300 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {warming ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Flame className="h-3 w-3" />
            )}
            {warming ? "Warming…" : "Warm up Modal"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * OcrTool — runs Baidu Unlimited-OCR (via z-ai vision) on the result image and
 * shows the extracted text + bounding-box count + language + timing in a
 * collapsible section. Visible only when result.imagePath exists.
 */
function OcrTool({ imagePath }: { imagePath: string }) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runOcr = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePath }),
      });
      const data = (await res.json()) as OcrResult & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `OCR failed (${res.status})`);
      }
      setResult(data);
      setOpen(true);
      toast.success(`OCR complete — ${data.boxes.length} text region(s)`, {
        description: `${data.language} · ${data.ms}ms`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast.error("OCR failed", { description: msg });
    } finally {
      setLoading(false);
    }
  }, [imagePath]);

  const copyText = useCallback(() => {
    if (!result?.fullText) return;
    navigator.clipboard?.writeText(result.fullText);
    toast.success("OCR text copied to clipboard");
  }, [result?.fullText]);

  return (
    <DetailCard
      title="OCR · Unlimited-OCR"
      icon={<ScanText className="h-4 w-4" />}
      action={
        <button
          type="button"
          onClick={runOcr}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScanText className="h-3 w-3" />}
          {loading ? "Scanning…" : result ? "Re-run OCR" : "Run OCR"}
        </button>
      }
    >
      <p className="text-[10px] leading-snug text-muted-foreground/70">
        Powered by Baidu Unlimited-OCR (via z-ai vision). Extracts every text
        element including small / rotated / stylized.
      </p>

      {error ? (
        <div className="mt-2 flex items-start gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[10px] leading-snug text-rose-300">
          <XCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <span className="rounded border border-border/50 bg-background/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-primary">
                  {result.language}
                </span>
                <span>{result.ms}ms</span>
                <span>·</span>
                <span>{result.boxes.length} box(es)</span>
              </span>
              <ChevronRight className={cn("h-3 w-3 transition", open && "rotate-90")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Extracted text
              </span>
              <button
                type="button"
                onClick={copyText}
                className="inline-flex items-center gap-1 rounded-md border border-border/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-primary"
              >
                <Copy className="h-2.5 w-2.5" /> Copy text
              </button>
            </div>
            {result.fullText ? (
              <pre className="nexus-scroll max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/40 bg-background/40 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-foreground/80">
{result.fullText}
              </pre>
            ) : (
              <div className="rounded-md border border-dashed border-border/40 px-2.5 py-2 text-center font-mono text-[10px] text-muted-foreground">
                No text detected in this image.
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </DetailCard>
  );
}

/**
 * GrokSuccessCard — one card in the Grok Success templates tab. Shows title,
 * category badge, 2-line clamped prompt preview, recommended engine families,
 * and recommended preset name.
 */
function GrokSuccessCard({
  sp,
  onUse,
}: {
  sp: SuccessPrompt;
  onUse: () => void;
}) {
  const preset = getPreset(sp.recommendedPresetId);
  return (
    <button
      type="button"
      onClick={onUse}
      title={sp.title}
      className="group nexus-card-hover flex flex-col rounded-lg border border-border/40 bg-background/30 p-2.5 text-left transition hover:border-amber-500/40"
    >
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-300">
          {sp.category}
        </span>
        <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/60">
          {sp.aspect}
        </span>
      </div>
      <div className="text-[11px] font-semibold leading-tight text-foreground">
        {sp.title}
      </div>
      <p className="mt-1 line-clamp-2 text-[9px] leading-snug text-muted-foreground">
        {sp.prompt}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {sp.engineFamilies.map((fam) => (
          <span
            key={fam}
            className="rounded border border-border/50 bg-background/40 px-1 py-0.5 font-mono text-[7px] uppercase tracking-wider text-muted-foreground"
          >
            {fam}
          </span>
        ))}
        <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 font-mono text-[7px] uppercase tracking-wider text-emerald-300">
          {preset.name}
        </span>
      </div>
    </button>
  );
}
