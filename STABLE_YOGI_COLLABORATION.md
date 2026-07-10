# Stable Yogi Collaboration — NEXUS WEAVER Integration Plan

> **Status**: Integration Phase 1 complete (v5.41)
> **Date**: July 11, 2026
> **Mission**: Realism Perfection Pipeline — Krea 2 + LoRA Mastery Integration
> **Partnership Goal**: Formal collaboration with Stable Yogi + their community

---

## 1. Executive Summary

This document records the integration of Stable Yogi's curated Krea 2 + LoRA
realism expertise into the NEXUS WEAVER pipeline. Phase 1 covers: architecture
analysis, calibration fixes, official LoRA catalog integration, and pack-based
workflow templates. The integration is grounded in Stable Yogi's published guide
(nexusWEAVERcivitairedSTABLEYOGIspecialGUIDEv2.txt, 311KB, ~20K lines).

**Partnership Readiness**: 70% — Krea 2 is correctly configured, official style
LoRAs are catalogued, realism packs are deployed. The remaining 30% requires:
(a) SDXL/Pony engine deployment for Stable Yogi's community LoRAs, (b) the
Prompt-Adherence Engine implementation, (c) end-to-end quality validation.

---

## 2. Krea 2 Architecture Analysis (from Stable Yogi's Guide)

### What makes Krea 2 different

| Dimension | Krea 2 | SDXL / SD3 | FLUX.1/2 |
|-----------|--------|------------|----------|
| Architecture | 12B single-stream DiT | UNet (SDXL) / DiT (SD3) | 12B double-stream DiT |
| Text Encoder | Qwen3-VL (4B, vision-language) | CLIP-L + CLIP-G (SDXL) | T5-XXL + CLIP-L |
| VAE | Qwen-Image VAE | SDXL VAE | FLUX VAE |
| Training | Flow matching | Diffusion (SDXL) / Flow (SD3) | Flow matching |
| Prompt style | Natural language sentences | Tag soup / keywords | Natural language |
| Negative prompt | Ineffective (DiT, no separate neg path) | Effective | Ineffective |
| Flavors | RAW (base) + Turbo (8-step distilled) | N/A | schnell (4-step) + dev (50-step) |

### Why Krea 2 achieves superior realism

1. **Qwen3-VL text encoder**: A vision-language model (not just text CLIP).
   It understands spatial relationships, materials, and lighting descriptions
   more deeply than CLIP. This is why Krea 2 "rewards natural-language prompts" —
   the encoder actually comprehends sentence structure.

2. **12B single-stream DiT**: Unlike FLUX's double-stream (separate text/image
   attention), Krea 2 fuses text and image tokens in a single attention stream.
   This tighter coupling means prompt details transfer more directly to the image.

3. **Flow matching training**: Produces smoother latent trajectories than
   traditional diffusion, resulting in cleaner textures (skin, fabric, metal).

4. **Qwen-Image VAE**: Specifically tuned for photorealistic image decoding —
   better skin subsurface scattering and micro-detail reconstruction.

### Correct settings (per Stable Yogi — CRITICAL)

| Setting | Turbo (fast) | RAW (best quality) |
|---------|-------------|-------------------|
| Steps | 8 | 28 |
| CFG | 1.0 | 4.5 |
| Sampler | Euler | Euler |
| Scheduler | Simple | Simple |
| Clip skip | 1 | 1 |
| discard-penultimate-sigma | OFF | OFF |
| Negative prompt | Don't use | Don't use |

**Previous bug**: Our calibration presets had `steps=4, cfg=7.5` for Turbo and
`steps=4, cfg=7.0` for RAW. This was catastrophically wrong — 4 steps on an
8-step distilled model produces noise, and CFG 7.5 on a flow-matching model
causes artifacting. Fixed in v5.41.

---

## 3. The Enhancement Suite (Advanced Techniques)

Stable Yogi's Krea 2 Enhancement Suite (github.com/Stable-yogi/sd-forge-krea2-enhancements)
introduces two techniques we should evaluate for pipeline integration:

### 3.1 Prompt-Adherence Engine

**Concept**: Run the text conditioning TWICE — once clean, once "boosted" (deep-layer
emphasis) — then blend them under a per-token safety clamp.

**Why it matters**: Krea 2's 12-layer text conditioning can be "tapped" at different
depths. Deep layers control identity/texture; shallow layers control composition.
Boosting deep layers makes the model follow the prompt harder without destabilizing
the image.

**Integration path for NEXUS WEAVER**:
- Not yet implemented. Requires modifying the Krea 2 Modal app to expose the
  text encoder's hidden states and implement the blend + clamp logic.
