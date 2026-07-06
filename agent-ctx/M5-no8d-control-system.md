# Task M5 — NO8D-style control system (our own, not ComfyUI)

**Agent:** full-stack-developer (M5 NO8D control system)
**Date:** continuation of NEXUS Visual Weaver v4
**Scope:** Built the 4 NO8D-inspired control capabilities as a "Control Studio"
section in the existing Studio view. PRESERVED all existing functionality.

## What was built

### 1. Per-LoRA Weight Sliders (NO8D-LoRA stack equivalent)

**`src/components/nexus/store.ts`** — extended (no breaking changes):
- Added `loraWeights: Record<string, number>` + `loraEnabled: Record<string, boolean>`.
- Added `setLoraWeight`, `toggleLoraEnabled`, `resetLoraWeight` actions.
- Added `activeLoraConfigs()` selector returning
  `Array<{ lora: LoraEntry; weight: number; enabled: boolean }>` for
  applied+enabled LoRAs.
- `toggleLora(id)` now initializes the weight to `recommendedWeight` (fallback
  to active preset's `loraWeight`) + `enabled=true` on apply; deletes weight +
  enabled entries on remove.
- `clearLoras()` also clears the weight + enabled maps.
- Exported `ActiveLoraConfig` interface.
- Imported `getLora` + `getPreset` (no circular import — calibration/lora-library
  don't import from store).

**`src/components/nexus/studio-view.tsx`** — extended `LoraStack`:
- Each applied LoRA row now has a weight Slider (0..1, step 0.05) bound to
  `setLoraWeight`.
- Each row has an enable/disable `Switch` bound to `toggleLoraEnabled`.
- Disabled LoRAs render struck-through + reduced opacity + an "off" chip.
- Per-row "Reset to recommended" button (RotateCcw icon) bound to
  `resetLoraWeight`. Disabled when weight already equals recommendedWeight.
- Header shows the global preset `loraWeight` as "default w:" (now informational
  — only used as a fallback default for LoRAs without a `recommendedWeight`).
- The main `run()` body now sends only ENABLED LoRAs (`loraIds`) + a
  `loraWeights` map to the pipeline. Disabled LoRAs stay in the stack but are
  excluded from the generation. (pipeline.ts is unchanged — it still uses
  `loraIds` for prompt triggers; the new weights map is forward-compatible
  with a future Modal backend that applies real per-LoRA weights.)

### 2. Inpainting Canvas (NO8D-Inpainting equivalent)

**New `InpaintCard` component** in studio-view.tsx, rendered in ResultPanel
after the image when `result.status === "completed" && result.imagePath`:
- HTML `<canvas>` overlaid on the source `<img>`. Canvas internal resolution
  capped at 1024px on the long edge for reasonable mask data URL size.
- Brush tool: size slider (10-100px), feather slider (0-1, applied via
  `shadowBlur`), semi-transparent rose mask color `rgba(244, 63, 94, 0.45)`.
- "Clear mask" button (Eraser icon) — `ctx.clearRect`.
- "Invert mask" button (FlipHorizontal2 icon) — iterates pixels, inverts alpha,
  forces RGB to rose where any alpha remains.
- "Denoise strength" slider (0.1-1.0, default 0.75).
- "Inpaint prompt" textarea (max 2000 chars).
- "Run inpaint →" button — validates prompt + non-empty mask, then POSTs to
  `/api/inpaint/run` with `{ sourceImagePath, maskDataUrl, prompt, denoise }`.
- Result panel: side-by-side before/after on success, or a rose error callout
  when the backend is unavailable (stub).
- Session history strip: thumbnails of previous bases (original source is the
  first entry; successful inpaint results prepend). Clicking a thumbnail sets
  it as the new base + clears the mask.
- Pointer-events on the canvas with `setPointerCapture` for smooth drag
  drawing; supports touch via Pointer Events.

**New `src/app/api/inpaint/run/route.ts`** (POST):
- Validates `{ sourceImagePath, maskDataUrl, prompt, denoise }`.
- Path-traversal guard on `sourceImagePath` (must start with `/gallery/`, no `..`).
- `maskDataUrl` must be a `data:image/*` URL.
- `denoise` clamped to 0.1-1.0 (default 0.75).
- Returns the structured stub:
  `{ imagePath: null, errorMessage: "Inpainting requires a deployed Modal app with FLUX.1-Kontext-dev or Qwen-Image-Edit. Set MODAL_INPAINT_BASE_URL. The mask + prompt are ready to send.", request: {...} }`.
- `export const runtime = "nodejs"; export const maxDuration = 300;`
- When the user deploys a real inpaint Modal app, the stub block can be swapped
  for a fetch to `${MODAL_INPAINT_BASE_URL}/generate` — the UI is already
  wired for an `imagePath` response.

### 3. A/B Preview (NO8D-A/B preview equivalent)

**New `ABPreviewCard` component** in studio-view.tsx, rendered in ResultPanel
after InpaintCard:
- Two images: A (default = current result), B (default = null).
- Draggable vertical split line. Image B is the base (full visible); image A
  is on top, clipped with `clipPath: inset(0 ${100 - split}% 0 0)` so only A's
  left portion (0..split%) shows. Drag the handle or click anywhere on the
  container to move the split.
- "Swap A/B" button — swaps the two images.
- "Pick A from gallery" + "Pick B from gallery" buttons — open a
  `GalleryPicker` that fetches `/api/gallery?limit=12` and shows thumbnails.
- Split position label + A/B labels in the corners.
- `role="slider"` ARIA on the handle with `aria-valuenow/min/max`.
- Pure client-side — no backend.
- Pre-pick state: when no B is selected, shows image A + a dashed "Pick image B"
  placeholder tile.

**New `GalleryPicker` helper component** — small thumbnail grid used by both
`ABPreviewCard` and `PromptPlusCard`. Fetches `/api/gallery?limit=12` once and
caches. Filters out items with null `imagePath`.

### 4. Prompt-Plus (NO8D-Prompt-plus equivalent)

**New `PromptPlusCard` component** in studio-view.tsx, rendered after the main
prompt card (before Style):
- Collapsible "Prompt+" card (Collapsible from shadcn/ui).
- Tabs (Expand | Reverse):
  - **Expand mode:** textarea for rough idea (with "Use current" button that
    pulls the current Studio prompt), textarea for extra rules, "Enhance with
    AI" button → POST `/api/prompt/enhance`. Result shows in an EDITABLE
    Textarea (the NO8D "auto off" pattern — `auto off` badge). "Send to
    Studio" button loads it into the main prompt input.
  - **Reverse mode:** "Upload image" button (file input → data URL) OR "Pick
    from gallery" button. "Reverse-engineer prompt" button → POST
    `/api/prompt/reverse`. Result shows in an editable Textarea. "Send to
    Studio" button.

**New `src/app/api/prompt/enhance/route.ts`** (POST):
- Body: `{ prompt: string; extraRules?: string }`.
- Uses `getZai()` + `zai.chat.completions.create` with the system prompt:
  "You are a prompt engineer. Expand the user's rough idea into a rich,
  detailed image-generation prompt. Add photographic detail (camera, lens,
  lighting, texture, composition). Keep the user's intent. Respond with ONLY
  the enhanced prompt, no preamble."
- Returns `{ enhanced: string }`.
- `runtime = "nodejs"; maxDuration = 60;`

**New `src/app/api/prompt/reverse/route.ts`** (POST):
- Body: `{ imagePath?: string }` (gallery image) OR `{ imageDataUrl?: string }`
  (upload).
- For `imagePath`: resolves `/gallery/<file>` to an absolute fs path, reads it,
  converts to base64 data URL (path-traversal guarded).
- For `imageDataUrl`: validates the `data:image/` prefix.
- Uses `getZai()` + `zai.chat.completions.createVision` (model `glm-4.6v`)
  with the system prompt: "You are a prompt reverse-engineer. Analyze this
  image and produce a detailed image-generation prompt that would recreate it.
  Include subject, pose, wardrobe, lighting, camera, style, mood. Respond with
  ONLY the prompt, no preamble."
- Returns `{ prompt: string }`.
- `runtime = "nodejs"; maxDuration = 60;`

## Files modified
- `src/components/nexus/store.ts` — per-LoRA weight + enabled state.
- `src/components/nexus/studio-view.tsx` — LoraStack extension, InpaintCard,
  ABPreviewCard, PromptPlusCard, run() filter to enabled-only LoRAs.

## Files created
- `src/app/api/inpaint/run/route.ts`
- `src/app/api/prompt/enhance/route.ts`
- `src/app/api/prompt/reverse/route.ts`

## Files NOT modified (per spec)
- `src/lib/pipeline.ts` (still uses `loraIds` for prompt triggers — preserved)
- `src/lib/engines.ts`, `src/lib/calibration.ts`, `src/lib/lora-library.ts`
- Other views (gallery, compliance, costlab, etc.)

## Constraints honored
- All components have `"use client"`.
- All `fetch` calls use relative `/api/...` paths only. No absolute URLs or
  ports. No `XTransformPort` needed (everything routes through the Next.js
  dev server on port 3000).
- shadcn components used: Card-equivalent (`nexus-card`), Slider, Switch,
  Button, Textarea, Tabs, Badge, Collapsible.
- `sonner` toast for feedback.
- `lucide-react` icons: Brush, GitCompareArrows, Upload, Eraser,
  FlipHorizontal2, ArrowLeftRight (plus existing Wand, Wand2, Sparkles,
  ScanEye, RotateCcw, Plus, X, ChevronRight, Loader2, CheckCircle2,
  ShieldAlert, AlertTriangle, ImageIcon, ArrowRight, Layers, Sliders).
- NO indigo/blue colors. NEXUS palette: emerald/teal + amber + rose.
- TypeScript strict, no `any`.
- Mobile-first responsive (sm: breakpoints, touch-friendly pointer events).
- Backend stubs surface clear error messages; UI is fully functional.

## Verification
- `bun run lint` — clean (no errors, no warnings).
- `bunx tsc --noEmit` — 0 errors.
- Dev server stays up (dev.log shows only successful 200 responses, no
  compile errors after edits).
