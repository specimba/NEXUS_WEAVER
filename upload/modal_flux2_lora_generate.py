"""Modal FLUX.2 + NO8D LoRA generation lane for NEXUS Visual Weaver.

This is the practical fallback when gated edit models are unavailable. It runs
the same FLUX.2-klein-9B family used by the Space and applies public NO8D
control/style LoRAs when compatible.

Run:
  $env:UV_CACHE_DIR=(Resolve-Path .uv-cache).Path
  $env:UV_TOOL_DIR=(Resolve-Path .uv-tools).Path
  uvx modal run scripts/modal_flux2_lora_generate.py --output-path outputs/modal/flux2-lora-smoke.png --steps 8
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import modal


APP_NAME = "nexus-flux2-lora-generate"
MODEL_NAME = "black-forest-labs/FLUX.2-klein-9B"
CACHE_DIR = "/cache"

DEFAULT_PROMPT = (
    "A Slavic high-fashion model wearing a structured black patent leather long coat, "
    "Chantilly lace neckline, crimson hardware, platform boots, rain-slick neon city, "
    "floating NEXUS sigils, cinematic editorial lighting, coherent hands and face, "
    "high material fidelity, glossy reflections"
)

DEFAULT_LORAS = (
    ("NO8D/BodyControl", "body", 0.75),
    ("NO8D/FaceControl", "face", 0.65),
    ("NO8D/ImagingControl", "imaging", 0.45),
)

app = modal.App(APP_NAME)

diffusers_commit_sha = "00f95b9755718aabb65456e791b8408526ae6e76"

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git")
    .uv_pip_install(
        "Pillow~=11.2.1",
        "accelerate~=1.8.1",
        f"git+https://github.com/huggingface/diffusers.git@{diffusers_commit_sha}",
        "huggingface-hub==0.36.0",
        "optimum-quanto==0.2.7",
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

cache_volume = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
volumes = {CACHE_DIR: cache_volume}
secrets = [modal.Secret.from_name("huggingface-secret")]


with image.imports():
    import torch
    from diffusers import FluxPipeline


@app.cls(image=image, gpu="B200", volumes=volumes, secrets=secrets, timeout=3600)
class Flux2LoraGenerator:
    @modal.enter()
    def enter(self) -> None:
        print(f"Loading {MODEL_NAME}...")
        self.pipe = FluxPipeline.from_pretrained(
            MODEL_NAME,
            torch_dtype=torch.bfloat16,
            cache_dir=CACHE_DIR,
        ).to("cuda")

    @modal.method()
    def generate(
        self,
        prompt: str,
        *,
        steps: int = 8,
        guidance_scale: float = 3.5,
        seed: int = 42,
        height: int = 1024,
        width: int = 1024,
        use_loras: bool = True,
    ) -> dict[str, bytes | list[dict[str, str | float]]]:
        lora_status: list[dict[str, str | float]] = []
        active_adapters: list[str] = []
        active_weights: list[float] = []

        if use_loras:
            for repo_id, adapter_name, weight in DEFAULT_LORAS:
                try:
                    self.pipe.load_lora_weights(repo_id, adapter_name=adapter_name)
                    active_adapters.append(adapter_name)
                    active_weights.append(weight)
                    lora_status.append({"repo_id": repo_id, "adapter": adapter_name, "status": "loaded", "weight": weight})
                except Exception as exc:
                    lora_status.append({"repo_id": repo_id, "adapter": adapter_name, "status": "failed", "error": str(exc)[:240]})

            if active_adapters:
                self.pipe.set_adapters(active_adapters, adapter_weights=active_weights)

        generator = torch.Generator(device="cuda").manual_seed(seed)
        result = self.pipe(
            prompt=prompt,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
            height=height,
            width=width,
            generator=generator,
            output_type="pil",
        ).images[0]

        stream = BytesIO()
        result.save(stream, format="PNG")
        return {"image": stream.getvalue(), "lora_status": lora_status}


@app.local_entrypoint()
def main(
    output_path: str = "outputs/modal/flux2-lora-smoke.png",
    prompt: str = DEFAULT_PROMPT,
    steps: int = 8,
    guidance_scale: float = 3.5,
    seed: int = 42,
    size: int = 1024,
    use_loras: bool = True,
) -> None:
    output_path_obj = Path(output_path)
    output_path_obj.parent.mkdir(parents=True, exist_ok=True)
    result = Flux2LoraGenerator().generate.remote(
        prompt,
        steps=steps,
        guidance_scale=guidance_scale,
        seed=seed,
        height=size,
        width=size,
        use_loras=use_loras,
    )
    output_path_obj.write_bytes(result["image"])
    print("lora_status:", result["lora_status"])
    print(f"wrote {output_path_obj}")
