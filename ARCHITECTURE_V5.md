# NEXUS Visual Weaver — Modular Pipeline Architecture (v5)
# Three-Expert Analysis + Execution-Ready Spec

## Expert A — Workflow Architect: Current System Analysis

### How the current system ACTUALLY works (not how the UI presents it)

```
User selects "Krea 2 Turbo" in UI
    ↓
Pipeline sends prompt + LoRAs to Modal endpoint
    ↓
Modal endpoint serves FLUX.1-schnell (NOT Krea 2 Turbo)
    ↓
FLUX.1-schnell runs 4-8 diffusion steps on H100
    ↓
Image returned as base64 → stored in DB
    ↓
z-ai chat completions runs ST3GG safety scan
    ↓
z-ai vision runs visual judge
    ↓
z-ai chat completions runs Nemotron evidence parse
    ↓
Result shown to user with provenance saying "Modal H100 GPU (Krea 2 Turbo)"
    ↑
    PROVENANCE IS WRONG — actual model is FLUX.1-schnell
```

### Key weaknesses in workflow design

1. **Engine selector is cosmetic.** The UI offers 6 image engines (FLUX.2 9B, Krea 2 Turbo, Z-Image, etc.) but the Modal endpoint serves FLUX.1-schnell ONLY. Selecting "Krea 2 Turbo" doesn't change the model — it just changes the label.

2. **Monolithic pipeline.** The pipeline is a single linear function: `runPipeline()` calls `stageFlux()` → `stageSt3gg()` → `stageJudge()` → `stageNemotron()`. There's no node graph, no conditional branching, no parallel execution, no way to swap individual stages.

3. **No negative prompt support.** FLUX supports negative prompts via the `negative_prompt` parameter. Our pipeline doesn't send one. This is critical for quality — "blurry, deformed, low quality" as a negative prompt dramatically improves output.

4. **No prompt conditioning pipeline.** ComfyUI separates prompt encoding (CLIPTextEncode) from sampling (KSampler). Our pipeline sends the raw prompt string to Modal, which handles encoding internally. There's no way to use CLIP skip, prompt weighting, or regional conditioning.

5. **LoRA compatibility is unverified.** The UI lets you apply NO8D LoRAs (which target FLUX.2) on FLUX.1-schnell. The Modal app tries to load them via `load_lora_weights()` but may silently fail. The `lora_errors` field in the response is `None` (not checked).

6. **No img2img or inpaint pipeline.** The inpaint card exists in the UI but the backend is a stub. No Modal app for FLUX.1-Kontext or Qwen-Image-Edit is deployed.

7. **Video is completely non-functional.** The video card sends to `/api/video/run` which validates the image path then returns "not deployed." No Modal video app exists.

---

## Expert B — Model & LoRA Specialist: Model Usage Analysis

### What's actually running vs what should be running

| Stage | What UI says | What actually runs | What SHOULD run |
|---|---|---|---|
| Image gen | "Krea 2 Turbo" | FLUX.1-schnell (4-step, H100) | The selected engine (requires per-engine Modal apps) |
| Safety scan | "Gemma4 Fable5 uncensored" | z-ai chat completions (hosted model) | Uncensored Gemma 4 12B on Modal (requires deployment) |
| Visual judge | "Gemma4 Fable5 uncensored" | z-ai vision (hosted model) | Uncensored Gemma 4 12B with vision on Modal |
| Evidence | "Gemma4 Heretic" | z-ai chat completions (hosted model) | Gemma 4 12B heretic on Modal |

### Why the wardrobe isn't rendering

The VLM analysis of the generated image confirms: "The wardrobe (patent leather cape-coat, fur trim, lace corset) is not visible; the subject wears a sleeveless black garment."

Root causes (in priority order):

1. **FLUX.1-schnell is a 4-step distilled model.** It's designed for speed (1-2s), not fidelity. Complex wardrobe details (patent leather + fur + lace + corset + buckles + stained glass + atmospheric dust) require more diffusion steps. FLUX.1-dev (20+ steps) or Krea 2 Turbo (6 steps but higher base quality) would render these details.

2. **The CLIP truncation warning (108 > 77 tokens) is from CLIP-L, not T5.** FLUX uses T5-XXL (512 tokens) as its PRIMARY text encoder. The full prompt IS being processed by T5. The CLIP truncation affects the pooled guidance only. This is NOT the primary cause of missing wardrobe — the model's 4-step capability is.

3. **The LoRAs target FLUX.2, not FLUX.1-schnell.** NO8D PhotoStyle, LightControl, etc. are trained on FLUX.2-klein-9B. Loading them on FLUX.1-schnell may produce no effect or artifacts. The Modal app's `lora_errors` field needs to be checked.

### What would actually fix the wardrobe issue

**Option A: Deploy FLUX.1-dev on Modal** (highest impact, simplest)
- FLUX.1-dev supports 20-50 steps, produces much higher fidelity
- Same model family — all existing LoRAs are more likely to work
- Change the Modal app to load `black-forest-labs/FLUX.1-dev` instead of `FLUX.1-schnell`
- Trade-off: 5-15s per generation instead of 1-2s

**Option B: Deploy Krea 2 Turbo on Modal** (what the user wants)
- Requires the Krea 2 Turbo weights (gated access on HF)
- 6-step inference with strong default aesthetics
- Krea-specific LoRAs would work natively
- Requires a new Modal app deployment

