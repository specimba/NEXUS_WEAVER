"""NEXUS Visual Weaver — FLUX.2 Klein 9B Generation Engine

Uses Flux2KleinPipeline from the LATEST diffusers (no commit pin).
Model fits in ~29GB VRAM on L40S. 4 steps = sub-second generation.
Reuses the existing hf-hub-cache volume for fast startup.
"""
from __future__ import annotations
import base64, io, time
from typing import Any
import modal

APP_NAME = "nexus-flux2-klein9b"
MODEL_ID = "black-forest-labs/FLUX.2-klein-9B"
HF_CACHE_DIR = "/root/.cache/huggingface"  # matches the hf-hub-cache volume mount path

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git")
    .uv_pip_install(
        "Pillow~=11.2.1", "accelerate~=1.8.1",
        "git+https://github.com/huggingface/diffusers.git",  # LATEST — no commit pin (Flux2KleinPipeline is recent)
        "huggingface-hub==0.36.0", "optimum-quanto==0.2.7", "peft>=0.15.0",
        "safetensors>=0.8.0", "sentencepiece==0.2.0", "torch==2.7.1",
        "transformers~=4.53.0", "fastapi[standard]",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HOME": HF_CACHE_DIR})
)

# REUSE the existing hf-hub-cache volume (64.7GB — already has FLUX weights cached)
# This is the critical fix: the new apps were using empty volumes, causing 10-min cold starts.
hf_cache_vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
volumes = {HF_CACHE_DIR: hf_cache_vol}
secrets = [modal.Secret.from_name("huggingface-secret")]

with image.imports():
    import torch
    from diffusers import Flux2KleinPipeline  # FLUX.2-klein-9B requires Flux2KleinPipeline (NOT FluxPipeline)

@app.cls(image=image, gpu="L40S", volumes=volumes, secrets=secrets, timeout=600, scaledown_window=300, min_containers=0, max_containers=1)
class NexusFlux2Generator:
    @modal.enter()
    def enter(self) -> None:
        print(f"Loading {MODEL_ID} from cache...")
        t0 = time.time()
        self.pipe = Flux2KleinPipeline.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16, cache_dir=HF_CACHE_DIR).to("cuda")
        self.load_time = time.time() - t0
        print(f"{MODEL_ID} loaded in {self.load_time:.1f}s")

    @modal.fastapi_endpoint(method="GET")
    def health(self) -> dict[str, Any]:
        return {"status": "ok", "model": MODEL_ID, "gpu": "L40S", "version": "v5.1-flux2", "load_time_s": getattr(self, "load_time", 0)}

    @modal.fastapi_endpoint(method="POST")
    def generate(self, prompt: str, negative_prompt: str = "", steps: int = 10, cfg: float = 3.5, seed: int = 42, height: int = 1024, width: int = 1024, loras: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        t0 = time.time()
        lora_status: list[dict[str, Any]] = []
        active_adapters: list[str] = []
        active_weights: list[float] = []

        if loras:
            for lora in loras:
                repo = lora.get("repo", "")
                adapter = lora.get("adapter", "")
                weight = float(lora.get("weight", 0.7))
                weight_name = lora.get("weight_name", "")  # e.g. "4x-UltraSharpV2.safetensors"
                if not repo:
                    continue
                try:
                    # Pass weight_name when specified — prevents loading the wrong
                    # .safetensors file when a repo has multiple (e.g. UltraSharp V2
                    # has both "4x-UltraSharpV2.safetensors" and others).
                    load_kwargs: dict[str, Any] = {}
                    if adapter:
                        load_kwargs["adapter_name"] = adapter
                    if weight_name:
                        load_kwargs["weight_name"] = weight_name
                    self.pipe.load_lora_weights(repo, **load_kwargs)
                    active_adapters.append(adapter or repo.split("/")[-1])
                    active_weights.append(weight)
                    lora_status.append({"repo": repo, "adapter": adapter, "weight_name": weight_name, "status": "loaded", "weight": weight})
                except Exception as exc:
                    lora_status.append({"repo": repo, "adapter": adapter, "weight_name": weight_name, "status": "failed", "error": str(exc)[:300]})
            if active_adapters:
                self.pipe.set_adapters(active_adapters, adapter_weights=active_weights)

        generator = torch.Generator(device="cuda").manual_seed(seed)
        # NOTE: Flux2KleinPipeline does NOT accept negative_prompt (unlike FluxPipeline).
        # The Klein 9B model uses guidance_scale=1.0 (no CFG), so negative prompts
        # are not applicable. Passing negative_prompt causes:
        #   TypeError: Flux2KleinPipeline.__call__() got an unexpected keyword argument 'negative_prompt'
        pipe_kwargs: dict[str, Any] = {
            "prompt": prompt,
            "num_inference_steps": steps,
            "guidance_scale": cfg,
            "height": height,
            "width": width,
            "generator": generator,
            "output_type": "pil",
        }
        result = self.pipe(**pipe_kwargs).images[0]

        gen_ms = (time.time() - t0) * 1000
        buf = io.BytesIO()
        result.save(buf, format="PNG")
        image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

        if active_adapters:
            self.pipe.unload_lora_weights()

        return {
            "image": image_b64,
            "ms": int(gen_ms),
            "size": f"{width}x{height}",
            "model": MODEL_ID,
            "lora_status": lora_status,
            "lora_errors": {s["repo"]: s.get("error") for s in lora_status if s["status"] == "failed"} or None,
        }
