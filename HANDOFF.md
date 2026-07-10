# NEXUS Visual Weaver — Project Handoff Document

> **Version**: v5.37 (July 2026)  
> **Status**: Active development — image generation working, video/inpaint deployed but untested  
> **GitHub**: https://github.com/specimba/NEXUS_WEAVER  
> **License**: See LICENSE file  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Directory Structure](#3-directory-structure)
4. [Setup & Installation](#4-setup--installation)
5. [Configuration](#5-configuration)
6. [Codebase Map](#6-codebase-map)
7. [Workflows](#7-workflows)
8. [Handoff Protocols](#8-handoff-protocols)
9. [Testing Strategy](#9-testing-strategy)
10. [Known Issues & Roadmap](#10-known-issues--roadmap)
11. [Contribution Guide](#11-contribution-guide)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Project Overview

**NEXUS Visual Weaver** is a governed multi-agent visual creation pipeline built on Next.js 16 + TypeScript + Modal GPU. It uses FLUX.2 Klein 9B as the primary image generation engine, with uncensored brain models (Qwen 9B, Gemma 31B, Brisk 4B) for safety scanning, quality judging, and evidence aggregation.

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui, Framer Motion |
| Backend | Next.js API Routes (Node.js runtime), Prisma ORM (SQLite) |
| GPU Compute | Modal.com (L40S for FLUX.2 + brain, H100 for video) |
| Image Engine | FLUX.2 Klein 9B (black-forest-labs) |
| Brain Models | Qwen 9B (ST3GG/Evidence), Gemma 31B heretic (Judge), Brisk 4B (Creative) — Modal Managed Endpoints |
| Video | Wan 2.2 I2V (H100), LTX 2.3 (H100) |
| Inpaint | FLUX.1 Kontext-dev (L40S) |
| State | Zustand (client), Prisma/SQLite (server) |
| Auth | NextAuth.js v4 (available, not actively used) |
| Version Control | Git + GitHub (specimba/NEXUS_WEAVER) |

### Current Stage

- **Image generation**: Working — FLUX.2 Klein 9B on Modal L40S
- **Brain pipeline**: Working — 3 Modal Managed Endpoints (Qwen 9B, Gemma 31B, Brisk 4B)
- **Video I2V**: Deployed (Wan 2.2, LTX 2.3) — Wan 2.2 pipeline class fixed but untested after fix
- **Inpaint**: Deployed (Kontext) — route wired but untested
- **Lore system**: Implemented — 30+ entries, taste profile, experience logger
- **Prompt enhancer**: Working — Brisk 4B endpoint with z-ai fallback
- **Creative variation**: Partially implemented — latent noise injection removed (Flux2KleinPipeline shape mismatch), variation comes from random seeds + lower LoRA weights + lore enrichment

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NEXUS Visual Weaver                          │
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │  Next.js Studio  │    │  API Routes      │    │  Prisma/SQLite  │ │
│  │  (React 19 +     │───▶│  /api/pipeline/* │───▶│  Generation    │ │
│  │  Tailwind +      │    │  /api/modal/*    │    │  SafetyScan    │ │
│  │  shadcn/ui)      │◀───│  /api/brain/*    │◀───│  JudgeReport   │ │
│  └─────────────────┘    │  /api/prompt/*    │    │  PipelineJob   │ │
│                         │  /api/video/*     │    │  TasteProfile  │ │
│  ┌─────────────────┐    │  /api/inpaint/*   │    │  ExperienceLog │ │
│  │  Zustand Store   │    └────────┬────────┘    └─────────────────┘ │
│  │  (client state)  │             │                                 │
│  └─────────────────┘             ▼                                 │
│                         ┌─────────────────┐                        │
│                         │  Pipeline Core   │                        │
│                         │  (pipeline.ts)   │                        │
│                         └────┬───┬───┬────┘                        │
│                              │   │   │                              │
│              ┌───────────────┘   │   └───────────────┐              │
│              ▼                   ▼                   ▼              │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │
│  │  ST3GG (Qwen  │  │  FLUX.2 Klein  │  │  Judge (Gemma │          │
│  │  9B managed   │  │  9B (Modal     │  │  31B managed  │          │
│  │  endpoint)    │  │  L40S Web Fn)  │  │  endpoint)    │          │
│  └───────────────┘  └───────────────┘  └───────────────┘          │
│                                                                     │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │
│  │  Wan 2.2 I2V  │  │  LTX 2.3 I2V  │  │  Kontext      │          │
│  │  (H100)       │  │  (H100)       │  │  Inpaint (L40S)│          │
│  └───────────────┘  └───────────────┘  └───────────────┘          │
│                                                                     │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │
│  │  Lore Database │  │  Taste Profile │  │  Experience   │          │
│  │  (30+ entries) │  │  (Prisma)      │  │  Logger       │          │
│  └───────────────┘  └───────────────┘  └───────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

### Pipeline Flow

```
User Prompt
    │
    ▼
01: Text Prompt Input (tokenizer, ≤2k tokens)
    │
    ▼
02: ST3GG Security Scan (Qwen 9B managed endpoint — text safety, ~3-5s)
    │ (blocked prompts never reach GPU)
    ▼
03: Lore Enhancement (instant, no GPU — taste-profile-aware enrichment)
    │
    ▼
04: FLUX.2 Image Generation (Modal L40S, 4 steps, cfg=1.0, ~2-20s)
    │
    ▼
05: Visual Judge (Gemma 31B managed endpoint — vision quality scoring, ~4-8s)
    │
    ▼
06: Evidence Aggregation (Qwen 9B managed endpoint — structured JSON, ~3-5s)
    │
    ▼
07: Experience Logger + Taste Profile Update (DB write, instant)
    │
    ▼
Output: Gallery image + structured evidence JSON + provenance
```

### Modal Backend Architecture

| App | GPU | Model | Purpose | URL Pattern |
|-----|-----|-------|---------|-------------|
| nexus-flux2-klein9b | L40S | FLUX.2 Klein 9B | Image generation | `--nexus-flux2-klein9b-nexusflux2generator-generate.modal.run` |
| nexus-wan22-i2v | H100 | Wan 2.2 I2V | Video generation | `--nexus-wan22-i2v-nexuswan22generator-web-app.modal.run` |
| nexus-ltx23-i2v | H100 | LTX-Video | Video generation | `--nexus-ltx23-i2v-nexusltx23generator-web-app.modal.run` |
| nexus-kontext-inpaint | L40S | FLUX.1 Kontext-dev | Inpainting | `--nexus-kontext-inpaint-nexuskontextinpaint-web-app.modal.run` |
| qwen3-5-9b (managed) | — | Qwen 9B Unredacted | ST3GG + Evidence | `--ep-qwen3-5-9b-unredacted-max-server.us-west.modal.direct` |
| gemma-4-31b (managed) | — | Gemma 31B Heretic | Visual Judge | `--ep-gemma-4-31b-it-uncensored-heretic-server.us-west.modal.direct` |
| brisk-4b (managed) | — | Brisk Evolution 4B | Prompt enhancement | `--ep-brisk-evolution-4b-v0-1-server.us-west.modal.direct` |

---

## 3. Directory Structure

```
NEXUS_WEAVER/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout (metadata, theme, suppressHydrationWarning)
│   │   ├── page.tsx                # Main page (renders NexusAppShell)
│   │   └── api/                    # API Routes (all server-side, Node.js runtime)
│   │       ├── pipeline/
│   │       │   ├── run/route.ts    # POST: creates PipelineJob, fires background worker
│   │       │   └── jobs/[id]/route.ts # GET: poll job status
│   │       ├── modal/
│   │       │   ├── status/route.ts # GET: FLUX.2 + brain health (cached 5min)
│   │       │   ├── warmup/route.ts # POST: warm FLUX.2 + brain endpoints
│   │       │   ├── warm-endpoints/route.ts # GET/POST: endpoint warm-up system
│   │       │   ├── engine-manager/route.ts # GET/POST: deploy/stop Modal apps
│   │       │   ├── budget/route.ts # GET/POST: Modal credit tracking
│   │       │   └── usage/route.ts  # GET: Modal usage stats
│   │       ├── prompt/
│   │       │   ├── enhance/route.ts     # POST: Brisk 4B prompt expansion
│   │       │   ├── reverse/route.ts     # POST: Gemma 31B image→prompt
│   │       │   └── enhance-lore/route.ts # POST/GET: lore-aware enrichment
│   │       ├── brain/
│   │       │   └── analyze/route.ts     # POST: Brain Assistant analysis
│   │       ├── aeon/
│   │       │   ├── advice/route.ts      # POST: AEON advisory (legacy)
│   │       │   ├── judge/route.ts       # POST: AEON judge (legacy)
│   │       │   └── workflow-advice/route.ts # POST: workflow presets (legacy)
│   │       ├── video/
│   │       │   ├── run/route.ts         # POST: video generation (sync)
│   │       │   └── i2v/route.ts         # POST: video generation (async job)
│   │       ├── inpaint/run/route.ts     # POST: FLUX.1 Kontext inpainting
│   │       ├── gallery/route.ts         # GET: list generations
│   │       ├── gallery/[id]/route.ts    # GET: single generation detail
│   │       ├── image/[id]/route.ts      # GET: serve image from DB
│   │       ├── calibration/route.ts     # GET: list calibration presets
│   │       ├── engines/route.ts         # GET: list engines
│   │       ├── library/route.ts         # GET: LoRA library
│   │       ├── lora/scrape/route.ts     # POST: scrape HF/Civitai for LoRA metadata
│   │       ├── metrics/route.ts         # GET: dashboard metrics
│   │       ├── metrics-history/route.ts # GET: historical metrics
│   │       ├── audit/route.ts           # GET: audit event log
│   │       ├── health/route.ts          # GET: system health check
│   │       ├── policy/route.ts          # GET/POST: safety policy config
│   │       ├── consent/route.ts         # GET/POST: 18+ consent management
│   │       └── ocr/route.ts             # POST: OCR via z-ai vision
│   ├── components/
│   │   ├── nexus/
│   │   │   ├── app-shell.tsx       # Main layout shell (sidebar nav + content area)
│   │   │   ├── studio-view.tsx     # Generation studio (5000+ lines — main UI)
│   │   │   ├── store.ts            # Zustand store (client state management)
│   │   │   ├── gallery-view.tsx    # Gallery archive view
│   │   │   ├── compliance-view.tsx # Safety/compliance dashboard
│   │   │   ├── cost-lab-view.tsx   # Modal budget/cost management
│   │   │   ├── command-view.tsx    # Command center overview
│   │   │   ├── pipeline-view.tsx   # Pipeline flow visualization
│   │   │   ├── monitor-view.tsx    # System monitor
│   │   │   ├── library-view.tsx    # LoRA library browser
│   │   │   ├── consent-gate.tsx    # 18+ consent modal
│   │   │   ├── command-palette.tsx # ⌘K command palette
│   │   │   ├── charts.tsx          # Recharts components
│   │   │   ├── score-ring.tsx      # Circular score display
│   │   │   └── verdict-badge.tsx   # Approved/rejected badge
│   │   ├── ui/                     # shadcn/ui components (button, card, etc.)
│   │   └── providers.tsx           # React Query + theme providers
│   ├── lib/
│   │   ├── pipeline.ts             # Core pipeline (ST3GG → Lore → FLUX → Judge → Evidence)
│   │   ├── pipeline-job-worker.ts  # Background worker for async pipeline jobs
│   │   ├── modal-client.ts         # Modal API client (generateImageViaModal, callModalBrain)
│   │   ├── engine-manager.ts       # Modal app deploy/stop/status via CLI subprocess
│   │   ├── endpoint-warmup.ts      # Smart endpoint warm-up + retry system
│   │   ├── secrets.ts              # All endpoint URLs + token references (reads from env)
│   │   ├── calibration.ts          # FLUX calibration presets (steps, cfg, sampler, LoRA weight)
│   │   ├── engines.ts              # Engine catalog (FLUX.2, Krea 2, Z-Image, etc.)
│   │   ├── lora-library.ts         # Curated LoRA catalog (50+ entries with HF repo IDs)
│   │   ├── brain.ts                # Brain model catalog (Qwen 9B, Gemma 31B, Brisk 4B)
│   │   ├── brain-assistant.ts      # Local + deep brain analysis (LoRA compat checks)
│   │   ├── brain-client.ts         # Legacy brain client (has tsc error, not used)
│   │   ├── video-pipeline.ts       # Video I2V pipeline (Wan 2.2, LTX 2.3)
│   │   ├── taste-profile.ts        # Evolving user preference vector (Prisma)
│   │   ├── experience-logger.ts    # Generation experience logging (MeGA LoRA training data)
│   │   ├── wardrobe-intelligence.ts # Wardrobe parsing + adherence checking
│   │   ├── lore/
│   │   │   └── lore-database.ts    # 30+ curated lore entries (garments, footwear, etc.)
│   │   ├── aeon/
│   │   │   ├── prompts.ts          # Brain role system prompts
│   │   │   └── client.ts           # AEON client (legacy, has tsc error)
│   │   ├── db.ts                   # Prisma client singleton
│   │   ├── zai.ts                  # z-ai SDK singleton (used for prompt enhance fallback, OCR)
│   │   ├── modal-budget.ts         # Modal credit budget tracking
│   │   ├── modal-strategy.ts       # Modal GPU selection strategy
│   │   ├── nexus-types.ts          # Shared types (PipelineResponse, StageDef, etc.)
│   │   ├── policy.ts               # Safety policy management
│   │   ├── metrics.ts              # System metrics collection
│   │   ├── ocr.ts                  # OCR via z-ai vision
│   │   ├── kontext-client.ts       # FLUX.1 Kontext client (legacy)
│   │   ├── novita-client.ts        # Novita AI client (legacy)
│   │   ├── browserless-client.ts   # Browserless scraping client
│   │   ├── lora-scraper.ts         # HF/Civitai LoRA metadata scraper
│   │   ├── success-prompts.ts      # Success message templates
│   │   └── utils.ts                # Shared utilities (cn, formatters)
│   └── types/
│       └── aeon.ts                 # AEON type definitions
├── modal-apps/                     # Python Modal deployment scripts
│   ├── nexus_flux2_klein9b.py      # FLUX.2 Klein 9B (L40S) — primary image engine
│   ├── nexus_wan22_i2v.py          # Wan 2.2 I2V (H100) — video
│   ├── nexus_ltx23_i2v.py          # LTX 2.3 (H100) — video
│   ├── nexus_kontext_inpaint.py    # FLUX.1 Kontext (L40S) — inpaint
│   ├── nexus_krea2_turbo.py        # Krea 2 Turbo (H100) — image (stopped)
│   ├── nexus_zimage_turbo.py       # Z-Image Turbo (H100) — image (stopped)
│   ├── nexus_brain_vllm.py         # Qwen 9B vLLM (L40S) — brain (stopped, using managed endpoint)
│   ├── nexus_creative_brain.py     # Gemma 31B vLLM (L40S) — brain (stopped, using managed endpoint)
│   ├── nexus_brain_gemma4.py       # Gemma 4 brain (stopped, legacy)
│   ├── nexus_flux1_schnell.py      # FLUX.1 Schnell (stopped, legacy)
│   ├── nexus_kontext_refine.py     # Kontext refine (stopped, legacy)
│   └── deploy_all.sh               # Bulk deploy script
├── prisma/
│   └── schema.prisma               # Database schema (9 models)
├── docs/                           # Documentation
│   ├── BRAIN_RESEARCH.md           # Brain model research findings
│   ├── BRAIN_CURATION_ANALYSIS.md  # User's curated model analysis
│   ├── CREATIVE_BRAIN_ARCHITECTURE.md # Creative brain system design
│   └── VERSION_CONTROL.md          # Git workflow guide
├── scripts/                        # Utility scripts
│   ├── restore-env.sh              # Restore .env from GitHub Secrets
│   └── push-env-to-github.sh       # Push .env to GitHub Secrets
├── handoff/                        # Agent handoff system
│   ├── handoff_protocol.json       # State transfer schema
│   ├── checklist.md                # Pre/post handoff verification
│   └── template_handoff.md         # Fill-in-the-blank template
├── .github/                        # GitHub config
│   ├── CONTRIBUTING.md             # Contribution guide
│   ├── CODE_OF_CONDUCT.md          # Code of conduct
│   ├── ISSUE_TEMPLATE/             # Issue templates
│   └── workflows/                  # CI workflows
├── AGENTS.md                       # AI agent onboarding guide
├── HANDOFF.md                      # This document
├── .env.example                    # Environment variable template
├── .gitignore                      # Git ignore rules
├── package.json                    # Dependencies + scripts
├── tsconfig.json                   # TypeScript config
├── next.config.ts                  # Next.js config
├── tailwind.config.ts              # Tailwind config
├── eslint.config.mjs              # ESLint config
└── README.md                       # Project README
```

---

## 4. Setup & Installation

### Prerequisites

- **Node.js** 20+ (or Bun runtime)
- **Python** 3.12+ (for Modal CLI)
- **Modal.com** account with API tokens
- **HuggingFace** account with access token (for gated models)
- **Git** with access to https://github.com/specimba/NEXUS_WEAVER

### Step-by-Step Setup

```bash
# 1. Clone the repo
git clone https://github.com/specimba/NEXUS_WEAVER.git
cd NEXUS_WEAVER

# 2. Install dependencies
bun install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your Modal tokens, HF token, etc.

# 4. Set up Modal CLI
pip install modal
modal token set --token-id YOUR_TOKEN_ID --token-secret YOUR_TOKEN_SECRET

# 5. Create Modal secrets (for HF token access in Modal apps)
modal secret create huggingface-secret HF_TOKEN=hf_your_token_here

# 6. Create Modal volume (for model weight caching)
modal volume create hf-hub-cache

# 7. Deploy the FLUX.2 image generation app
modal deploy modal-apps/nexus_flux2_klein9b.py

# 8. Create the database
bun run db:push

# 9. Start the dev server
bun run dev

# 10. Open the preview panel (port 3000)
```

### Environment Variables (.env)

See `.env.example` for the full template. Critical variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path (`file:/path/to/custom.db`) |
| `MODAL_USE` | Yes | Set to `true` to use Modal GPU |
| `MODAL_FLUX2_URL` | Yes | FLUX.2 generate endpoint URL |
| `MODAL_TOKEN_ID` | Yes | Modal API token ID (ak-...) |
| `MODAL_TOKEN_SECRET` | Yes | Modal API token secret (as-...) |
| `MODAL_PROXY_KEY` | Yes | Modal proxy token key (wk-...) — for managed endpoints |
| `MODAL_PROXY_SECRET` | Yes | Modal proxy token secret (ws-...) |
| `HF_TOKEN` | Yes | HuggingFace access token (for gated models) |
| `MODAL_BRAIN_URL` | Yes | Qwen 9B managed endpoint URL |
| `MODAL_JUDGE_URL` | Yes | Gemma 31B managed endpoint URL |
| `MODAL_CREATIVE_URL` | Yes | Brisk 4B managed endpoint URL |
| `MODAL_WAN22_URL` | No | Wan 2.2 video endpoint (for video) |
| `MODAL_LTX23_URL` | No | LTX 2.3 video endpoint (for video) |
| `MODAL_INPAINT_URL` | No | Kontext inpaint endpoint |

---

## 5. Configuration

### Prisma Schema (prisma/schema.prisma)

9 models:
- **Generation** — main image generation record (prompt, image, scores, seed)
- **SafetyScan** — ST3GG safety scan results
- **JudgeReport** — Visual judge scores
- **AuditEvent** — system audit log
- **MetricSample** — time-series metrics
- **ConsentRecord** — 18+ consent tracking
- **PipelineJob** — async pipeline job tracking
- **PolicyConfig** — safety policy configuration
- **TasteProfile** — evolving user preference vector
- **ExperienceLog** — generation experience records (MeGA LoRA training data)

### Calibration Presets (src/lib/calibration.ts)

12 presets covering different quality/style tradeoffs:
- Studio Draft (fast iteration, 4 steps)
- Studio Quality (recommended default)
- Cinematic Grade (film aesthetic, refiner pass)
- Photoreal Portrait (skin-accurate)
- Anime/Illustration, Concept Art
- Krea 2 Turbo, Z-Image Turbo (alternative engines)

**Key params for FLUX.2 Klein 9B** (research-confirmed July 2026):
- Steps: **4** (more steps DEGRADE quality on distilled model)
- CFG: **1.0** (higher breaks distilled output)
- Sampler: **euler** (FLUX.2 uses flow matching, not traditional diffusion)
- Scheduler: **simple**
- LoRA weight: **0.45** (was 0.8 — too high caused homogeneous images)
- Max LoRAs: **3** (community consensus — 6+ causes interference)

### Modal App Configuration

All Modal apps use the `@app.cls` pattern with:
- `@modal.enter()` — model loading (runs once per container)
- `@modal.asgi_app()` — FastAPI routes (health, generate)
- `scaledown_window=300` (5 min for image, 5 min for video)
- `min_containers=0` (scale to zero when idle)
- `max_containers=1` (single container per app)
- Shared `hf-hub-cache` volume for fast cold starts

---

## 6. Codebase Map

### Entry Points

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main page → renders `NexusAppShell` |
| `src/app/layout.tsx` | Root layout (metadata, theme, body) |
| `src/lib/pipeline.ts` | Core pipeline logic (7 stages) |
| `src/lib/modal-client.ts` | Modal API client (image gen + brain calls) |
| `src/components/nexus/store.ts` | Zustand store (all client state) |

### Key Modules

#### `src/lib/pipeline.ts` (~1050 lines)
The core pipeline. 7 stages executed sequentially:
1. `stageSt3gg()` — safety scan via Qwen 9B managed endpoint
2. Lore enhancement — matches prompt against lore database
3. `stageFlux()` → `generateImageViaModal()` — image generation
4. `stageJudge()` — visual quality scoring via Gemma 31B managed endpoint
5. `stageEvidence()` — structured evidence aggregation via Qwen 9B
6. Experience logger + taste profile update
7. Return structured output

**Important**: No z-ai fallback in brain stages. If managed endpoint is cold, throws clear error.

#### `src/lib/modal-client.ts` (~620 lines)
- `generateImageViaModal()` — calls FLUX.2 Modal endpoint with LoRAs
- `callModalBrain()` — calls managed endpoints with role-based routing (st3gg/judge/evidence/creative)
- `resolveBackend()` — maps engineId to correct Modal app URL
- `checkModalHealth()` — cached health check (5min TTL)
- Uses `endpoint-warmup.ts` for retry+backoff (no z-ai fallback)

#### `src/components/nexus/studio-view.tsx` (~5300 lines)
The main UI. Contains:
- EnginePicker (image/edit/video tabs, deploy status dots)
- PromptArea (prompt input, enhance, templates, Prompt+ expand/reverse)
- CalibrationStrip (preset selection, advanced overrides)
- LoRAStack (per-LoRA weight sliders, enable/disable)
- BrainAssistantCard (local + deep analysis)
- ResultPanel (generated image, scores, provenance)
- VideoStepCard (I2V video generation)
- InpaintPanel (mask + redraw)
- ProvenanceCard (calibration, LoRAs, seed display)
- PipelineStages (live stage progress)

#### `src/lib/endpoint-warmup.ts` (~200 lines)
Smart endpoint warm-up system:
- `preWarmAllEndpoints()` — pings all 4 endpoints (FLUX.2 + 3 brain) on page load
- `callEndpointWithRetry()` — retries 3× with backoff (5s, 10s, 15s) on 503
- `pingEndpoint()` — checks if endpoint is warm/cold/warming
- In-memory status cache (30s TTL)

#### `src/lib/engine-manager.ts` (~300 lines)
Modal app lifecycle management:
- `getEngineStatuses()` — checks which apps are deployed via `modal app list --json`
- `deployEngine()` — runs `modal deploy <file>` via subprocess
- `stopEngine()` — runs `modal app stop <name>` via subprocess
- `ensureEngineDeployed()` — auto-deploys if stopped (including always-on FLUX.2)

### Testing Patterns

No formal test suite exists. Testing is done via:
1. **Agent Browser** — end-to-end verification of the running app
2. **Manual API testing** — `curl` against API routes
3. **Modal log inspection** — checking Modal dashboard logs for errors
4. **Type checking** — `bunx tsc --noEmit` (1 pre-existing error in brain-client.ts)
5. **Linting** — `bun run lint` (ESLint)

---

## 7. Workflows

### Development Workflow

```bash
# 1. Start dev server
bun run dev

# 2. Make changes to src/ files

# 3. Check types
bunx tsc --noEmit

# 4. Check lint
bun run lint

# 5. Test via Agent Browser
agent-browser open http://localhost:3000/
agent-browser snapshot -c

# 6. Commit (GPG signing disabled in sandbox)
git add -A
git commit -m "fix: description of change"
git push origin main
```

### Deployment Workflow (Modal)

```bash
# Deploy FLUX.2 (primary image engine)
modal deploy modal-apps/nexus_flux2_klein9b.py

# Deploy video backends (only when needed — H100 is expensive)
modal deploy modal-apps/nexus_wan22_i2v.py
modal deploy modal-apps/nexus_ltx23_i2v.py

# Deploy inpaint backend
modal deploy modal-apps/nexus_kontext_inpaint.py

# Stop apps when not in use (saves credits)
modal app stop nexus-wan22-i2v -y
```

### Managed Endpoints (brain models)

Managed endpoints are deployed via Modal dashboard (not CLI):
- `qwen3-5-9b-unredacted-max` — ST3GG + Evidence
- `gemma-4-31b-it-uncensored-heretic` — Visual Judge
- `brisk-evolution-4b-v0-1` — Prompt enhancement

These scale to zero automatically. The warm-up system pings them on page load.

### Agent Workflow

1. **Read `worklog.md`** — understand what previous agents did
2. **Check `dev.log`** — see current server state
3. **Run `bun run dev`** — start the dev server
4. **Make changes** — edit files in `src/`
5. **Test** — use Agent Browser to verify
6. **Commit** — `git add -A && git commit -m "..." && git push`
7. **Append to `worklog.md`** — document what was done

---

## 8. Handoff Protocols

### State Persistence

| State | Location | Survives Reset? |
|-------|----------|-----------------|
| Source code | Git + GitHub | ✅ Yes |
| .env file | Local disk only | ❌ No (use `scripts/restore-env.sh`) |
| Modal CLI auth | `~/.modal.toml` | ❌ No (re-auth with `modal token set`) |
| GitHub auth | `~/.git-credentials` | ❌ No (re-set with PAT) |
| GPG signing key | `~/.gnupg/` | ❌ No (disabled: `git config commit.gpgsign false`) |
| Database | `db/custom.db` | ❌ No (recreate with `bun run db:push`) |
| Generated images | `public/gallery/` | ❌ No (stored in DB as base64) |
| Modal volume cache | Modal `hf-hub-cache` volume | ✅ Yes (persists across container restarts) |

### Post-Reset Recovery

After a sandbox reset, run:

```bash
# 1. Restore .env
cp .env.example .env
# Edit with real token values

# 2. Restore Modal CLI
pip install modal
modal token set --token-id ak-... --token-secret as-...

# 3. Restore GitHub auth
git config credential.helper store
echo "https://specimba:github_pat_...@github.com" > ~/.git-credentials
chmod 600 ~/.git-credentials
git config commit.gpgsign false
git config tag.gpgsign false

# 4. Restore database
bun run db:push

# 5. Deploy FLUX.2
modal deploy modal-apps/nexus_flux2_klein9b.py

# 6. Start dev server
bun run dev
```

### Agent-to-Agent Handoff

See `handoff/handoff_protocol.json` for the state transfer schema. See `handoff/template_handoff.md` for the fill-in-the-blank template. See `handoff/checklist.md` for verification steps.

---

## 9. Testing Strategy

### Current State

No formal test suite. All testing is manual:

| Test Type | Method | Coverage |
|-----------|--------|----------|
| Type checking | `bunx tsc --noEmit` | All .ts/.tsx files (1 pre-existing error in brain-client.ts) |
| Linting | `bun run lint` | All files (ESLint) |
| E2E | Agent Browser | Page loads, console errors, UI rendering |
| API | curl | Individual endpoint testing |
| Integration | Manual pipeline run | Full ST3GG → FLUX → Judge → Evidence cycle |

### Recommended Test Additions

1. Unit tests for `calibration.ts` (preset resolution, override merging)
2. Unit tests for `lore-database.ts` (matching engine, pairing logic)
3. Integration tests for API routes (mock Modal responses)
4. E2E tests for full pipeline (Agent Browser automation)

---

## 10. Known Issues & Roadmap

### Known Issues

| Issue | Impact | Status |
|-------|--------|--------|
| Managed endpoints go cold (503) after ~10 min idle | Brain stages fail if endpoints cold | Mitigated by warm-up system + retry |
| `.env` gets wiped on sandbox reset | Pipeline breaks | Mitigated by `scripts/restore-env.sh` |
| `brain-client.ts` has tsc error | Build warning | Pre-existing, not used (can be deleted) |
| Latent noise injection removed | Less creative variation | Flux2KleinPipeline latent shape mismatch |
| Video untested after WanPipeline fix | Video may still fail | Needs end-to-end test |
| Inpaint untested | Inpaint may fail | Needs end-to-end test |
| Images still somewhat similar | Creative limitation | LoRA weight + count fixes applied; deeper variation needs ComfyUI-style pipeline |

### Roadmap

| Priority | Feature | Effort |
|----------|---------|--------|
| P0 | Test video generation end-to-end | Small |
| P0 | Test inpaint generation end-to-end | Small |
| P1 | Implement structured JSON prompting (Subject+Action+Style+Context) | Medium |
| P1 | Add variation_strength via prompt rotation (change 2 of 4 quadrants per shot) | Medium |
| P1 | Wire multi-reference conditioning (FLUX.2 Klein native) | Large |
| P2 | MeGA LoRA distillation (train custom LoRA from approved generations) | Large |
| P2 | Civitai.red LoRA batch scraping | Medium |
| P2 | UI/UX upgrade: workflow selection, combined LoRA packs, remix pipelines | Large |
| P3 | ComfyUI integration (node graph pipeline) | Very Large |

---

## 11. Contribution Guide

### For Human Contributors

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make changes following the code style (TypeScript, shadcn/ui)
4. Test: `bunx tsc --noEmit && bun run lint`
5. Submit a PR with a clear description

### For AI Agents

1. Read `AGENTS.md` for onboarding
2. Read `worklog.md` for context from previous agents
3. Read this document for architecture understanding
4. Use `handoff/template_handoff.md` when transferring to another agent
5. Always append to `worklog.md` after completing work

### Commit Conventions

```
<type>: <short description>

<longer explanation if needed>

Files changed:
- path/to/file (what changed)
```

Types: `feat`, `fix`, `security`, `chore`, `docs`, `refactor`, `merge`

---

## 12. Troubleshooting

### FLUX.2 returns 404 "invalid function call"
**Cause**: The `nexus-flux2-klein9b` app is stopped.
**Fix**: `modal deploy modal-apps/nexus_flux2_klein9b.py`

### Brain stages return 429 rate limit
**Cause**: z-ai fallback was removed. If you see this, z-ai is still being called somewhere.
**Fix**: Check `pipeline.ts` for any remaining `getZai()` calls in brain stages.

### Managed endpoints return 503
**Cause**: Endpoints scale to zero when idle.
**Fix**: Wait 30-60s for warm-up. The retry system will attempt 3 times with backoff.

### "MODAL_FLUX2_URL is not set"
**Cause**: `.env` was wiped by sandbox reset.
**Fix**: Restore `.env` from `.env.example` with real token values.

### TypeScript error in brain-client.ts
**Cause**: Pre-existing error (`Property 'model' is missing`).
**Fix**: Can be safely ignored or delete `brain-client.ts` (not used).

### Images look homogeneous/generic
**Cause**: Too many LoRAs (max 3 recommended), weights too high (0.45 max), no variation mechanism.
**Fix**: Reduce to 2-3 LoRAs, lower weights to 0.30-0.45, use different prompts between runs.

### Dev server keeps crashing
**Cause**: Sandbox resource limits.
**Fix**: `pkill -f next-server; sleep 2; bun run dev`

### Git push fails with "secret scanning"
**Cause**: Token values in committed files.
**Fix**: Tokens should only be in `.env` (gitignored) or `secrets.ts` (reads from env, no hardcoded values).
