"""NEXUS Visual Weaver — Krea 2 Turbo Image Generation Engine

Krea 2 Turbo is Krea AI's fast text-to-image model. Uses Krea2Pipeline
(custom transformer + Qwen3VL text encoder). LoRA-compatible via PEFT.

Model: krea/Krea-2-Turbo (123K downloads on HF)
Architecture: Krea2Transformer2DModel + Qwen3VLModel + AutoencoderKLQwenImage
Pipeline: diffusers.Krea2Pipeline (requires latest diffusers from git)

Deploy:
  modal deploy modal-apps/nexus_krea2_turbo.py
"""
from __future__ import annotations
import time
from typing import Any
import modal

APP_NAME = "nexus-krea2-turbo"
MODEL_ID = "krea/Krea-2-Turbo"
HF_CACHE_DIR = "/root/.cache/huggingface"
MINUTES = 60

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git")
    .uv_pip_install(
        "Pillow~=11.2.1", "accelerate~=1.8.1",
        "git+https://github.com/huggingface/diffusers.git",  # Krea2Pipeline is recent
        "huggingface-hub==0.36.0", "optimum-quanto==0.2.7", "peft>=0.15.0",
        "safetensors>=0.8.0", "sentencepiece==0.2.0", "torch==2.7.1",
        "transformers~=4.53.0", "fastapi[standard]",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HOME": HF_CACHE_DIR})
)

# REUSE the existing hf-hub-cache volume — Krea 2 weights cache alongside FLUX
hf_cache_vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
volumes = {HF_CACHE_DIR: hf_cache_vol}
secrets = [modal.Secret.from_name("huggingface-secret")]


@app.cls(
    image=image,
    gpu="H100",
    volumes=volumes,
    secrets=secrets,
    timeout=20 * MINUTES,
    scaledown_window=15 * MINUTES,
    min_containers=0,
    max_containers=1,
    cpu=8,
    memory=65536,
)
class NexusKrea2Generator:
    """Krea 2 Turbo generator. Model loads in enter(); web routes in asgi_app()."""

    @modal.enter()
    def enter(self) -> None:
        import torch
        from diffusers import Krea2Pipeline

        print(f"Loading {MODEL_ID}...")
        t0 = time.time()
        self.pipe = Krea2Pipeline.from_pretrained(
            MODEL_ID, torch_dtype=torch.bfloat16, cache_dir=HF_CACHE_DIR
        )
        self.pipe.to("cuda")
        self.load_time = time.time() - t0
        print(f"{MODEL_ID} loaded in {self.load_time:.1f}s")

    @modal.asgi_app()
    def web_app(self):
        import base64, io
        import torch
        from fastapi import FastAPI, Request
        from fastapi.responses import JSONResponse

        web = FastAPI()

        @web.get("/health")
        async def health():
            return {
                "status": "ok",
                "model": MODEL_ID,
                "gpu": "H100",
                "load_time_s": getattr(self, "load_time", 0),
            }

        @web.post("/generate")
        async def generate(request: Request):
            body = await request.json()
            prompt = body.get("prompt", "")
            negative_prompt = body.get("negative_prompt", "")
            steps = body.get("steps", 4)
            cfg = body.get("cfg", 1.0)
            seed = body.get("seed", 42)
            height = body.get("height", 1024)
            width = body.get("width", 1024)
            loras = body.get("loras", [])

            t0 = time.time()
            lora_status = []
            active_adapters = []
            active_weights = []

            if loras:
                for lora in loras:
                    repo = lora.get("repo", "")
                    adapter = lora.get("adapter", "")
                    weight = float(lora.get("weight", 0.7))
                    weight_name = lora.get("weight_name", "")
                    if not repo:
                        continue
                    try:
                        load_kwargs = {}
                        if adapter:
                            load_kwargs["adapter_name"] = adapter
                        if weight_name:
                            load_kwargs["weight_name"] = weight_name
                        self.pipe.load_lora_weights(repo, **load_kwargs)
                        active_adapters.append(adapter or repo.split("/")[-1])
                        active_weights.append(weight)
                        lora_status.append({"repo": repo, "status": "loaded", "weight": weight})
                    except Exception as exc:
                        lora_status.append({"repo": repo, "status": "failed", "error": str(exc)[:300]})
                if active_adapters:
                    try:
                        self.pipe.set_adapters(active_adapters, adapter_weights=active_weights)
                    except Exception as set_err:
                        print(f"set_adapters failed: {set_err}")

            generator = torch.Generator(device="cuda").manual_seed(int(seed))
            result = self.pipe(
                prompt=prompt,
                negative_prompt=negative_prompt if negative_prompt else None,
                num_inference_steps=int(steps),
                guidance_scale=float(cfg),
                height=int(height),
                width=int(width),
                generator=generator,
                output_type="pil",
            ).images[0]

            gen_ms = (time.time() - t0) * 1000
            buf = io.BytesIO()
            result.save(buf, format="PNG")
            image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

            if active_adapters:
                self.pipe.unload_lora_weights()

            return JSONResponse({
                "image": image_b64,
                "ms": int(gen_ms),
                "size": f"{width}x{height}",
                "model": MODEL_ID,
                "lora_status": lora_status,
                "seed": int(seed),
            })

        return web
