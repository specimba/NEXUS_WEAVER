# NEXUS Visual Weaver

![Status](https://img.shields.io/badge/status-active%20development-cyan)
![Version](https://img.shields.io/badge/version-v5.37-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![GPU](https://img.shields.io/badge/GPU-Modal%20L40S%20%2B%20H100-orange)
![Brain](https://img.shields.io/badge/brain-Qwen%209B%20%2B%20Gemma%2031B%20%2B%20Brisk%204B-purple)

> Governed multi-agent visual creation pipeline on Modal GPU. FLUX.2 Klein 9B generates, uncensored brain models scan, judge, and structure — automatically.

## Table of Contents

- [Quick Start](#quick-start)
- [What Is This?](#what-is-this)
- [Architecture](#architecture)
- [Setup](#setup)
- [Available Scripts](#available-scripts)
- [Agent Integration](#agent-integration)
- [Contributing](#contributing)
- [License](#license)

## Quick Start

```bash
git clone https://github.com/specimba/NEXUS_WEAVER.git
cd NEXUS_WEAVER
bun install
cp .env.example .env  # Fill in your tokens
bun run db:push
modal deploy modal-apps/nexus_flux2_klein9b.py
bun run dev
```

Open the preview panel on port 3000.

## What Is This?

NEXUS Visual Weaver is a production-grade image generation pipeline that combines:

- **FLUX.2 Klein 9B** — Black Forest Labs' 9B flagship model (4 steps, cfg 1.0)
- **Uncensored Brain Stack** — Qwen 9B (safety), Gemma 31B heretic (judge), Brisk 4B (creative)
- **Lore System** — 30+ curated aesthetic entries (garments, footwear, hairstyles, colors, composition)
- **Taste Profile** — Evolving preference vector that learns from approved/rejected generations
- **Experience Logger** — Records every generation for future MeGA LoRA distillation
- **Smart Engine Rotator** — Auto-deploys/stops Modal apps based on user selection
- **Video I2V** — Wan 2.2 + LTX 2.3 on H100
- **Inpaint** — FLUX.1 Kontext-dev on L40S

### Pipeline Flow

```
Prompt → ST3GG (Qwen 9B) → Lore Enhancement → FLUX.2 (L40S) → Judge (Gemma 31B) → Evidence (Qwen 9B) → Gallery
```

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Next.js 16   │────▶│  API Routes   │────▶│  Prisma/SQLite│
│  React 19 +   │◀────│  /api/pipeline│◀────│  9 models    │
│  shadcn/ui    │     │  /api/modal/* │     └──────────────┘
└──────────────┘     └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │  FLUX.2 Klein │ │  Qwen 9B     │ │  Gemma 31B   │
     │  9B (L40S)   │ │  (managed)   │ │  (managed)   │
     │  Image Gen    │ │  ST3GG+Ev    │ │  Judge       │
     └──────────────┘ └──────────────┘ └──────────────┘
```

## Setup

### Prerequisites

- Node.js 20+ or Bun
- Python 3.12+ (for Modal CLI)
- Modal.com account
- HuggingFace account (for gated models)

### Detailed Setup

See [`HANDOFF.md`](./HANDOFF.md) for the comprehensive setup guide including:
- Environment variables
- Modal deployment
- Database creation
- Post-reset recovery

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server (port 3000) |
| `bun run lint` | Run ESLint |
| `bun run db:push` | Push Prisma schema to database |
| `bun run db:generate` | Generate Prisma client |
| `bun run build` | Production build |
| `bunx tsc --noEmit` | Type check |

### Modal Deployment

```bash
# Deploy FLUX.2 (primary image engine — L40S)
modal deploy modal-apps/nexus_flux2_klein9b.py

# Deploy video backends (H100 — deploy only when needed)
modal deploy modal-apps/nexus_wan22_i2v.py
modal deploy modal-apps/nexus_ltx23_i2v.py

# Deploy inpaint backend (L40S)
modal deploy modal-apps/nexus_kontext_inpaint.py

# Stop apps to save credits
modal app stop nexus-wan22-i2v -y
```

## Agent Integration

This project is designed for AI agent collaboration. Key files:

| File | Purpose |
|------|---------|
| [`AGENTS.md`](./AGENTS.md) | AI agent onboarding guide |
| [`HANDOFF.md`](./HANDOFF.md) | Comprehensive project documentation |
| [`handoff/`](./handoff/) | Handoff protocol, checklists, templates |
| `worklog.md` | Append-only work log (read before starting) |

### Agent Workflow

1. Read `AGENTS.md` for rules
2. Read `HANDOFF.md` for architecture
3. Read `worklog.md` (last 3 entries) for context
4. Make changes in ONE batch (platform redeploys on each file change)
5. Test with Agent Browser
6. Commit + push
7. Append to `worklog.md`

## Contributing

See [`CONTRIBUTING.md`](./.github/CONTRIBUTING.md) for guidelines.

### Key Rules

- Max 3 LoRAs (community consensus — 6+ causes interference)
- LoRA weights: 0.30-0.50 each (was 0.80 — too high caused homogeneous images)
- FLUX.2: 4 steps, cfg 1.0, Euler sampler (flow matching, not traditional diffusion)
- No z-ai fallback in brain pipeline (causes 429 rate limits)
- No H100 deploys without explicit instruction (expensive)

## License

MIT License — see [LICENSE](./LICENSE) file.

## Acknowledgments

- [Black Forest Labs](https://blackforestlabs.ai/) for FLUX.2 Klein 9B
- [Modal](https://modal.com/) for GPU infrastructure
- [HuggingFace](https://huggingface.co/) for model hosting
- The ComfyUI community for workflow research and best practices
