"""NEXUS Visual Weaver — SDXL Pony Image Generation Engine

SDXL with Pony Diffusion V6 XL — the community standard for Stable Yogi's
realism LoRAs. Uses StableDiffusionXLPipeline (diffusers). LoRA-compatible.

The Pony V6 checkpoint is the base for Stable Yogi's entire realism LoRA
catalog (47K+ downloads on the flagship realism LoRA alone). This app
unlocks all 15 sy-* LoRAs in the NEXUS Weaver library.

Model: stabilityai/stable-diffusion-xl-base-1.0 + Pony V6 LoRA
Architecture: UNet (SDXL) + CLIP-L + CLIP-G
Pipeline: diffusers.StableDiffusionXLPipeline

Deploy:
  modal deploy modal-apps/nexus_sdxl_pony.py

Settings (community standard for Pony realism):
  Steps: 30 | CFG: 7.0 | Sampler: DPM++ 2M Karras | Clip skip: 2
  Quality tokens: score_9, score_8_up, score_7_up (Pony-specific)
"""
import time
from typing import Any
import modal

APP_NAME = "nexus-sdxl-pony"
# Pony V6 XL — the community-standard checkpoint for Stable Yogi LoRAs
# Uses the SDXL base architecture with the Pony fine-tune applied.
MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"
PONY_LORA_REPO = "stablediffusionapi/pony-diffusion-v6-xl"
HF_CACHE_DIR = "/root/.cache/huggingface"
MINUTES = 60

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git")
    .uv_pip_install(
        "Pillow~=11.2.1", "accelerate~=1.8.1",
        "diffusers~=0.33.1",  # SDXL is stable in released diffusers (no git needed)
        "huggingface-hub==0.36.0", "peft>=0.15.0",
        "safetensors>=0.8.0", "sentencepiece==0.2.0", "torch==2.7.1",
        "transformers~=4.53.0", "fastapi[standard]",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HOME": HF_CACHE_DIR})
)

# REUSE the existing hf-hub-cache volume — SDXL weights cache alongside FLUX/Krea
# v5.45: Also use a lora-cache volume for Civitai LoRAs (prevents re-downloading
# 649MB on every generation — the #1 performance bottleneck from the audit).
hf_cache_vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
lora_cache_vol = modal.Volume.from_name("lora-cache", create_if_missing=True)
LORA_CACHE_DIR = "/root/.cache/loras"
volumes = {HF_CACHE_DIR: hf_cache_vol, LORA_CACHE_DIR: lora_cache_vol}
# Both HuggingFace (gated SDXL) + Civitai (LoRA downloads) tokens
secrets = [
    modal.Secret.from_name("huggingface-secret"),
    modal.Secret.from_name("civitai-secret"),
]


