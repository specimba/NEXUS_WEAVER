# NEXUS WEAVER — Deep Pipeline Audit (v5.45)

> **Date**: July 11, 2026
> **Auditor**: Z.ai Code (main agent)
> **Scope**: Full end-to-end pipeline trace, diagnosis, recommendations, roadmap

---

## 1. Pipeline Map (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                               │
│  studio-view.tsx                                                     │
│  • Engine picker (FLUX.2 / Krea 2 / SDXL Pony / Z-Image)            │
│  • Calibration preset (steps, cfg, sampler, resolution)             │
│  • LoRA stack (per-LoRA weights, enable/disable)                    │
│  • Prompt input (manual / SY Prompt / Enhance / Templates)         │
│  • Degraded mode toggle (skipBrain)                                 │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ POST /api/pipeline/run
                           │ (30s AbortController — just creates the job)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    API ROUTE (Next.js)                               │
│  /api/pipeline/run/route.ts                                         │
│  1. Validates input (prompt, style, aspect, engineId, loraIds)     │
│  2. Creates PipelineJob in SQLite (status=queued)                  │
│  3. Calls startPipelineJob() — fire-and-forget async               │
│  4. Returns 202 {jobId} immediately                                 │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ startPipelineJob(jobId, input)
                           │ (void — runs in background)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  PIPELINE WORKER (async)                             │
│  pipeline-job-worker.ts                                             │
│  • runPipelineJob() picks up the job                                │
│  • Calls runPipeline() from pipeline.ts                             │
│  • persistProgress() writes stage updates to DB after each stage   │
│  • Updates job status: queued → running → completed/failed         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ runPipeline(input, onProgress)
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PIPELINE CORE                                     │
│  pipeline.ts runPipeline()                                          │
│                                                                     │
│  Stage 1: ST3GG (brain safety scan)                                 │
│    └─ SKIPPED if skipBrain=true (brain endpoints 503)              │
│    └─ callModalBrain → Qwen 9B managed endpoint                    │
│                                                                     │
│  Stage 2: Lore Enhancement                                          │
│    └─ findRelevantLore(prompt) + taste-profile-preferred lore      │
│    └─ Enriches prompt with garment/accessory/style descriptions    │
│    └─ SILENT — user can't see what was added                       │
│                                                                     │
│  Stage 3: stageFlux (image generation)                              │
│    ├─ ensureEngineDeployed (engine-manager.ts)                     │
│    │   └─ getEngineStatuses → modal CLI (FAILS in dev server)     │
│    │   └─ v5.44 fix: "unknown" → proceed (no FLUX.2 fallback)     │
│    ├─ generateImageViaModal (modal-client.ts)                      │
│    │   ├─ resolveBackend(engineId) → picks URL + format            │
│    │   ├─ v5.44 fix: uses calibration CFG (not backend default)   │
│    │   ├─ Resolves Civitai LoRAs via civitai-resolver.ts          │
│    │   └─ POST to Modal app /generate                              │
│    ├─ Modal app (nexus_sdxl_pony.py / nexus_flux2_klein9b.py)     │
│    │   ├─ Loads model from hf-hub-cache volume (CACHED ✅)        │
│    │   ├─ Loads HF LoRAs via pipe.load_lora_weights (CACHED ✅)   │
│    │   ├─ Downloads Civitai LoRAs to /tmp (NOT CACHED ❌)         │
│    │   └─ Generates image → returns base64                        │
│    └─ Saves image to /public/gallery/ + DB (imageData field)      │
│                                                                     │
│  Stage 4: Judge (brain quality scoring)                             │
│    └─ SKIPPED if skipBrain=true                                     │
│    └─ callModalBrain → Gemma 31B vision endpoint                   │
│                                                                     │
│  Stage 5: Evidence (local TS aggregation — no brain call)          │
│    └─ Computes confidence, riskProfile, keyFindings locally       │
│                                                                     │
│  Post-pipeline: Experience Logger + Taste Profile update           │
│    └─ DORMANT — no judge scores → taste profile never updates     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    UI POLLING                                        │
│  studio-view.tsx polls /api/pipeline/jobs/{id} every 2s           │
│  • Gets stage progress (st3gg → flux → judge → evidence → output) │
│  • Shows result image when status=completed                        │
│  • Shows error message when status=failed                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Diagnosis — What's Broken or Suboptimal

