# NEXUS Visual Weaver — Diagnosis + Execution Plan (Task 14)

## Diagnosis (evidence-based)

### What's ACTUALLY broken vs. working

**WORKS (proven):**
- Modal GPU generation: the 14:16 generation completed successfully. Modal log shows `100%|██████████| 8/8 [00:03, 2.59it/s]`. VLM confirms the output is a high-quality gothic-fashion render (patent leather, fur, lace, stained glass).
- The image file exists on disk: `public/gallery/cmr0qcr6i0000pwtc07zq7nck.png` (128KB).
- DB record: status=completed, verdict=approved, tier=safe, imagePath set.

**BROKEN (the user's real complaints):**
1. **Published preview is stale / not updating** — the user checked `https://n1qgt5vm7691-d.space-z.ai/` and saw an old state. The preview may be serving a cached build or the Gallery view has a rendering bug.
2. **Gallery shows a black placeholder** instead of the actual generated image — the image exists on disk but the Gallery view isn't rendering it (likely a path/next/image issue).
3. **"Operation was aborted"** — the frontend fetch to `/api/pipeline/run` is being aborted (timeout or navigation). The pipeline takes 30-60s end-to-end (ST3GG + Modal cold start + judge + evidence). The browser may be timing out.
4. **"Blocked" status** — ST3GG flagged the Grok prompt as `suggestual`/`wardrobe-risk`. With conservative default policy (mature OFF), some prompts block. The user needs clearer feedback on WHY it blocked + a one-click "override for artistic" path.
5. **No image-approval → video step-2 flow** — the pipeline ends at the still image. There's no "approve this image → send to Wan 2.2 / LTX 2.3 for I2V video" workflow.
6. **No our-own NO8D-style control system** — we have LoRA selection but not the NO8D control paradigm: per-LoRA weight sliders, inpainting with masks, A/B preview, prompt-plus (LLM expansion + image-to-prompt).

### Root causes
- RC1: Gallery view likely uses `next/image` with a domain config issue, or the image path has a leading-slash mismatch → black placeholder.
- RC2: The published preview (space-z.ai) may be a separate static build that doesn't reflect dev changes. Need to verify the preview mechanism.
- RC3: No frontend timeout handling — the fetch aborts silently.
- RC4: The ST3GG block path returns `status: "blocked"` but the Studio's blocked-UI doesn't clearly explain "this was blocked for suggestive content, not a system error" + doesn't offer a retry-with-override.
- RC5: No video stage implementation — `videoEnabled` is recorded but no actual I2V generation runs.

## Execution Plan (6 milestones, git commit each)

### M1 — Fix Gallery image rendering (black placeholder bug)
- Diagnose: is it `next/image` domain config? path mismatch? CSS hiding it?
- Fix the Gallery view so the generated PNG actually displays.
- Verify with Agent Browser: open Gallery, see the real image.
- `git commit -m "M1: fix Gallery black-placeholder image rendering"`

### M2 — Fix frontend timeout + add progress feedback
- The pipeline takes 30-60s. Add: (a) explicit fetch timeout = 300s, (b) live progress
  via the existing stage-polling, (c) "still working..." indicator, (d) no silent abort.
- Verify: run a generation, watch it complete without abort.
- `git commit -m "M2: fix frontend timeout + live progress feedback"`

### M3 — Improve blocked-status UX + artistic-override path
- When ST3GG blocks: show the flags + rationale clearly, offer "Retry as artistic
  reference (non-distributable)" which re-runs with a temporary policy override
  (still subject to the hard blocklist).
- `git commit -m "M3: improve blocked UX + artistic-override retry"`

### M4 — Build image-approval → video step-2 flow
- After a completed generation: "Approve & Animate →" button.
- Opens a video-config panel: pick video engine (Wan 2.2 / LTX 2.3 / etc.),
  motion prompt, duration. Sends to a new `/api/video/run` endpoint.
- The video stage uses the approved image as the I2V input.
- `git commit -m "M4: image-approval to video step-2 workflow"`

### M5 — Build our-own NO8D-style control system (NOT ComfyUI)
- Per-LoRA weight sliders (not one global loraWeight).
- Inpainting: mask-draw canvas + denoise strength + local edit.
- A/B preview: split-line comparison of two generations.
- Prompt-plus: LLM prompt expansion + image-to-prompt reverse engineering.
- `git commit -m "M5: NO8D-style control system (our own, not ComfyUI)"`

### M6 — Final verification + published-preview check
- Agent Browser end-to-end: generate → see image → approve → animate → see video.
- Check the published preview is updating.
- `git commit -m "M6: final verification"`
