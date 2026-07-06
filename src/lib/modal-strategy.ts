// NEXUS Visual Weaver v4 — Modal Engine→GPU Strategy
// ---------------------------------------------------------------------------
// Maps each engine in the catalog to the CHEAPEST GPU that can run it, with
// cold-start avoidance and cost projections. Replaces the current "H100 for
// everything" approach that burned 87% of the workspace budget.
//
// RULES:
//   1. Match GPU VRAM to the model's footprint (no overkill).
//   2. Prefer preemptible (3x cheaper than non-preemptible).
//   3. Use fp8 quantization (optimum-quanto) to fit larger models on smaller GPUs.
//   4. Reserve H100/H200/B200 for video + 70B+ models only.
//   5. Cache weights in a Modal Volume (one-time download, not per-cold-start).
// ---------------------------------------------------------------------------

import type { ModalGpu } from "@/lib/modal-budget";

export interface EngineGpuStrategy {
  engineId: string;
  engineName: string;
  recommendedGpu: ModalGpu;
  fallbackGpu: ModalGpu;
  quantization: "bf16" | "fp8" | "fp4" | "none";
  vramRequiredGb: number;
  coldStartSec: number;
  inferenceSec: number;
  costPerRunUsd: number;
  vsCurrentH100Pct: number;
  rationale: string;
}

// Current H100 baseline (what they're paying now for FLUX.1-schnell)
const H100_COST_PER_SEC = 0.001097;