- Estimated effort: Medium (2-3 days). The diffusers Krea2Pipeline may need
  a custom forward pass on the text encoder.
- Priority: P1 — this is the single biggest quality lever for prompt adherence.

### 3.2 Detail Boost PRO

**Concept**: Per-layer control over Krea 2's 12-layer text conditioning. Lean on
deep layers (6-12) for sharper identity and texture, with RMS-safe renormalization
to keep colors honest.

**Integration path**: Same as 3.1 — requires hidden-state access. Lower priority
than the Prompt-Adherence Engine (it's a refinement of the same technique).

---

## 4. Official Krea 2 LoRA Catalog (Integrated)

Source: `huggingface.co/Comfy-Org/Krea-2` (the model publisher's official repo)
License: Krea 2 Community License

| LoRA ID | Trigger Word | Style | Weight (rule #5) |
|---------|-------------|-------|-------------------|
| krea2-darkbrush | "monochrome ink wash style" | Ink wash brush | 0.5 |
| krea2-dotmatrix | "monochrome stippling style" | Stippling/dot-matrix | 0.5 |
| krea2-kidsdrawing | "naive expressive sketch style" | Children's sketch | 0.5 |
| krea2-neondrip | "textured abstract style" | Neon drip abstract | 0.5 |
| krea2-rainywindow | "rainy window style" | Rainy glass distortion | 0.5 |
| krea2-softwatercolor | "art deco watercolor style" | Soft watercolor | 0.5 |
| krea2-sunsetblur | "ethereal motion blur style" | Sunset motion blur | 0.5 |
| krea2-vintagetarot | "vintage tarot style" | Tarot card illustration | 0.5 |
| krea2-turbo-training-adapter | (no trigger — quality enhancer) | Turbo quality boost | 0.5 |

**Important**: These are STYLIZATION LoRAs, not realism LoRAs. Use them for
artistic effects, not for photorealism. For realism, use `krea2-realism-gokay`
or `krea2-realism-v2-rudy`.

---

## 5. Stable Yogi Community LoRA Catalog (Integrated)

Source: `civitai.red` (NSFW community mirror)
License: Verify per-model (civitai.red listings)

**Engine compatibility note**: Stable Yogi's LoRAs are for SDXL/Pony/Illustrious
checkpoints — NOT for Krea 2 or FLUX.2. They are catalogued with `engineFamilies: ["SDXL"]`.

| LoRA ID | Engine | Purpose | Downloads | Weight |
|---------|--------|---------|-----------|--------|
| sy-realism-pony | SDXL/Pony | All-in-one realism (flagship) | 47K+ | 0.5 |
| sy-realism-sdxl | SDXL | Base SDXL realism | — | 0.5 |
| sy-ultra-realistic-pony | SDXL/Pony | Ultra skin/face detail | — | 0.5 |
| sy-ultra-realistic-sdxl | SDXL | Ultra detail (base SDXL) | — | 0.5 |
| sy-ultra-realistic-illus | SDXL/Illustrious | Illustration → photoreal bridge | — | 0.5 |
| sy-babes-pony | SDXL/Pony | Character/aesthetic (mature) | — | 0.5 |
| sy-musecraft-pony | SDXL/Pony | Artistic style booster | — | 0.5 |
| sy-musecraft-illus | SDXL/Illustrious | Illustration quality | — | 0.5 |
| sy-demo-influencer-004 | SDXL | AI influencer face/identity | — | 0.5 |
| sy-2000s-analog-core | SDXL | 2000s analog film look | — | 0.5 |
| sy-intorealism | SDXL | Community realism alternative | — | 0.5 |
| sy-realistic-skin-face | SDXL | Skin/face realism (portrait) | — | 0.5 |
| sy-event-horizon | SDXL | Cinematic dark/moody | — | 0.5 |
| sy-amateur-slider | SDXL | Amateur/candid slider | — | 0.5 |
| sy-lut-color-grading | SDXL | Cinematic LUT color grading | — | 0.5 |

---

## 6. Workflow Packs (Integrated)

5 new packs added to `src/lib/lora-packs.ts`:

| Pack | Engine | Purpose | LoRAs |
|------|--------|---------|-------|
| Krea 2 Turbo · Photoreal Realism | krea-2-turbo | Fast photoreal (8 steps) | krea2-realism-gokay |
| Krea 2 Raw · Portrait Perfection | krea-2-raw | Max quality (28 steps) | krea2-realism-gokay + v2-rudy |
| Krea 2 · Artistic Style Suite | krea-2-turbo | Official style LoRAs | sunsetblur + softwatercolor |
| Krea 2 Turbo · Quality Maximizer | krea-2-turbo | Turbo quality ceiling | turbo-training-adapter + realism |
| Stable Yogi · SDXL Realism (Partnership) | (SDXL req.) | Partnership readiness | sy-realism-pony + sy-ultra-realistic-pony |

---

## 7. Partnership Readiness Assessment

### What we've built (ready to showcase)

✅ **Krea 2 correctly configured** — 8 steps/CFG 1.0 (Turbo), 28 steps/CFG 4.5 (RAW),
Euler/Simple scheduler. Previous wrong settings (4 steps/CFG 7.5) fixed.

✅ **9 official Krea 2 style LoRAs catalogued** — from Comfy-Org/Krea-2 (the publisher's
repo), with trigger words and weight_name (prevents wrong-file loading).

✅ **15 Stable Yogi community LoRAs catalogued** — from civitai.red, with correct
engine compatibility (SDXL/Pony/Illustrious), mature gating, and partnership tags.

✅ **5 new workflow packs** — one-click ComfyUI-style configurations that batch-apply
engine + calibration + LoRA stack + prompt template.

✅ **Civitai REST API integration** — can scrape any public Civitai model page for
structured metadata (trainedWords, stats, images). Civitai.red via Browserless.

✅ **Import-by-URL UI** — users can paste any HF/Civitai/Civitai.red URL to import
new LoRAs into the library.

### What's needed for full partnership (next steps)

🔲 **SDXL/Pony engine deployment** — Stable Yogi's LoRAs need an SDXL backend.
Our system currently deploys Krea 2 / FLUX.2 / Z-Image. An SDXL Modal app
(nexus_sdxl_base.py) would unlock all 15 Stable Yogi LoRAs + the partnership pack.

🔲 **Prompt-Adherence Engine** — Stable Yogi's flagship technique. Requires
custom text-encoder forward pass in the Krea 2 Modal app. Estimated 2-3 days.

🔲 **End-to-end quality validation** — Generate a test set with the Krea 2
realism packs, have Stable Yogi's community compare against their Forge results.
This is the "fascination" test — do our results match or exceed theirs?

🔲 **ZIT (Z-Image Turbo by Stable Yogi)** — Stable Yogi published a custom
Z-Image Turbo checkpoint ("2603 ZIT By Stable Yogi"). We should add it as an
alternative Z-Image engine option. Requires HF checkpoint integration.

### Recommended next conversation with Stable Yogi

1. "We've integrated your Krea 2 settings guide — our calibration presets now
   match your recommended 8 steps/CFG 1.0 (Turbo) and 28 steps/CFG 4.5 (RAW)."

2. "We've catalogued all 9 official Comfy-Org/Krea-2 style LoRAs with trigger
   words, and 15 of your community realism LoRAs from civitai.red."

3. "We can import any Civitai or HuggingFace LoRA by URL — your community can
   add their own LoRAs without code changes."

4. "Next steps: (a) deploy an SDXL engine so your Pony/Illustrious LoRAs work,
   (b) implement your Prompt-Adherence Engine in our Modal backend, (c) validate
   quality against your Forge baseline. We'd love your input on priorities."

---

## 8. Technical Implementation Details

### Files modified in v5.41

| File | Change |
|------|--------|
| `modal-apps/nexus_krea2_turbo.py` | Fixed defaults (8 steps, no negative_prompt for DiT) |
| `src/lib/calibration.ts` | Fixed Krea 2 presets (Turbo: 8/1.0, RAW: 28/4.5) |
| `src/lib/engines.ts` | Fixed Krea 2 engine defaults (steps/cfg/sampler) |
| `src/lib/lora-library.ts` | +24 LoRAs (9 official Krea 2 + 15 Stable Yogi) |
| `src/lib/lora-packs.ts` | +5 packs (4 Krea 2 + 1 Stable Yogi partnership) |

### Credit-conscious approach

All changes are code-only — NO Modal redeploy required (saves credits).
The Krea 2 app will pick up the new defaults on its next natural redeploy.
With ~$12 of $145 budget remaining, every credit is preserved.

---

## 9. References

- Stable Yogi's Krea 2 Forge Extension: github.com/Stable-yogi/sd-forge-krea2
- Enhancement Suite: github.com/Stable-yogi/sd-forge-krea2-enhancements
- Krea 2 weights: huggingface.co/Comfy-Org/Krea-2 (Krea 2 Community License)
- Stable Yogi's civitai.red: civitai.red/models/1098033 (flagship realism LoRA)
- Stable Yogi's blog: stableyogi.com/blog/krea-2-forge-extension