@app.cls(
    image=image,
    gpu="L40S",  # SDXL fits in ~10GB VRAM — L40S (48GB) is plenty + cheaper than H100
    volumes=volumes,
    secrets=secrets,
    timeout=10 * MINUTES,
    scaledown_window=5 * MINUTES,  # scale to zero after 5min idle (cost: $0)
    min_containers=0,  # never keep idle containers (credit-conscious)
    max_containers=1,
    cpu=4,
    memory=32768,
)
class NexusSDXLPonyGenerator:
    """SDXL Pony V6 generator. Model loads in enter(); web routes in asgi_app()."""

    @modal.enter()
    def enter(self) -> None:
        import torch
        from diffusers import StableDiffusionXLPipeline, DPMSolverMultistepScheduler

        print(f"Loading {MODEL_ID}...")
        t0 = time.time()

        self.pipe = StableDiffusionXLPipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.float16,  # SDXL uses fp16 (not bf16)
            variant="fp16",
            cache_dir=HF_CACHE_DIR,
        )

        # DPM++ 2M Karras — the community-standard sampler for Pony realism
        self.pipe.scheduler = DPMSolverMultistepScheduler.from_config(
            self.pipe.scheduler.config,
            use_karras_sigmas=True,
            algorithm_type="dpmsolver++",
        )

        self.pipe.to("cuda")

        # Load the Pony V6 LoRA on startup — it's the base checkpoint modifier
        # that makes the model understand Pony-style prompts (score_9, etc.)
        # v5.49: The repo has multiple .safetensors files — specify weight_name
        try:
            # Try loading with explicit weight_name (the main Pony V6 file)
            self.pipe.load_lora_weights(
                PONY_LORA_REPO,
                adapter_name="pony-v6",
                weight_name="pony-diffusion-v6-xl.safetensors",
            )
            self.pipe.set_adapters(["pony-v6"], adapter_weights=[1.0])
            print(f"Pony V6 LoRA loaded from {PONY_LORA_REPO}")
        except Exception as e:
            print(f"Warning: Pony V6 LoRA failed to load with weight_name: {e}")
            print("Trying without weight_name (may pick wrong file)...")
            try:
                self.pipe.load_lora_weights(PONY_LORA_REPO, adapter_name="pony-v6")
                self.pipe.set_adapters(["pony-v6"], adapter_weights=[1.0])
                print(f"Pony V6 LoRA loaded from {PONY_LORA_REPO} (fallback)")
            except Exception as e2:
                print(f"Warning: Pony V6 LoRA failed completely: {e2}")
                print("Continuing with base SDXL — prompts should still work but won't have Pony aesthetics.")

        self.load_time = time.time() - t0
        print(f"{MODEL_ID} + Pony V6 loaded in {self.load_time:.1f}s")

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
                "gpu": "L40S",
                "lora": "pony-v6",
                "load_time_s": getattr(self, "load_time", 0),
            }

        @web.post("/generate")
        async def generate(request: Request):
            body = await request.json()
            prompt = body.get("prompt", "")
            negative_prompt = body.get("negative_prompt", "")
            # SDXL Pony community standard: 30 steps, CFG 7.0
            steps = body.get("steps", 30)
            cfg = body.get("cfg", 7.0)
            seed = body.get("seed", 42)
            height = body.get("height", 1024)
            width = body.get("width", 1024)
            loras = body.get("loras", [])

            t0 = time.time()
            lora_status = []
            active_adapters = ["pony-v6"]  # base Pony V6 is always active
            active_weights = [1.0]

            # Load user-selected LoRAs (Stable Yogi realism, etc.)
            # v5.44: Handle BOTH HuggingFace repo IDs AND Civitai URLs.
            # Civitai URLs are flagged with weight_name="__civitai_url__".
            # The app resolves them via the Civitai API (free, no auth) and
            # downloads the .safetensors file to a temp path, then loads it.
            if loras:
                for lora in loras:
                    repo = lora.get("repo", "")
                    adapter = lora.get("adapter", "")
                    weight = float(lora.get("weight", 0.5))  # rule #5: max 0.5
                    weight_name = lora.get("weight_name", "")
                    if not repo:
                        continue
                    try:
                        # Check if this is a pre-resolved Civitai CDN URL (resolved by the Next.js backend)
                        if weight_name == "__civitai_resolved__":
                            # The repo field is already a direct CDN download URL with token.
                            # v5.45: Cache on the lora-cache VOLUME (not /tmp) so the LoRA
                            # persists across container restarts. Cache key = URL hash.
                            import tempfile, os, subprocess, hashlib
                            # Extract model ID from the URL for a readable cache filename
                            url_hash = hashlib.md5(repo.encode()).hexdigest()[:12]
                            cache_file = os.path.join(LORA_CACHE_DIR, f"civitai_{url_hash}.safetensors")

                            if os.path.exists(cache_file) and os.path.getsize(cache_file) > 1000:
                                file_size_mb = os.path.getsize(cache_file) / (1024 * 1024)
                                print(f"[civitai] CACHE HIT — {cache_file} ({file_size_mb:.1f}MB)")
                            else:
                                print(f"[civitai] CACHE MISS — downloading from CDN...")
                                os.makedirs(LORA_CACHE_DIR, exist_ok=True)
                                dl_result = subprocess.run(
                                    ["curl", "-sS", "-L", "--max-time", "120", "-o", cache_file, repo],
                                    capture_output=True, text=True, timeout=180
                                )
                                if dl_result.returncode != 0 or not os.path.exists(cache_file) or os.path.getsize(cache_file) < 1000:
                                    raise ValueError(f"curl download failed (rc={dl_result.returncode}): {dl_result.stderr[:200]}")
                                file_size_mb = os.path.getsize(cache_file) / (1024 * 1024)
                                print(f"[civitai] Downloaded {file_size_mb:.1f}MB — cached at {cache_file}")

                            load_kwargs = {}
                            if adapter:
                                load_kwargs["adapter_name"] = adapter
                            self.pipe.load_lora_weights(cache_file, **load_kwargs)
                            active_adapters.append(adapter or "civitai_lora")
                            active_weights.append(weight)
                            lora_status.append({"repo": repo[:80], "status": "loaded", "weight": weight, "source": "civitai_cdn", "size_mb": round(file_size_mb, 1), "cached": True})
                        elif weight_name == "__civitai_url__" or "civitai" in repo:
                            # Fallback: resolve inside the Modal app (may fail if Civitai blocks Modal's IP)
                            import re, urllib.request, tempfile, os, subprocess
                            import json as _json
                            model_id_match = re.search(r"models/(\d+)", repo)
                            if not model_id_match:
                                raise ValueError(f"Could not extract model ID from Civitai URL: {repo}")
                            model_id = model_id_match.group(1)
                            token = os.environ.get("CIVITAI_API_TOKEN", "")
                            api_url = f"https://civitai.com/api/v1/models/{model_id}?token={token}" if token else f"https://civitai.com/api/v1/models/{model_id}"
                            print(f"[civitai] Resolving model {model_id} via API...")
                            api_req = urllib.request.Request(api_url, headers={"Authorization": f"Bearer {token}"} if token else {})
                            with urllib.request.urlopen(api_req, timeout=15) as resp:
                                model_data = _json.loads(resp.read())
                            versions = model_data.get("modelVersions", [])
                            if not versions:
                                raise ValueError(f"No versions found for Civitai model {model_id}")
                            latest = versions[0]
                            download_url = latest.get("downloadUrl", "")
                            if not download_url:
                                raise ValueError(f"No download URL for Civitai model {model_id}")
                            if token and "?" not in download_url:
                                download_url = f"{download_url}?token={token}"
                            elif token:
                                download_url = f"{download_url}&token={token}"
                            print(f"[civitai] Downloading {download_url[:80]}...")
                            tmp_dir = tempfile.mkdtemp()
                            tmp_file = os.path.join(tmp_dir, f"civitai_{model_id}.safetensors")
                            dl_result = subprocess.run(
                                ["curl", "-sS", "-L", "--max-time", "120", "-o", tmp_file, download_url],
                                capture_output=True, text=True, timeout=180
                            )
                            if dl_result.returncode != 0 or not os.path.exists(tmp_file) or os.path.getsize(tmp_file) < 1000:
                                raise ValueError(f"curl download failed (rc={dl_result.returncode}): {dl_result.stderr[:200]}")
                            file_size_mb = os.path.getsize(tmp_file) / (1024 * 1024)
                            print(f"[civitai] Downloaded {file_size_mb:.1f}MB — loading as LoRA...")
                            load_kwargs = {}
                            if adapter:
                                load_kwargs["adapter_name"] = adapter
                            self.pipe.load_lora_weights(tmp_file, **load_kwargs)
                            active_adapters.append(adapter or f"civitai_{model_id}")
                            active_weights.append(weight)
                            lora_status.append({"repo": repo[:80], "status": "loaded", "weight": weight, "source": "civitai", "model_name": model_data.get("name", "?"), "size_mb": round(file_size_mb, 1)})
                        else:
                            # HuggingFace repo ID — load directly
                            load_kwargs = {}
                            if adapter:
                                load_kwargs["adapter_name"] = adapter
                            if weight_name:
                                load_kwargs["weight_name"] = weight_name
                            self.pipe.load_lora_weights(repo, **load_kwargs)
                            active_adapters.append(adapter or repo.split("/")[-1])
                            active_weights.append(weight)
                            lora_status.append({"repo": repo, "status": "loaded", "weight": weight, "source": "huggingface"})
                    except Exception as exc:
                        lora_status.append({"repo": repo[:80] if len(repo) > 80 else repo, "status": "failed", "error": str(exc)[:300]})

                # Set all active adapters (Pony V6 + user LoRAs)
                if len(active_adapters) > 1:
                    try:
                        self.pipe.set_adapters(active_adapters, adapter_weights=active_weights)
                    except Exception as set_err:
                        print(f"set_adapters failed: {set_err}")

            # Pony prompt format: prepend score tokens for quality
            # (Pony V6 was trained on score_9/score_8_up/score_7_up tags)
            pony_prompt = f"score_9, score_8_up, score_7_up, {prompt}" if not prompt.startswith("score_") else prompt

            # Standard Pony negative prompt
            if not negative_prompt:
                negative_prompt = "score_6, score_5, score_4, 3d, cartoon, anime, sketches, worst quality, low quality, watermark, signature, blurry, deformed"

            generator = torch.Generator(device="cuda").manual_seed(int(seed))
            result = self.pipe(
                prompt=pony_prompt,
                negative_prompt=negative_prompt,
                num_inference_steps=int(steps),
                guidance_scale=float(cfg),
                height=int(height),
                width=int(width),
                generator=generator,
                output_type="pil",
                clip_skip=2,  # Pony V6 uses clip_skip=2 (community standard)
            ).images[0]

            gen_ms = (time.time() - t0) * 1000
            buf = io.BytesIO()
            result.save(buf, format="PNG")
            image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

            # Unload user LoRAs but keep Pony V6 for the next call
            if len(active_adapters) > 1:
                # Only unload the user LoRAs (not pony-v6)
                user_adapters = [a for a in active_adapters if a != "pony-v6"]
                if user_adapters:
                    try:
                        self.pipe.unload_lora_weights()
                        # Reload Pony V6
                        self.pipe.load_lora_weights(PONY_LORA_REPO, adapter_name="pony-v6")
                        self.pipe.set_adapters(["pony-v6"], adapter_weights=[1.0])
                    except Exception:
                        pass

            return JSONResponse({
                "image": image_b64,
                "ms": int(gen_ms),
                "size": f"{width}x{height}",
                "model": MODEL_ID,
                "lora": "pony-v6",
                "lora_status": lora_status,
                "seed": int(seed),
                "prompt_used": pony_prompt[:200],
            })

        return web
