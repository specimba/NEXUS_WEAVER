# M4 — image-approval → video step-2 (I2V) flow

**Task ID:** M4
**Agent:** full-stack-developer (M4 video flow)
**Date:** This session

## Goal
After a still image is generated + approved, send it to a video engine (Wan 2.2 / LTX 2.3 / etc.) for image-to-video (I2V) generation. This is a **two-step workflow**: Step 1 (image, done) → Step 2 (video, NEW).

## Files added / changed

### NEW: `src/lib/video-pipeline.ts` (248 lines)
- Exports `VideoStageInput`, `VideoStageResult`, and `runVideoStage(params)`.
- Flow:
  1. Validate source image exists on disk (`resolveAbsoluteImagePath` checks `public/gallery/…`).
  2. Record the video-run intent in the audit log via the existing `logEvent` from `@/lib/pipeline`.
  3. Attempt the Modal video endpoint only when BOTH `isModalEnabled()` is true AND `MODAL_VIDEO_BASE_URL` env is set — POSTs base64 image + prompt + engine + steps/cfg/duration to `${MODAL_VIDEO_BASE_URL}/generate_video` with a 240s AbortController timeout; writes the returned MP4 to `public/gallery/`.
  4. On any failure (no video app deployed, fetch error, HTTP error, missing video field), returns a structured `{ videoPath: null, ms, backend: null, errorMessage: … }`. Never throws.
- The function is a stub in this sandbox — the current Modal endpoint only serves FLUX.1-schnell image gen. When a video Modal app is deployed + `MODAL_VIDEO_BASE_URL` is set, the same code path will produce real MP4s.
- Canonical error message returned to UI: `"Video generation requires a deployed Modal video app (Wan 2.2 / LTX 2.3). The current Modal endpoint serves FLUX.1-schnell (image only). Deploy a video Modal app and set MODAL_VIDEO_BASE_URL in .env."`

### NEW: `src/app/api/video/run/route.ts` (81 lines)
- `export const runtime = "nodejs"; export const maxDuration = 300;` (matches image pipeline).
- POST endpoint. Body: `{ sourceImagePath, prompt, engineId, steps?, cfg?, durationSec? }`.
- Validates: JSON parseable, `sourceImagePath` required + must start with `/gallery/` + no `..` (path-traversal guard), `prompt` required + max 2000 chars, `engineId` defaults to `"wan-2.2"`, `steps`/`cfg`/`durationSec` must be finite numbers if provided.
- Calls `runVideoStage` and returns the structured result as JSON (always 200 — even on stub failure, the body carries `errorMessage`).

### CHANGED: `src/components/nexus/studio-view.tsx` (+~390 lines, no rewrite of existing logic)
- Added imports: shadcn `Button`, `Textarea`, `Badge`, `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue`; `DEFAULT_VIDEO_ENGINE_ID` from `@/lib/engines`; `Play` from lucide-react.
- Extended `ResultPanel` with:
  - `approved` / `videoPulse` state + `videoCardRef` + `handleApproveAndAnimate` callback.
  - `✓ Approved` emerald badge in the top-right corner of the image (only when `result.imagePath && approved`).
  - "Approve & Animate →" button in the image's hover overlay (next to the existing PNG download). Clicking it: flips `approved=true`, pulses the VideoStepCard for 1.5s, and `scrollIntoView`s it.
  - Renders `<VideoStepCard>` after `<ProvenanceCard />`, only when `result.status === "completed" && result.imagePath`.
  - All existing ResultPanel functionality preserved (image display, judge scores, evidence JSON, OCR tool, provenance, blocked-state UI, retry buttons).
- Added `VideoStepCard` component:
  - Header: "Step 2 · Animate this image" with Film icon in emerald tile + outline `Badge` "I2V".
  - Engine picker: radio chips for all 6 video engines from `enginesByType("video")`, default `wan-2.2`. Each chip shows `shortName · ~Ns warm`. Max-height 32 with `nexus-scroll` overflow.
  - Motion prompt `Textarea` prefilled with `${result.prompt} cinematic motion, smooth camera pan`. Re-seeds via `useEffect` when `result.prompt` changes. 2000-char cap + live counter.
  - Duration `Select`: 2s / 4s / 6s / 10s, default 4s.
  - "Animate →" `Button` (Spinner + "Animating on {engine}…" while loading).
  - On click: calls `onApproved()`, builds a fresh `AbortController` (300s timeout — same pattern as image pipeline), POSTs relative `/api/video/run`, parses `{ videoPath, errorMessage, error }`, toasts success/error, handles abort/timeout with a friendly 5-min-timeout message. Aborts in-flight on unmount.
  - Success: emerald callout + `<video controls autoPlay loop muted playsInline>` + Download MP4 link + "Open in Gallery" button.
  - Failure: rose callout with the structured `errorMessage` + two CTAs — "Deploy a video Modal app in Cost Lab" (`setView("costlab")`) and external link to the selected engine's HF weights page.
  - Loading hint: amber callout "Animating on {engine}… this can take 30-120s (cold starts longer). The page is still working — please don't close it."
  - Card root accepts `cardRef` (scroll-to target) + `pulse` (drives 1.5s emerald ring-offset pulse).

## Verification
- `bun run lint` → 0 errors, 0 warnings.
- `bunx tsc --noEmit 2>&1 | grep "^src/"` → 0 src errors (the only 4 tsc errors are in `examples/` and `skills/` directories — unrelated to this task).
- Dev log shows no HMR/compile errors after the edits.

## Constraints honored
- `"use client"` directive preserved (already at top of studio-view.tsx).
- All API calls use relative `fetch("/api/video/run")` — no absolute URLs or ports.
- Did NOT modify `src/lib/pipeline.ts` (image pipeline untouched).
- TypeScript strict, no `any`.
- The video backend is a documented stub — the UI is fully functional and the error message clearly explains what's needed for real video.

## What's needed for REAL video generation
1. Deploy a separate Modal app that runs a video diffusion model (Wan 2.2 / LTX 2.3 / HunyuanVideo / etc.) on an H100 or L40S.
2. Expose a `POST /generate_video` endpoint that accepts `{ image: <base64 PNG>, prompt, engine_id, steps, cfg, duration_sec }` and returns `{ video: <base64 MP4>, ms: int }`.
3. Set `MODAL_VIDEO_BASE_URL` in `.env` to that app's URL.
4. Keep `MODAL_USE=true` so the video client is enabled.

No UI changes are needed — the same `VideoStepCard` + `/api/video/run` flow will produce real MP4s once the backend is deployed.

## Hand-off to next milestone (M5 — NO8D control system)
- The `videoEnabled` store flag is still recorded in pipeline provenance (no change to image pipeline).
- The `VideoStageToggle` in the calibration panel remains the provenance-only toggle (now superseded visually by the new `VideoStepCard` post-image).
- Per-LoRA weight sliders, inpainting canvas, A/B preview, prompt-plus LLM expansion — all greenfield for M5.