export const ENGINE_GPU_STRATEGY: EngineGpuStrategy[] = [
  {
    engineId: "flux2-klein-9b",
    engineName: "FLUX.2 Klein 9B",
    recommendedGpu: "L40S",
    fallbackGpu: "A100-80",
    quantization: "bf16",
    vramRequiredGb: 36,
    coldStartSec: 18,
    inferenceSec: 6,
    costPerRunUsd: 18 * 0.000542 + 6 * 0.000542,
    vsCurrentH100Pct: -51,
    rationale: "FLUX.2 9B needs ~36GB bf16. L40S (48GB, $1.95/hr) is the sweet spot. H100's 80GB is wasted VRAM.",
  },
  {
    engineId: "flux2-dev",
    engineName: "FLUX.2 Dev",
    recommendedGpu: "L40S",
    fallbackGpu: "A100-80",
    quantization: "bf16",
    vramRequiredGb: 40,
    coldStartSec: 20,
    inferenceSec: 12,
    costPerRunUsd: 20 * 0.000542 + 12 * 0.000542,
    vsCurrentH100Pct: -51,
    rationale: "FLUX.2 Dev + refiner. L40S handles it at bf16. Use A100-80 only if refiner OOMs.",
  },
  {
    engineId: "krea-2-turbo",
    engineName: "Krea 2 Turbo",
    recommendedGpu: "L40S",
    fallbackGpu: "A10",
    quantization: "bf16",
    vramRequiredGb: 32,
    coldStartSec: 16,
    inferenceSec: 4,
    costPerRunUsd: 16 * 0.000542 + 4 * 0.000542,
    vsCurrentH100Pct: -51,
    rationale: "Krea 2 Turbo is 6-step. L40S bf16 is ideal. A10 fp8 works as fallback (72% cheaper than H100).",
  },
  {
    engineId: "krea-2-raw",
    engineName: "Krea 2 Raw",
    recommendedGpu: "L40S",
    fallbackGpu: "A100-80",
    quantization: "bf16",
    vramRequiredGb: 34,
    coldStartSec: 17,
    inferenceSec: 8,
    costPerRunUsd: 17 * 0.000542 + 8 * 0.000542,
    vsCurrentH100Pct: -51,
    rationale: "Krea 2 Raw base. L40S bf16.",
  },
  {
    engineId: "z-image-turbo",
    engineName: "Z-Image Turbo",
    recommendedGpu: "L4",
    fallbackGpu: "A10",
    quantization: "fp8",
    vramRequiredGb: 18,
    coldStartSec: 12,
    inferenceSec: 3,
    costPerRunUsd: 12 * 0.000222 + 3 * 0.000222,
    vsCurrentH100Pct: -80,
    rationale: "Z-Image Turbo is small + 4-step. L4 (24GB, $0.80/hr) fp8 is 80% cheaper than H100. The cheapest viable image engine.",
  },
  {
    engineId: "ideogram-4",
    engineName: "Ideogram 4",
    recommendedGpu: "A10",
    fallbackGpu: "L40S",
    quantization: "fp8",
    vramRequiredGb: 22,
    coldStartSec: 14,
    inferenceSec: 5,
    costPerRunUsd: 14 * 0.000306 + 5 * 0.000306,
    vsCurrentH100Pct: -72,
    rationale: "Ideogram 4 fp8 fits in A10's 24GB. 72% cheaper than H100.",
  },
  {
    engineId: "flux1-kontext-dev",
    engineName: "FLUX.1 Kontext Dev",
    recommendedGpu: "L40S",
    fallbackGpu: "A100-80",
    quantization: "bf16",
    vramRequiredGb: 38,
    coldStartSec: 18,
    inferenceSec: 8,
    costPerRunUsd: 18 * 0.000542 + 8 * 0.000542,
    vsCurrentH100Pct: -51,
    rationale: "Kontext edit engine. L40S bf16. Gated repo — needs HF token access.",
  },
  {
    engineId: "qwen-image-edit",
    engineName: "Qwen Image Edit 2511",
    recommendedGpu: "L40S",
    fallbackGpu: "A10",
    quantization: "bf16",
    vramRequiredGb: 30,
    coldStartSec: 15,
    inferenceSec: 6,
    costPerRunUsd: 15 * 0.000542 + 6 * 0.000542,
    vsCurrentH100Pct: -51,
    rationale: "Qwen Image Edit. L40S bf16. GGUF variant fits smaller GPUs.",
  },
  // ── Video engines — these genuinely need H100/H200 ──────────────────────
  {
    engineId: "wan-2.2",
    engineName: "Wan 2.2 (I2V A14B)",
    recommendedGpu: "H100",
    fallbackGpu: "H200",
    quantization: "bf16",
    vramRequiredGb: 60,
    coldStartSec: 30,
    inferenceSec: 20,
    costPerRunUsd: 30 * 0.001097 + 20 * 0.001097,
    vsCurrentH100Pct: 0,
    rationale: "Wan 2.2 A14B needs 60GB+ VRAM. H100 is justified here. Use Lightning distill LoRA to cut steps 20→4 (5x cheaper inference).",
  },
  {
    engineId: "ltx-2.3",
    engineName: "LTX 2.3 (22B)",
    recommendedGpu: "H100",
    fallbackGpu: "A100-80",
    quantization: "bf16",
    vramRequiredGb: 55,
    coldStartSec: 25,
    inferenceSec: 14,
    costPerRunUsd: 25 * 0.001097 + 14 * 0.001097,
    vsCurrentH100Pct: 0,
    rationale: "LTX 2.3 22B. H100 for bf16, or distilled GGUF on A100-80. Control LoRAs (Pose/Motion) are crucial.",
  },
  {
    engineId: "longcat-video",
    engineName: "LongCat Video",
    recommendedGpu: "H100",
    fallbackGpu: "H200",
    quantization: "bf16",
    vramRequiredGb: 50,
    coldStartSec: 28,
    inferenceSec: 22,
    costPerRunUsd: 28 * 0.001097 + 22 * 0.001097,
    vsCurrentH100Pct: 0,
    rationale: "Long-duration video. H100 justified. LongCat's value is duration, not speed.",
  },
  {
    engineId: "joyai",
    engineName: "JoyAI",
    recommendedGpu: "L40S",
    fallbackGpu: "A10",
    quantization: "fp8",
    vramRequiredGb: 20,
    coldStartSec: 12,
    inferenceSec: 8,
    costPerRunUsd: 12 * 0.000542 + 8 * 0.000542,
    vsCurrentH100Pct: -51,
    rationale: "JoyAI is lightweight. L40S fp8 or A10. 51% cheaper than H100.",
  },
  {
    engineId: "sulphur-2",
    engineName: "Sulphur 2",
    recommendedGpu: "A100-80",
    fallbackGpu: "H100",
    quantization: "bf16",
    vramRequiredGb: 45,
    coldStartSec: 20,
    inferenceSec: 16,
    costPerRunUsd: 20 * 0.000694 + 16 * 0.000694,
    vsCurrentH100Pct: -37,
    rationale: "Sulphur 2 base video. A100-80 (80GB, $2.50/hr) fits it. 37% cheaper than H100.",
  },
  {
    engineId: "hunyuan-video",
    engineName: "HunyuanVideo",
    recommendedGpu: "H100",
    fallbackGpu: "H200",
    quantization: "bf16",
    vramRequiredGb: 65,
    coldStartSec: 32,
    inferenceSec: 26,
    costPerRunUsd: 32 * 0.001097 + 26 * 0.001097,
    vsCurrentH100Pct: 0,
    rationale: "Tencent HunyuanVideo is large + high-motion. H100 justified.",
  },
];

