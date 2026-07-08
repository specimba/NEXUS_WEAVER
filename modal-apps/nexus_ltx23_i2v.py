"""NEXUS Visual Weaver — LTX 2.3 I2V Video Generation Engine (v3)

FIX (v3): Refactored from @modal.asgi_app() function → @app.cls with
@modal.enter() + @modal.asgi_app() method. The previous v2 loaded the model
INSIDE the web_app() function body → HTTP 404 "modal-http: invalid function
call" during cold start. With @modal.enter(), the model loads at container
start; routes are live as soon as enter() completes.

Deploy:
  modal deploy modal-apps/nexus_ltx23_i2v.py
"""
from __future__ import annotations
import time
from typing import Any
import modal

APP_NAME = "nexus-ltx23-i2v"
MODEL_ID = "Lightricks/LTX-2.3"
HF_CACHE_DIR = "/root/.cache/huggingface"
MINUTES = 60

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git", "ffmpeg")
    .uv_pip_install(
        "Pillow~=11.2.1", "accelerate~=1.8.1",
        "git+https://github.com/huggingface/diffusers.git",
        "huggingface-hub==0.36.0", "peft>=0.15.0",
        "safetensors>=0.8.0", "sentencepiece==0.2.0", "torch==2.7.1",
        "transformers~=4.53.0", "fastapi[standard]",
        "imageio[ffmpeg]",
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
    gpu="H100",
    volumes=volumes,
    secrets=secrets,
    timeout=15 * MINUTES,
    scaledown_window=15 * MINUTES,
    min_containers=0,
    max_containers=1,
    cpu=8,
    memory=65536,
)
class NexusLtx23Generator:
    """LTX 2.3 generator. Model loads in enter(); web routes in asgi_app()."""

    @modal.enter()
    def enter(self) -> None:
        import torch
        from diffusers import LTXPipeline

        print(f"Loading {MODEL_ID}...")
        t0 = time.time()
        self.pipe = LTXPipeline.from_pretrained(
            MODEL_ID, torch_dtype=torch.bfloat16, cache_dir=HF_CACHE_DIR
        )
        self.pipe.to("cuda")
        self.load_time = time.time() - t0
        print(f"{MODEL_ID} loaded in {self.load_time:.1f}s")

    @modal.asgi_app()
    def web_app(self):
        import base64
        import torch
        from fastapi import FastAPI, Request
        from fastapi.responses import JSONResponse
        from diffusers.utils import load_image, export_to_video

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
            image_b64 = body.get("image", "")
            prompt = body.get("prompt", "")
            num_frames = body.get("num_frames", 96)
            height = body.get("height", 512)
            width = body.get("width", 768)
            num_inference_steps = body.get("num_inference_steps", 25)
            guidance_scale = body.get("guidance_scale", 3.0)
            seed = body.get("seed", 42)

            image_data = base64.b64decode(image_b64)
            img_path = "/tmp/input.png"
            with open(img_path, "wb") as f:
                f.write(image_data)
            image = load_image(img_path)

            generator = torch.Generator(device="cuda").manual_seed(int(seed))
            output = self.pipe(
                prompt=prompt,
                image=image,
                num_frames=num_frames,
                height=height,
                width=width,
                num_inference_steps=num_inference_steps,
                guidance_scale=guidance_scale,
                generator=generator,
            ).frames[0]

            video_path = "/tmp/output.mp4"
            export_to_video(output, video_path, fps=24)

            with open(video_path, "rb") as f:
                video_b64 = base64.b64encode(f.read()).decode("utf-8")

            return JSONResponse({
                "video": video_b64,
                "frames": len(output),
                "fps": 24,
                "resolution": f"{width}x{height}",
                "seed": int(seed),
            })

        return web
