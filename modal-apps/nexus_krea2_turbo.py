"""NEXUS Visual Weaver — Krea 2 Turbo Image Generation Engine

Krea 2 Turbo is Krea AI's fast text-to-image model. Uses Krea2Pipeline
(custom transformer + Qwen3VL text encoder). LoRA-compatible via PEFT.

Model: krea/Krea-2-Turbo (123K downloads on HF)
Architecture: Krea2Transformer2DModel + Qwen3VLModel + AutoencoderKLQwenImage
Pipeline: diffusers.Krea2Pipeline (requires latest diffusers from git)

Deploy:
  modal deploy modal-apps/nexus_krea2_turbo.py
"""
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
        "transformers>=4.57.0",  # Qwen3VLModel requires >=4.55 (4.57 is latest 4.x)
        "fastapi[standard]",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HOME": HF_CACHE_DIR})
)

# REUSE the existing hf-hub-cache volume — Krea 2 weights cache alongside FLUX
hf_cache_vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
volumes = {HF_CACHE_DIR: hf_cache_vol}
secrets = [modal.Secret.from_name("huggingface-secret"), modal.Secret.from_name("civitai-secret")]


@app.cls(
    image=image,
    gpu="H100",
    volumes=volumes,
    secrets=secrets,
    timeout=20 * MINUTES,
    scaledown_window=5 * MINUTES,
    min_containers=0,
    max_containers=1,
    cpu=8,
    memory=65536,
)
class NexusKrea2Generator:
    """Krea 2 Turbo generator. Model loads in enter(); web routes in asgi_app()."""

    @modal.enter()
    def enter(self) -> None:
        import torch, json, os
        from diffusers import Krea2Pipeline
        from huggingface_hub import snapshot_download

        print(f"Loading {MODEL_ID}...")
        t0 = time.time()

        # FIX (v5.52): The Qwen3VL text encoder crashes because
        # config.rope_scaling is None in the text_config sub-config.
        # The crash is at modeling_qwen3_vl.py:297:
        #   self.mrope_section = config.rope_scaling.get("mrope_section", [24, 20, 20])
        # Previous fixes (v5.49-v5.50) tried to fix the config IN MEMORY,
        # but AutoModel.from_pretrained() re-reads config from the HF cache
        # files, ignoring the in-memory fix.
        #
        # CORRECT FIX: Patch the config.json file ON DISK in the HF cache
        # before loading. This way Krea2Pipeline.from_pretrained() reads the
        # FIXED config and the crash doesn't happen.
        print("Patching text_encoder config.json (rope_scaling fix)...")
        try:
            # Download the model snapshot (or find it in cache)
            # v5.54: Download ALL config + tokenizer files (not just text_encoder/config.json)
            # Previous version only downloaded text_encoder/config.json, so the tokenizer
            # files (vocab.json, merges.txt, tokenizer_config.json) were missing from
            # the cache → TypeError: expected str, bytes or os.PathLike object, not NoneType
            model_path = snapshot_download(
                MODEL_ID,
                cache_dir=HF_CACHE_DIR,
                allow_patterns=["*.json", "tokenizer*", "vocab*", "merges*", "special_tokens*"],
            )
            te_config_path = os.path.join(model_path, "text_encoder", "config.json")
            if os.path.exists(te_config_path):
                with open(te_config_path, "r") as f:
                    te_config = json.load(f)

                # Fix top-level rope_scaling
                # v5.53: rope_type must be "default" (not "mrope") — "mrope" is not
                # in ROPE_INIT_FUNCTIONS. The mrope behavior comes from mrope_section.
                patched = False
                needs_fix = False
                if not te_config.get("rope_scaling"):
                    te_config["rope_scaling"] = {"mrope_section": [24, 20, 20], "rope_type": "default"}
                    patched = True
                elif te_config["rope_scaling"].get("rope_type") == "mrope":
                    # Fix previous incorrect patch (rope_type was "mrope" → KeyError)
                    te_config["rope_scaling"]["rope_type"] = "default"
                    patched = True

                # Fix text_config.rope_scaling (where the actual crash happens)
                tc = te_config.get("text_config", {})
                if not tc.get("rope_scaling"):
                    tc["rope_scaling"] = {"mrope_section": [24, 20, 20], "rope_type": "default"}
                    te_config["text_config"] = tc
                    patched = True
                elif tc["rope_scaling"].get("rope_type") == "mrope":
                    tc["rope_scaling"]["rope_type"] = "default"
                    te_config["text_config"] = tc
                    patched = True

                if patched:
                    with open(te_config_path, "w") as f:
                        json.dump(te_config, f, indent=2)
                    print(f"PATCHED {te_config_path} — added rope_scaling to top-level + text_config")
                else:
                    print(f"Config already has rope_scaling — no patch needed")
            else:
                print(f"WARNING: {te_config_path} not found — will try loading without patch")
        except Exception as e:
            print(f"WARNING: Config patch failed: {e} — will try loading anyway")

        # v5.56: The tokenizer files are in a tokenizer/ subfolder, but the pipeline
        # looks for them at the root. Create symlinks from root → tokenizer/ subfolder
        # so the pipeline can find them natively (avoids the extra_special_tokens
        # compatibility issue that occurs when loading the tokenizer separately).
        print("Creating tokenizer symlinks (root → tokenizer/ subfolder)...")
        try:
            from huggingface_hub import snapshot_download as _sd
            mp = _sd(MODEL_ID, cache_dir=HF_CACHE_DIR,
                     allow_patterns=["tokenizer/*", "*.json"])
            tok_dir = os.path.join(mp, "tokenizer")
            if os.path.isdir(tok_dir):
                for f in os.listdir(tok_dir):
                    src = os.path.join(tok_dir, f)
                    dst = os.path.join(mp, f)
                    if not os.path.exists(dst) and os.path.isfile(src):
                        os.symlink(src, dst)
                        print(f"  symlinked: {f}")
        except Exception as e:
            print(f"  symlink warning: {e}")

        self.pipe = Krea2Pipeline.from_pretrained(
            MODEL_ID,
            torch_dtype=torch.bfloat16,
            cache_dir=HF_CACHE_DIR,
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
            # Krea 2 Turbo defaults per Stable Yogi's guide:
            # 8 steps, CFG 1.0, Euler, Simple scheduler, clip_skip 1.
            # (RAW would be 28 steps, CFG 4.5 — but this app is Turbo-only.)
            steps = body.get("steps", 8)
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

            # Krea 2 is a 12B DiT with Qwen3VL text encoder. It rewards
            # natural-language prompts and does NOT use negative prompts
            # effectively (the DiT architecture doesn't have a separate
            # negative-conditioning path like SDXL). Drop it silently.
            generator = torch.Generator(device="cuda").manual_seed(int(seed))
            result = self.pipe(
                prompt=prompt,
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