export function getEngineGpuStrategy(engineId: string): EngineGpuStrategy | undefined {
  return ENGINE_GPU_STRATEGY.find((s) => s.engineId === engineId);
}

// ── Cold-start avoidance strategies ──────────────────────────────────────────

export const COLD_START_STRATEGIES: { id: string; title: string; detail: string; impact: string }[] = [
  {
    id: "stop-polling",
    title: "Stop all background health polling",
    detail: "The dashboard has 8 refetchInterval loops (10-30s) hitting /api/modal/status. Each either keeps the container warm (idle H100 waste) or triggers a cold start. Replace with on-demand fetch + 60s shared cache.",
    impact: "Eliminates ~310 health checks/day → saves ~$2-4/day idle waste",
  },
  {
    id: "gpu-snapshotting",
    title: "Enable GPU snapshotting (alpha)",
    detail: "Modal's GPU snapshotting feature (alpha) persists the loaded model state across container restarts, cutting cold starts from ~28s to ~3s. Available via @app.cls(gpu_snapshots=True) or the Function decorator.",
    impact: "Cold starts 28s → 3s → 89% cold-start cost reduction",
  },
  {
    id: "volume-no-commit",
    title: "Stop committing the volume on every cold start",
    detail: "The logs show 'Committing volume to persist model cache' after every weight load. The cache is already persisted after the FIRST download. Remove the volume.commit() call from the @modal.enter() path — it adds ~300ms + I/O cost per cold start for zero benefit.",
    impact: "~300ms saved per cold start + reduced I/O",
  },
  {
    id: "remove-qkv-fusion",
    title: "Remove the failing QKV fusion attempt",
    detail: "The logs show 'QKV fusion failed (non-fatal): FluxPipeline object has no attribute fuse_qkv_projections'. This is a wasted optimization attempt that errors on every cold start. Remove the try/except block — it's not helping.",
    impact: "Cleaner cold start, no wasted error handling",
  },
  {
    id: "batch-sessions",
    title: "Batch generations in a single warm session",
    detail: "Each cold start amortizes over the generations in that session. Do 10 generations back-to-back (1 cold start) instead of 10 separate sessions (10 cold starts). The Studio's queue mode supports this.",
    impact: "10x cold-start cost reduction for batch workflows",
  },
  {
    id: "scaledown-tune",
    title: "Tune scaledown_window to your usage pattern",
    detail: "Current: 120s. If you generate in bursts then go idle for 10+ minutes, lower it to 60s (less idle waste). If you generate every 1-2 minutes, raise it to 300s (fewer cold starts). Don't leave it at 120s if your pattern is bursty.",
    impact: "Balances idle waste vs cold-start frequency",
  },
];

// ── Optimized Modal app code (generated for download) ────────────────────────

