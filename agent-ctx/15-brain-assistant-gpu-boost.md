# Task ID: 15 — Brain Assistant + GPU Boost Toggle

**Agent:** full-stack-developer (Brain Assistant + GPU Boost)
**Task:** Build `BrainAssistantCard` (advisory config analysis via `/api/brain/analyze`) and `GpuBoostToggle` (per-request Modal GPU opt-in) in `src/components/nexus/studio-view.tsx`, plus the backend wiring for `modalBoost` in `nexus-types.ts`, `pipeline.ts`, and `/api/pipeline/run/route.ts`.

## What was built

### PART 1 — BrainAssistantCard (`studio-view.tsx`)
- New `BrainAssistantCard` component placed in the LEFT control column AFTER `LoraStack`.
- Uses a `Collapsible` (open by default) with Brain icon + "Brain Assistant" label + a small "Analyze" button + an amber "Deep" button.
- Pulls `engineId / loraIds / loraWeights / calibrationId / calibrationOverrides / prompt / style` from the `useNexus()` store.
- Resolves calibration via `resolveCalibration(calibrationId, calibrationOverrides as Partial<CalibrationPreset>)`.
- Uses `@tanstack/react-query` `useQuery` with queryKey `["brain-analysis", engineId, loraIdsKey, loraWeightsKey, calibrationId, promptKey]` and `enabled: false` (on-demand only).
- Two modes via a `useReducer`:
  - **local** (instant, `deep: false`): auto-runs on mount + 2s debounced after config changes.
  - **deep** (3-5s, `deep: true`): on-demand via the "Deep" button (calls z-ai chat completions API).
- The `useReducer` design (with a `trigger` counter) was needed to satisfy the `react-hooks/set-state-in-effect` + `react-hooks/refs` lint rules — dispatching from effects is allowed where setState is not, and the reducer atomically updates both `mode` and `trigger` so the queryFn closure always sees the latest mode after the refetch effect fires.
- Renders each suggestion as a `BrainSuggestionRow` with tinted card:
  - `warning` / `compat` → amber tint, `AlertTriangle` icon
  - `tip` → emerald tint, `Lightbulb` icon
  - `optimization` → cyan tint, `Zap` icon
- Each row shows `kind` badge + `title` + `detail`. If the suggestion has an `action`, a small button is rendered.
- Shows the `summary` text + `confidence` as a small percentage badge.
- Shows a `lastMode` badge (local/deep) and a spinner on the appropriate button while fetching.
- Action handling (`applyAction`):
  - `switch-engine` → `setEngine(action.value)` + `syncCalibrationToEngine()` + toast
  - `remove-lora` → `toggleLora(action.value)` + toast
  - `adjust-steps` → `setCalibrationOverride("steps", parseInt(action.value, 10))` + toast
  - `adjust-cfg` → `setCalibrationOverride("cfg", parseFloat(action.value))` + toast
- Advisory only — never blocks generation. Rose callout on error makes this explicit ("The brain is advisory only — you can still run the pipeline.").

### PART 2 — GpuBoostToggle (`studio-view.tsx`)
- New `GpuBoostToggle` component placed in the LEFT control column AFTER `BrainAssistantCard`, immediately BEFORE the Run button.
- Receives `useModalBoost` + `setUseModalBoost` as props (state lifted to `StudioView` so `run()` can include `modalBoost: useModalBoost` in the request body).
- Default OFF → "z-ai (always warm)" emerald badge with `Cloud` icon. Copy: "z-ai hosted inference — reliable, 20-30s per image (default)."
- When toggled ON (shadcn `Switch`):
  - Card border turns amber.
  - Badge becomes "Modal GPU" amber with `Cpu` icon. Copy: "Modal H100 — may cold-start 30-60s. Click Warm up first."
  - Shows an amber warning callout with `AlertTriangle`: "Modal GPU enabled. The H100 may be cold (30-60s warm-up). Click 'Warm up Modal' first, or the first generation will queue behind a cold start."
  - Shows a "Warm up Modal" button (Flame icon) that POSTs to `/api/modal/warmup` and toasts the result (success/cold/disabled/error).
- Makes it CRYSTAL CLEAR that z-ai is the default reliable path and Modal is an explicit opt-in.

