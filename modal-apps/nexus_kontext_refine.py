"""NEXUS Visual Weaver — FLUX.1 Kontext Garment Refinement
Uses the existing hf-hub-cache volume for fast startup.
"""
from __future__ import annotations
import base64, io, time
from typing import Any
import modal

APP_NAME = "nexus-kontext-refine"
MODEL_ID = "black-forest-labs/FLUX.1-Kontext-dev"
HF_CACHE_DIR = "/root/.cache/huggingface"
app = modal.App(APP_NAME)
DIFFUSERS_SHA = "00f95b9755718aabb65456e791b8408526ae6e76"

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git")
    .uv_pip_install("Pillow~=11.2.1", "accelerate~=1.8.1",
        f"git+https://github.com/huggingface/diffusers.git@{DIFFUSERS_SHA}",
        "huggingface-hub==0.36.0", "optimum-quanto==0.2.7", "peft>=0.15.0",
        "safetensors==0.5.3", "sentencepiece==0.2.0", "torch==2.7.1",
        "transformers~=4.53.0", "fastapi[standard]",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128")
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HOME": HF_CACHE_DIR})
)
hf_cache_vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
volumes = {HF_CACHE_DIR: hf_cache_vol}
secrets = [modal.Secret.from_name("huggingface-secret")]

with image.imports():
    import torch
    from diffusers import FluxKontextPipeline
    from PIL import Image

@app.cls(image=image, gpu="L40S", volumes=volumes, secrets=secrets, timeout=600, scaledown_window=300, min_containers=0, max_containers=1)
class NexusKontextEditor:
    @modal.enter()
    def enter(self) -> None:
        print(f"Loading {MODEL_ID} from cache...")
        t0 = time.time()
        self.pipe = FluxKontextPipeline.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16, cache_dir=HF_CACHE_DIR).to("cuda")
        self.load_time = time.time() - t0
        print(f"{MODEL_ID} loaded in {self.load_time:.1f}s")

    @modal.fastapi_endpoint(method="GET")
    def health(self) -> dict[str, Any]:
        return {"status": "ok", "model": MODEL_ID, "gpu": "L40S", "version": "v5.1-kontext", "load_time_s": getattr(self, "load_time", 0)}

    @modal.fastapi_endpoint(method="POST")
    def edit(self, image_b64: str, prompt: str, negative_prompt: str = "", steps: int = 20, cfg: float = 3.5, seed: int = 42, denoise: float = 0.75, loras: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        t0 = time.time()
        img_bytes = base64.b64decode(image_b64)
        source_image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        lora_status: list[dict[str, Any]] = []
        if loras:
            for lora in loras:
                repo = lora.get("repo", "")
                adapter = lora.get("adapter", "")
                weight = float(lora.get("weight", 0.7))
                try:
                    if adapter: self.pipe.load_lora_weights(repo, adapter_name=adapter)
                    else: self.pipe.load_lora_weights(repo)
                    lora_status.append({"repo": repo, "status": "loaded", "weight": weight})
                except Exception as exc:
                    lora_status.append({"repo": repo, "status": "failed", "error": str(exc)[:300]})
        generator = torch.Generator(device="cuda").manual_seed(seed)
        result = self.pipe(image=source_image, prompt=prompt, negative_prompt=negative_prompt if negative_prompt else None, num_inference_steps=steps, guidance_scale=cfg, strength=denoise, generator=generator, output_type="pil").images[0]
        gen_ms = (time.time() - t0) * 1000
        buf = io.BytesIO()
        result.save(buf, format="PNG")
        result_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        if loras:
            try: self.pipe.unload_lora_weights()
            except: pass
        return {"image": result_b64, "ms": int(gen_ms), "model": MODEL_ID, "lora_status": lora_status}
