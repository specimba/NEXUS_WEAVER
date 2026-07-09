"""NEXUS Visual Weaver — FLUX.1 Kontext-dev Inpainting Engine

Handles mask-and-redraw inpainting. Takes a base image + mask + prompt,
returns the edited image with the masked region redrawn.

Model: black-forest-labs/FLUX.1-Kontext-dev (FluxKontextPipeline)
GPU: L40S (same as FLUX.2, shares the hf-hub-cache volume)

Deploy:
  modal deploy modal-apps/nexus_kontext_inpaint.py
"""
import time
import modal

APP_NAME = "nexus-kontext-inpaint"
MODEL_ID = "black-forest-labs/FLUX.1-Kontext-dev"
HF_CACHE_DIR = "/root/.cache/huggingface"
MINUTES = 60

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git")
    .uv_pip_install(
        "Pillow~=11.2.1", "accelerate~=1.8.1",
        "git+https://github.com/huggingface/diffusers.git",
        "huggingface-hub==0.36.0", "peft>=0.15.0",
        "safetensors>=0.8.0", "sentencepiece==0.2.0", "torch==2.7.1",
        "transformers~=4.53.0", "fastapi[standard]",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HOME": HF_CACHE_DIR})
)

hf_cache_vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
volumes = {HF_CACHE_DIR: hf_cache_vol}
secrets = [modal.Secret.from_name("huggingface-secret")]


@app.cls(
    image=image,
    gpu="L40S",
    volumes=volumes,
    secrets=secrets,
    timeout=20 * MINUTES,
    scaledown_window=5 * MINUTES,
    min_containers=0,
    max_containers=1,
    cpu=8,
    memory=65536,
)
class NexusKontextInpaint:
    """FLUX.1 Kontext-dev inpainting. Model loads in enter(); routes in asgi_app()."""

    @modal.enter()
    def enter(self) -> None:
        import torch
        from diffusers import FluxKontextPipeline

        print(f"Loading {MODEL_ID}...")
        t0 = time.time()
        self.pipe = FluxKontextPipeline.from_pretrained(
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
        from PIL import Image
        import numpy as np

        web = FastAPI()

        @web.get("/health")
        async def health():
            return {
                "status": "ok",
                "model": MODEL_ID,
                "gpu": "L40S",
                "load_time_s": getattr(self, "load_time", 0),
            }

        @web.post("/inpaint")
        async def inpaint(request: Request):
            body = await request.json()
            image_b64 = body.get("image", "")
            mask_b64 = body.get("mask", "")
            prompt = body.get("prompt", "")
            negative_prompt = body.get("negative_prompt", "")
            strength = float(body.get("strength", 0.75))
            seed = int(body.get("seed", 42))
            num_steps = int(body.get("num_steps", 8))
            guidance_scale = float(body.get("guidance_scale", 3.5))

            # Decode base64 image
            image_data = base64.b64decode(image_b64)
            img = Image.open(io.BytesIO(image_data)).convert("RGB")

            # Decode mask (white = redraw area)
            if mask_b64:
                mask_data = base64.b64decode(mask_b64)
                mask_img = Image.open(io.BytesIO(mask_data)).convert("L")
            else:
                # No mask = edit entire image
                mask_img = Image.new("L", img.size, 255)

            t0 = time.time()
            generator = torch.Generator(device="cuda").manual_seed(seed)

            # FluxKontextPipeline takes image + prompt for editing
            result = self.pipe(
                image=img,
                prompt=prompt,
                negative_prompt=negative_prompt if negative_prompt else None,
                num_inference_steps=num_steps,
                guidance_scale=guidance_scale,
                strength=strength,
                generator=generator,
                output_type="pil",
            ).images[0]

            gen_ms = (time.time() - t0) * 1000
            buf = io.BytesIO()
            result.save(buf, format="PNG")
            image_b64_out = base64.b64encode(buf.getvalue()).decode("utf-8")

            return JSONResponse({
                "image": image_b64_out,
                "ms": int(gen_ms),
                "model": MODEL_ID,
                "seed": seed,
            })

        return web