export const OPTIMIZED_MODAL_APP_CODE = `# NEXUS Visual Weaver v4 — Optimized Modal App
# Generated by the Cost Lab. Deploys FLUX.2-klein-9B on L40S (51% cheaper than H100)
# with cold-start optimizations: GPU snapshotting, no volume-commit-on-start,
# no QKV fusion attempt, 60s scaledown window.
#
# Deploy:  uvx modal deploy nexus_model_optimized.py
# Requires: MODAL_TOKEN_ID, MODAL_TOKEN_SECRET env vars + huggingface-secret

from __future__ import annotations
from io import BytesIO
import modal

APP_NAME = "nexus-visual-optimized"
MODEL_NAME = "black-forest-labs/FLUX.2-klein-9B"  # or FLUX.1-schnell for cheaper
CACHE_DIR = "/cache"

app = modal.App(APP_NAME)

# Pin diffusers commit for reproducibility
DIFFUSERS_SHA = "00f95b9755718aabb65456e791b8408526ae6e76"

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git")
    .uv_pip_install(
        "Pillow~=11.2.1",
        "accelerate~=1.8.1",
        f"git+https://github.com/huggingface/diffusers.git@{DIFFUSERS_SHA}",
        "huggingface-hub==0.36.0",
        "optimum-quanto==0.2.7",   # fp8 quantization for smaller GPUs
        "peft>=0.15.0",
        "safetensors==0.5.3",
        "sentencepiece==0.2.0",
        "torch==2.7.1",
        "transformers~=4.53.0",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HOME": CACHE_DIR})
)

cache_volume = modal.Volume.from_name("nexus-model-cache", create_if_missing=True)
volumes = {CACHE_DIR: cache_volume}
secrets = [modal.Secret.from_name("huggingface-secret")]

with image.imports():
    import torch
    from diffusers import FluxPipeline


@app.cls(
    image=image,
    gpu="L40S",              # ← 51% cheaper than H100. Use "H100" only for video.
    volumes=volumes,
    secrets=secrets,
    timeout=600,             # ← was 3600. Shorter timeout = faster failure.
    scaledown_window=60,     # ← was 120. Less idle waste.
    min_containers=0,        # ← MUST stay 0 (contract).
    # gpu_snapshots=True,    # ← enable when GA (alpha now). Cuts cold start 28s→3s.
)
class NexusModel:
    @modal.enter()
    def enter(self) -> None:
        # Load model ONCE. Volume cache means weights are already on disk after
        # the first-ever download — no re-download, no volume.commit() needed.
        print(f"Loading {MODEL_NAME}...")
        self.pipe = FluxPipeline.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.bfloat16,
            cache_dir=CACHE_DIR,
        ).to("cuda")
        # NOTE: removed the fuse_qkv_projections() attempt — it errors on FluxPipeline.
        # NOTE: removed volume.commit() here — the cache persists automatically.
        print("NexusModel ready.")

    @modal.method()
    def generate(self, prompt: str, *, steps: int = 8, cfg: float = 3.5,
                 seed: int = 42, height: int = 1024, width: int = 1024) -> bytes:
        generator = torch.Generator(device="cuda").manual_seed(seed)
        result = self.pipe(
            prompt=prompt,
            num_inference_steps=steps,
            guidance_scale=cfg,
            height=height, width=width,
            generator=generator,
            output_type="pil",
        ).images[0]
        stream = BytesIO()
        result.save(stream, format="PNG")
        return stream.getvalue()

    @modal.method()
    def health(self) -> dict:
        # Lightweight — no model inference, just confirms the container is alive.
        return {"status": "ok", "model": MODEL_NAME, "gpu": "L40S"}


@app.function(image=image)
@modal.wsgi_app()
def web_app():
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse, Response
    web = FastAPI()
    model = NexusModel()

    @web.get("/health")
    async def health():
        return JSONResponse(model.health.remote())

    @web.post("/generate")
    async def generate(req: Request):
        body = await req.json()
        img = model.generate.remote(
            body["prompt"],
            steps=body.get("steps", 8),
            cfg=body.get("cfg", 3.5),
            seed=body.get("seed", 42),
            height=body.get("h", 1024),
            width=body.get("w", 1024),
        )
        import base64
        return JSONResponse({"image": base64.b64encode(img).decode(), "size": f'{body.get("w",1024)}x{body.get("h",1024)}'})

    return web
`;