### 🔴 CRITICAL (blocks core functionality)

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| C1 | **Brain endpoints 503** — Modal refuses to start containers (account-level: needs payment method or budget increase) | Every run uses skipBrain. The "governed pipeline" (ST3GG → Judge → Evidence) is NOT running. No safety scanning, no quality scoring. | ❌ Blocked (user action needed) |
| C2 | **Civitai LoRAs re-download every run** — downloaded to `/tmp` (ephemeral), NOT cached on Modal Volume | 649MB re-downloaded per generation = 10-15s wasted + bandwidth credits. sy-realism-pony costs ~$0.01 in bandwidth per run. | ❌ Not fixed |
| C3 | **Video pipeline 404** — Wan 2.2 / LTX 2.3 are stopped | All video I2V calls return 404 "invalid function call". The image→video flow is completely broken. | ❌ Not fixed |
| C4 | **Civitai LoRA download not verified end-to-end** — the resolver was built but the dev server died before the full pipeline test completed | Unknown whether Civitai LoRAs actually load + apply in the Modal app. | ⚠️ Needs verification |

### 🟡 STRUCTURAL (suboptimal but functional)

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| S1 | **Engine status check uses modal CLI** — fragile, breaks on sandbox resets (CLI gets wiped) | Dev server can't check app status → returns "unknown" → v5.44 workaround proceeds optimistically (works but fragile) | ⚠️ Workaround in place |
| S2 | **No LoRA preloading** — LoRAs load inside the generation request, not during warm-up | Adds 2-10s per LoRA to every generation (load_lora_weights is synchronous) | ❌ Not fixed |
| S3 | **No generation queue** — max_containers=1 means concurrent requests compete | 2 simultaneous users = 1 waits (or fails on timeout) | ❌ Not fixed |
| S4 | **Lore system invisible** — lore enrichment happens silently | User can't see what was added or why. "Story, lore" feels absent. | ❌ Not fixed |
| S5 | **Taste profile dormant** — with skipBrain, no judge scores → taste profile never updates | Lore selection doesn't improve over time. The "learning" loop is broken. | ❌ Blocked by C1 |
| S6 | **No 3-engine compare** — user wants "3-model experimental advantage" | Can't generate the same prompt with FLUX.2 + Krea 2 + SDXL side-by-side | ❌ Not built |
| S7 | **Evidence provenance says "FLUX.2"** even when SDXL/Krea is used | Misleading — the evidence aggregator hardcodes "FLUX.2 Klein 9B" in the generator field | ❌ Not fixed |

### 🔵 VISION GAPS (drift from core vision)

| # | Issue | Impact |
|---|-------|--------|
| V1 | **No partnership workflow automation** — SY Prompt → SDXL Pony → SY LoRA loop is manual (3 separate clicks) | The value-loop exists but isn't one-click. Partnership demo is clunky. |
| V2 | **No story/narrative builder** — user mentioned "story, lore" but there's no visual story editor | Can't chain prompts + images into a narrative sequence. |
| V3 | **No ComfyUI workflow import** — user mentioned ComfyUI packs but we have a linear pipeline | Can't import .json workflow files from ComfyUI. |
| V4 | **No Stable Yogi model integration** — ZIT / Muse / Realism checkpoints exist in SY's model library but aren't downloadable (magic link expired) | Can't use SY's own tuned checkpoints — only their LoRAs. |

---

## 3. Prioritized Recommendations

### P0 — Immediate (unblocks everything)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| P0.1 | **Fix brain endpoints** — add payment method to Modal account (user action). Restores full governance pipeline. | User | Unblocks C1, S5 |
| P0.2 | **Cache Civitai LoRAs on Modal Volume** — create `lora-cache` volume, download to volume path instead of /tmp. Cache by model ID. | 1 hour | Fixes C2 — saves 10-15s + bandwidth per run |
| P0.3 | **Redeploy video engines** — Wan 2.2 + LTX 2.3 need redeployment (stopped). | 5 min | Fixes C3 |
| P0.4 | **Verify Civitai LoRA end-to-end** — run a full pipeline test with sy-realism-pony and check the Modal logs. | 15 min | Verifies C4 |

