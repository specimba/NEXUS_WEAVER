# Work Record — Task: loras-update

**Task ID:** loras-update
**Agent:** Z.ai Code (main)
**Date:** 2025-07-02
**File touched:** `src/lib/lora-library.ts` (only)

## Objective
Add ALL new LoRAs from the user's curated HF list to `src/lib/lora-library.ts`.
Do NOT modify any existing entries — only ADD new ones at the end of the
`LORA_LIBRARY` array.

## Inputs
User-provided HF URL list (54 URLs across 4 sections):
- FLUX.2 Klein 9B LoRAs (29 URLs)
- ControlNet models (5 URLs)
- Qwen Image Edit LoRAs (12 URLs)
- NO8D (9 URLs — "skip if already present")

## Dedup logic (skip already-present URLs)
Cross-referenced each input URL against the existing `url:` fields in the
library. Skipped these 11 already-present entries:

| URL | Existing id |
|-----|-------------|
| `dx8152/Flux2-Klein-9B-Enhanced-Details` | `dx8152-enhanced-details` |
| `dx8152/Flux2-Klein-9B-Consistency` | `dx8152-consistency` |
| `nhathoangfoto/Flux.2-Klein-9B-SmartCharacterSwap` | `nhathoang-char-swap` |
| `DeverStyle/Flux.2-Klein-Loras` | `deverstyle-loras` |
| `fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA` | `qwen-multi-angle` |
| `NO8D/ExpressionControl` | `no8d-expressioncontrol` |
| `NO8D/LightControl` | `no8d-lightcontrol` |
| `NO8D/BodyControl` | `no8d-bodycontrol` |
| `NO8D/FaceControl` | `no8d-facecontrol` |
| `NO8D/Slider-toolkit-Klein4B` | `no8d-slider-toolkit` |
| `NO8D/ImagingControl` | `no8d-imagingcontrol` |
| `NO8D/PhotoStyle` | `no8d-photostyle` |

## New entries added: 43
Breakdown by section:

### FLUX.2 Klein 9B (25 new)
- `guangyuan-klein-blitz` (priority: high — key ComfyUI port)
- `disty0-klein-sdnq-4bit` (priority: high — key 4-bit quant)
- `gokay-flux-prompt-enhance` (ocr-tool, universal T5)
- `gokay-florence-2-flux-large` (ocr-tool, FLUX.1)
- `gokay-flux-white-background` (style, FLUX.1)
- `gokay-lamini-prompt-enhance-long` (ocr-tool, universal)
- `gokay-flux-realistic-backgrounds` (style, FLUX.1)
- `gokay-sketch-to-image-kontext` (style, FLUX.1)
- `mikkoph-klein9b` (style, FLUX.2)
- `lovis93-flux-2-multi-angles-v2` (control, FLUX.2)
- `dx8152-klein-migration` (style, FLUX.2)
- `nhathoang-klein-matching-pose` (control, FLUX.2)
- `nhathoang-klein-ghost-mannequin` (garment, FLUX.2)
- `nhathoang-klein-mannequin` (garment, FLUX.2)
- `nhathoang-klein-upscale` (detailer, FLUX.2)
- `f370n-contextremover` (style, universal)
- `nomadoor-klein-schematic` (style, FLUX.2)
- `granddyser-biglove-klein` (style, FLUX.2)
- `agentanon-biglove-klein` (style, FLUX.2)
- `editmilliionss-thebestflux` (style, FLUX.1+2)
- `muapi-90s-hacker-movie-vibes` (style, FLUX.2)
- `muapi-china-ktv-girls` (style, FLUX.2)
- `muapi-nobody7-pale-female` (**mature**, FLUX.1)
- `aisha-klein-nsfw-standard` (**mature**, FLUX.2)
- `darknight-klein-bucket-uncensored` (**mature**, FLUX.2)

### ControlNet — Flux.1-dev (5 new, all priority: high, isControl: true)
- `jasperai-flux1-controlnet-depth` (control)
- `jasperai-flux1-controlnet-upscaler` (detailer — Upscaler wins function)
- `shakker-flux1-controlnet-union-pro` (control)
- `shakker-flux1-controlnet-union-pro-2` (control)
- `instantx-flux1-controlnet-union` (control)

### Qwen-Image Edit (11 new)
- `ostris-qwen-edit-inpainting` (style)
- `ostris-qwen-edit-shirt-design` (style)
- `instantx-qwen-controlnet-inpainting` (control, isControl: true, priority: high)
- `instantx-qwen-controlnet-union` (control, isControl: true, priority: high)
- `lilylilith-qie-anylight` (style)
- `lilylilith-qie-material-preview` (style)
- `warmblood-qwen-real-chars-2511` (style)
- `dx8152-qwen-style-transfer` (style)
- `rzgar-eva-qwen-flat-chest` (style)
- `rzgar-eva-qwen-v4b-2512` (style)
- `shakker-awportrait-qw` (style)

### NO8D batch 2 (2 new, priority: high)
- `no8d-highresolution` (style, FLUX.2)
- `no8d-8090-cult-film-style` (style, FLUX.2)

## Categorization rules applied (per task spec)
- "ControlNet"/"controlnet" → control (+ isControl: true)
- "Upscale"/"upscaler" → detailer
- "nsfw"/"uncensored"/"nude" → mature (mature: true)
- "Prompt-Enhance"/"Florence" → ocr-tool
- "Multi-Angles"/"MatchingPose"/"CharacterSwap" → control
- "Mannequin"/"ghost-mannequin" → garment
- "Style"/"Realism"/"Background" → style
- Default → style

## Engine-family rules applied
- name has "FLUX.2" / "Flux-2" / "Flux2" / "klein" → ["FLUX.2"]
- name has "Flux.1" / "flux1" / "Flux-1" → ["FLUX.1"]
- name has "Qwen" → ["Qwen-Image"]
- generic "Flux" LoRA → ["FLUX.1"] (e.g. Flux-White-Background)
- universal utility (T5 prompt enhancers, Florence VLM, context-remover)
  → [] (empty — appears under all engines via `lorasForEngine`)
- ambiguous "THEBESTFLUX" → ["FLUX.1", "FLUX.2"]

## Priority assignments
- **high**: 2 NO8D new + Blitz + SDNQ + 5 FLUX.1 ControlNets + 2 Qwen
  ControlNets = 11 high-priority new entries
- **normal** (omitted field): the remaining 32

## Defaults
- recommendedWeight: 0.7 (per task spec)
- license: "verify" (non-mature) or "verify · 18+ only" (mature)
- mature: false (except 3 NSFW entries above)
- source: "huggingface"

## Verification
- `bun run lint` → 0 errors (clean output)
- `bunx tsc --noEmit 2>&1 | grep "^src/"` → 0 errors in src/
  (4 pre-existing errors live in `examples/` + `skills/` dirs, untouched)
- `grep "lora-library" tsc-output` → 0 errors
- Entry count: 105 total (was 62, +43 new)
- No existing entry was modified — only appended before the closing `];`

## Structure
New entries are grouped under a clearly-commented "CURATION UPDATE — batch 2"
section banner at the end of `LORA_LIBRARY`, with sub-banners per group:
- FLUX.2 Klein 9B base / quantization variants
- gokaygokay prompt / vision / background utilities
- Klein 9B community variants & helpers
- BigLove / collection / best-of community builds
- NSFW / uncensored (mature: true)
- CONTROLNET MODELS (Flux.1-dev)
- QWEN-IMAGE EDIT LoRAs (batch 2)
- NO8D COLLECTION — batch 2