**Option C: Use FLUX.1-dev with 20 steps + NO8D LoRAs** (best near-term)
- FLUX.1-dev is the same model family as the LoRAs' target (FLUX.2 shares the architecture)
- 20 steps gives enough diffusion iterations to render complex wardrobe
- NO8D LoRAs are more likely to load correctly on dev than on schnell
- Can be deployed by changing one line in the Modal app

---

## Expert C — Systems & Deployment Engineer: Architecture Plan

### The problem with the current Modal setup

The Modal app `nexus-visual` has:
- `min_containers=0, max_containers=1` → cold starts on every idle
- `scaledown_window=120s` → container dies after 2 min idle
- `gpu="H100"` → $3.95/hr, overkill for FLUX.1-schnell
- Single model (FLUX.1-schnell) loaded at startup → can't switch models per-request

### Proposed: Per-engine Modal apps (ComfyUI-inspired modularity)

Instead of one monolithic Modal app, deploy SEPARATE Modal apps per engine:

```
nexus-flux1-schnell  → FLUX.1-schnell on L4 ($0.80/hr) — draft/preview
nexus-flux1-dev      → FLUX.1-dev on L40S ($1.95/hr) — quality delivery
nexus-krea2-turbo    → Krea 2 Turbo on L40S ($1.95/hr) — trending fast
nexus-flux-kontext   → FLUX.1-Kontext-dev on L40S — inpaint/edit
nexus-video-wan22    → Wan 2.2 I2V on H100 ($3.95/hr) — video
nexus-video-ltx23    → LTX 2.3 on H100 ($3.95/hr) — video with control
```

Each app:
- Loads ONE model at startup (`@modal.enter()`)
- Has its own `/health` and `/generate` endpoints
- Uses GPU snapshotting (alpha) to cut cold starts from 30s to 3s
- Scales to zero when idle (no always-on cost)
- Weights cached in a shared Modal Volume

The dashboard's engine picker would route to the correct Modal app URL per engine.

### Modular pipeline node graph (ComfyUI-inspired)

```
[CheckpointLoader] → model
                        ↓
[LoRAStack]       → model (with LoRAs applied)
                        ↓
[CLIPTextEncode]  → positive, negative
                        ↓
[KSampler]        → latent (steps, cfg, sampler, scheduler, seed)
                        ↓
[VAEDecode]       → image
                        ↓
[ImageOutput]     → saved to DB
                        ↓
[SafetyChecker]   → safety verdict
                        ↓
[VisualJudge]     → quality scores
                        ↓
[EvidenceAggregator] → final evidence JSON
                        ↓
[VideoGenerator]  → (optional, if videoEnabled)
```

Each node is a TypeScript interface with:
- `id: string` — unique node instance ID
- `type: NodeType` — which node type
- `inputs: Record<string, any>` — input connections
- `params: Record<string, any>` — node parameters
- `execute(inputs): Promise<outputs>` — runs the node

### Implementation plan (execution-ready)

#### Phase 1: Fix the immediate quality issue (deploy FLUX.1-dev)
1. Write a new Modal app (`nexus-flux1-dev.py`) that loads FLUX.1-dev with 20-step default
2. User deploys it: `uvx modal deploy nexus-flux1-dev.py`
3. Update the dashboard to route "Studio Quality" preset to the new endpoint
4. This alone would fix the wardrobe rendering issue

#### Phase 2: Modular pipeline in the dashboard
1. Define `PipelineNode` interface in `src/lib/pipeline-graph.ts`
2. Replace the monolithic `runPipeline()` with a graph executor
3. Each stage becomes a node with explicit inputs/outputs
4. The UI can visualize the graph (like ComfyUI's node editor)

#### Phase 3: Per-engine Modal apps
1. Write Modal app templates for each engine
2. User deploys the ones they want
3. Dashboard auto-detects which endpoints are live
4. Engine picker only shows available engines

#### Phase 4: Real video generation
1. Deploy a Wan 2.2 I2V Modal app
2. Wire the VideoStepCard to the real endpoint
3. Store video as base64 in DB (same pattern as images)

#### Phase 5: Real uncensored brain on Modal
1. Deploy Gemma 4 12B fable5 abliterated on Modal (vLLM)
2. Route ST3GG + judge + Nemotron to the Modal endpoint
3. Remove z-ai dependency for brain stages

---

## What I can do RIGHT NOW vs what requires the user

**I can do:**
- Fix the provenance honesty (DONE — provenance now says FLUX.1-schnell when there's a mismatch)
- Fix the video/inpaint path validation (DONE — accepts /api/image/ paths)
- Store images in DB (DONE — no more 404 HTML in PNG files)
- Send the RAW prompt to Modal (DONE — no enrichment bloat)
- Send LoRAs + weights to Modal (DONE — loras[] array in the request)
- Write the modular pipeline-graph architecture
- Write Modal app templates for the user to deploy
- Add negative prompt support
- Add lora_errors checking (warn the user when a LoRA fails to load)

**Requires the user (Modal deployment):**
- Deploy FLUX.1-dev Modal app (fixes wardrobe quality)
- Deploy Krea 2 Turbo Modal app
- Deploy video Modal apps (Wan 2.2 / LTX 2.3)
- Deploy uncensored Gemma 4 12B Modal app (for brain stages)
- Set HF token for gated model access