### Backend wiring
- `src/lib/nexus-types.ts` → added `modalBoost?: boolean` to `RunPipelineRequest`.
- `src/lib/pipeline.ts` → added `modalBoost?: boolean` to `PipelineRunInput` (carried through for provenance/logging; the actual routing is via the env override in the route handler).
- `src/app/api/pipeline/run/route.ts` →
  - Reads `modalBoost` from the body (defaults to `false`).
  - Saves the original `process.env.MODAL_USE` value.
  - If `modalBoost === true`, sets `process.env.MODAL_USE = "true"` before calling `runPipeline`.
  - Wraps the `runPipeline` call in `try { ... } finally { ... }` — the finally restores `process.env.MODAL_USE` to its original value (or deletes it if it was undefined) so the override NEVER leaks into subsequent requests on the same server process.
  - Passes `modalBoost` to `runPipeline` for provenance.
- `studio-view.tsx` `run()` → `useModalBoost` state added to `StudioView`; included in the body as `modalBoost: useModalBoost`; added to the `run` callback's dependency array.

### Bug fix (pre-existing, exposed by this task)
- `src/lib/brain-assistant.ts` line 51: `lora.engineFamilies.includes(engine.family)` was failing tsc because `engine.family` is `string` (engines.ts) but `engineFamilies` is `EngineFamily[]` (lora-library.ts). Fixed by switching to `.some((f) => f === engine.family)` — no cast needed, and TypeScript allows `===` between `EngineFamily` and `string`. This was a pre-existing error in the (untracked) brain-assistant.ts file that the previous task agent left; verified it exists in the baseline (without my changes) by stashing.

## Files modified
- `src/components/nexus/studio-view.tsx` — added imports (`useReducer`, `Lightbulb`, `resolveCalibration`, `CalibrationPreset`, `BrainSuggestion`, `BrainAnalysis`); added `useModalBoost` state to `StudioView`; added `modalBoost: useModalBoost` to the `run()` body + deps array; rendered `<BrainAssistantCard />` and `<GpuBoostToggle ... />` after `<LoraStack />`; added the `brainReducer` + `BrainState`/`BrainAction`/`BrainMode` types; added the `BrainAssistantCard` component; added the `BrainSuggestionRow` helper component; added the `GpuBoostToggle` component.
- `src/lib/nexus-types.ts` — added `modalBoost?: boolean` to `RunPipelineRequest`.
- `src/lib/pipeline.ts` — added `modalBoost?: boolean` to `PipelineRunInput`.
- `src/app/api/pipeline/run/route.ts` — added `modalBoost?: unknown` to the body type; reads `modalBoost`; saves/restores `process.env.MODAL_USE` around the `runPipeline` call in a `try`/`finally`; passes `modalBoost` to `runPipeline`.
- `src/lib/brain-assistant.ts` — fixed the pre-existing `engineFamilies.includes(engine.family)` type error by switching to `.some()`.

## Quality verification
- `bun run lint` → 0 errors, 0 warnings (exit 0).
- `bunx tsc --noEmit 2>&1 | grep "^src/"` → 0 src errors. (The 4 remaining tsc errors are all in `examples/` and `skills/` directories — pre-existing, unrelated to this task, and out of scope.)
- Dev server log shows: `POST /api/brain/analyze 200 in 236ms` — the Brain Assistant endpoint is being called from the UI and returning 200.
- All API calls use relative `fetch("/api/...")` paths only.
- TypeScript strict, no `any`.
- `"use client"` directive preserved.
- All existing functionality preserved (LoraStack, CalibrationPanel, EnginePicker, BrainSelector, VideoStageToggle, PromptPlusCard, InpaintCard, ABPreviewCard, ResultPanel, VideoStepCard, OcrTool, ProvenanceCard, run pipeline, warmup modal, etc.).
- Palette: emerald (z-ai default) + amber (Modal warning) + cyan (optimization) + rose (errors). NO indigo/blue.

## Stage Summary
- Two new components live in the Studio's left control column: `BrainAssistantCard` (advisory config analysis, local + deep modes, one-click action buttons) and `GpuBoostToggle` (explicit Modal GPU opt-in with warm-up button).
- The Brain Assistant auto-runs a local check on mount + 2s after config changes; the user can manually trigger a deep AI analysis on demand. It's advisory only — never blocks generation.
- The GPU Boost toggle makes it crystal clear that z-ai is the default reliable path (emerald, "always warm") and Modal H100 is an explicit opt-in (amber, "may cold-start 30-60s"). The warm-up button is one click away.
- The backend `modalBoost` field flows from the UI → request body → route handler → `process.env.MODAL_USE` override (scoped to this one request via try/finally) → `stageFlux`'s `isModalEnabled()` check. Safe because `runPipeline` runs synchronously within a single request handler.
- Pre-existing `brain-assistant.ts` tsc error fixed as a side-effect (1-line change, `.some()` instead of `.includes()`).
- 0 lint errors, 0 src tsc errors, dev server healthy, Brain Assistant endpoint returning 200.
