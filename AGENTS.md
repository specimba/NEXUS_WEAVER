# AGENTS.md — AI Agent Onboarding Guide

> **Read this first.** This file tells you how to self-contextualize in this project.

## Quick Context

You are working on **NEXUS Visual Weaver** — a Next.js 16 + Modal GPU image generation pipeline. The project uses FLUX.2 Klein 9B for image generation, with uncensored brain models for safety scanning, quality judging, and evidence aggregation.

## First Steps (Do These Immediately)

1. **Read `HANDOFF.md`** — comprehensive project documentation
2. **Read `worklog.md`** (tail the last 2-3 entries) — see what previous agents did
3. **Check `.env`** — verify it has tokens (if not, run `scripts/restore-env.sh`)
4. **Start dev server** — `bun run dev`
5. **Verify it works** — `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/` should return 200

## Critical Rules

1. **NEVER use z-ai SDK as a fallback** for brain stages. It causes 429 rate limits and masks real problems. If a managed endpoint is cold, throw a clear error.
2. **NEVER commit `.env`** to git. It contains real tokens.
3. **NEVER deploy H100 Modal apps** unless explicitly asked. They're expensive. FLUX.2 on L40S is the only always-on app.
4. **NEVER increase FLUX.2 steps above 4**. More steps DEGRADE quality on the distilled model (research-confirmed).
5. **NEVER increase LoRA weights above 0.5** when stacking. Max 3 LoRAs recommended (community consensus).
6. **ALWAYS append to `worklog.md`** after completing work.
7. **ALWAYS use `git config commit.gpgsign false`** (GPG key doesn't survive sandbox resets).
8. **ALWAYS test with Agent Browser** before claiming something works.

## Architecture Summary

```
User → Studio UI → API Route → Pipeline (ST3GG → Lore → FLUX.2 → Judge → Evidence)
```

- **ST3GG**: Qwen 9B managed endpoint (text safety)
- **FLUX.2**: Modal L40S Web Function (image generation)
- **Judge**: Gemma 31B managed endpoint (vision quality scoring)
- **Evidence**: Qwen 9B managed endpoint (structured JSON aggregation)
- **Lore**: Instant, no GPU (database matching + taste profile)

## Key Files to Know

| File | What It Does |
|------|-------------|
| `src/lib/pipeline.ts` | Core 7-stage pipeline |
| `src/lib/modal-client.ts` | Modal API calls (image + brain) |
| `src/lib/secrets.ts` | All endpoint URLs (reads from env) |
| `src/lib/endpoint-warmup.ts` | Smart warm-up + retry system |
| `src/lib/calibration.ts` | FLUX.2 presets (steps, cfg, LoRA weights) |
| `src/components/nexus/studio-view.tsx` | Main UI (5300+ lines) |
| `modal-apps/nexus_flux2_klein9b.py` | FLUX.2 Modal app (Python) |

## Handoff Checklist

When transferring to another agent, fill out `handoff/template_handoff.md` with:
- What you changed
- What's working / broken
- What the next agent should do
- Any blockers or warnings

## State File

The project state is tracked in:
- `worklog.md` — append-only work log
- `db/custom.db` — SQLite database (generations, jobs, taste profile)
- Git history + tags (v5.28 through v5.37)

## Common Mistakes to Avoid

1. **Don't edit multiple files rapidly** — the Z.ai platform redeploys on every file change, causing preview refreshes. Make all changes in one batch.
2. **Don't forget to restore `.env`** after sandbox reset — it gets wiped.
3. **Don't call z-ai in the brain pipeline** — it causes 429 rate limits.
4. **Don't stack more than 3 LoRAs** — it causes homogeneous images.
5. **Don't use DPM++ 2M sampler** — FLUX.2 uses flow matching, Euler is correct.