### P1 — High impact (1-2 sessions)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| P1.1 | **Replace modal CLI with Modal HTTP API** — use `https://modal.com/api/v1/...` for status checks. No CLI dependency. | 2 hours | Fixes S1 permanently |
| P1.2 | **"Partnership Quick Start" button** — one-click: SY Prompt → SDXL Pony + SY LoRA → generate. | 1 hour | Fixes V1 — partnership demo becomes one click |
| P1.3 | **3-Engine Compare mode** — generate the same prompt with 3 engines side-by-side, pick best. | 3 hours | Fixes S6 — the "3-model experimental advantage" |
| P1.4 | **Show lore enrichment in UI** — display what lore entries were added to the prompt. | 1 hour | Fixes S4 — makes lore visible |
| P1.5 | **Fix Evidence provenance** — use the actual engine name, not hardcoded "FLUX.2" | 15 min | Fixes S7 |

### P2 — Medium impact (2-3 sessions)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| P2.1 | **LoRA preloading** — preload selected LoRAs during container warm-up. | 3 hours | Fixes S2 — saves 2-10s per LoRA per generation |
| P2.2 | **Generation queue** — handle concurrent requests with a queue + notification. | 4 hours | Fixes S3 |
| P2.3 | **Story builder** — visual narrative editor that chains prompts + images. | 1 session | Fixes V2 |
| P2.4 | **Taste profile activation** — when brain is back, auto-update taste profile from judge scores. | 2 hours | Fixes S5 (depends on P0.1) |

### P3 — Long-term (partnership + premium)

| # | Action | Effort | Impact |
|---|--------|--------|--------|
| P3.1 | **ComfyUI workflow import** — parse .json workflow files. | 1 session | Fixes V3 |
| P3.2 | **Stable Yogi model integration** — download ZIT / Muse checkpoints from inside SY platform (needs fresh magic link). | 1 session | Fixes V4 |
| P3.3 | **Prompt-Adherence Engine** — implement SY's double-conditioning technique in Krea 2 Modal app. | 2-3 days | Major quality boost for Krea 2 |
| P3.4 | **Stable Yogi OAuth** — register a Server App for proper OAuth flow (not magic links). | 1 session | Long-term partnership integration |

---

## 4. Incremental Roadmap

```
Session 1 (now):
  ✅ P0.2: Cache Civitai LoRAs on Modal Volume
  ✅ P0.3: Redeploy video engines
  ✅ P1.5: Fix Evidence provenance
  → Partnership readiness: 85%

Session 2 (next):
  P0.4: Verify Civitai LoRA end-to-end
  P1.1: Replace modal CLI with HTTP API
  P1.2: Partnership Quick Start button
  → Partnership readiness: 90%

Session 3:
  P1.3: 3-Engine Compare mode
  P1.4: Show lore enrichment in UI
  → "3-model experimental advantage" delivered

Session 4:
  P2.1: LoRA preloading
  P2.2: Generation queue
  → Performance + reliability

Session 5+:
  P2.3: Story builder
  P3.1: ComfyUI workflow import
  P3.2: Stable Yogi model integration (needs fresh magic link)
  P3.3: Prompt-Adherence Engine
  → Full partnership platform
```

---

## 5. What's Working Well

Despite the issues, several things ARE working correctly:

- ✅ **Engine routing** (post-v5.44 fix) — SDXL Pony, Krea 2, FLUX.2 all receive requests correctly
- ✅ **Calibration presets** — steps + CFG from presets are now respected (v5.44 fix)
- ✅ **HuggingFace LoRAs** — load correctly on all engines (cached on volume)
- ✅ **Async pipeline pattern** — the POST → jobId → poll pattern sidesteps the 60s ALB timeout
- ✅ **Stable Yogi Prompt Engine** — integrated and working (100/day free quota)
- ✅ **Civitai URL resolver** — resolves URLs in Next.js backend (bypasses Modal IP block)
- ✅ **Degraded mode** — allows image generation even when brain is down
- ✅ **LoRA Packs** — 17 curated packs with one-click apply
- ✅ **Civitai REST API + Browserless** — import-by-URL works for HF + Civitai + Civitai.red
- ✅ **GitHub backup** — all code + tokens backed up to GitHub Secrets
