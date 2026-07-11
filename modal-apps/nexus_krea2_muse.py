"""NEXUS Visual Weaver — Krea 2 Muse (Stable Yogi) Generation Engine

Uses the Muse by Stable Yogi Krea2 V1.5 Pro checkpoint — a fine-tuned Krea 2
model specialized for photoreal portraits, fashion, editorial, and lifestyle
photography. More vibrance, detail, and "magazine-cover pop" than base Krea 2.

The checkpoint is a single .safetensors file (FP8, 12.8GB) downloaded from
Stable Yogi's platform. It's loaded by replacing the transformer weights in
the base Krea2Pipeline.

Model: Muse by Stable Yogi Krea2 V1.5 Pro Fp8 C73
Settings (per Stable Yogi): 8 steps, CFG 1.0, Euler, Simple, clip_skip 1, 896×1152
"""
import time, os, json, subprocess
from typing import Any
import modal

APP_NAME = "nexus-krea2-muse"
BASE_MODEL_ID = "krea/Krea-2-Turbo"  # base model for the pipeline structure
MUSE_CHECKPOINT_URL = os.environ.get("MUSE_CHECKPOINT_URL", "")
MUSE_CHECKPOINT_FILE = "Muse-BSY-Krea2-V1.5-Pro-Fp8-C73.safetensors"
HF_CACHE_DIR = "/root/.cache/huggingface"
LORA_CACHE_DIR = "/root/.cache/loras"
MUSE_CACHE_DIR = "/root/.cache/muse"
MINUTES = 60

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git", "curl")
    .uv_pip_install(
        "Pillow~=11.2.1", "accelerate~=1.8.1",
        "git+https://github.com/huggingface/diffusers.git",
        "huggingface-hub==0.36.0", "optimum-quanto==0.2.7", "peft>=0.15.0",
        "safetensors>=0.8.0", "sentencepiece==0.2.0", "torch==2.7.1",
        "transformers>=4.57.0", "fastapi[standard]",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HOME": HF_CACHE_DIR})
)

# Volumes: hf-hub-cache (base model), lora-cache (LoRAs), muse-cache (Muse checkpoint)
hf_cache_vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
lora_cache_vol = modal.Volume.from_name("lora-cache", create_if_missing=True)
muse_cache_vol = modal.Volume.from_name("muse-cache", create_if_missing=True)
volumes = {
    HF_CACHE_DIR: hf_cache_vol,
    LORA_CACHE_DIR: lora_cache_vol,
    MUSE_CACHE_DIR: muse_cache_vol,
}
secrets = [
    modal.Secret.from_name("muse-secret"),
    modal.Secret.from_name("huggingface-secret"),
    modal.Secret.from_name("civitai-secret"),
]


@app.cls(
    image=image,
    gpu="H100",
    volumes=volumes,
    secrets=secrets,
    timeout=30 * MINUTES,  # v5.49: 30 min timeout for first cold start (12.8GB download + model load)
    scaledown_window=5 * MINUTES,
    min_containers=0,
    max_containers=1,
    cpu=8,
    memory=65536,
)
class NexusKrea2MuseGenerator:
    """Krea 2 Muse generator. Downloads Muse checkpoint on first cold start,
    then loads base Krea 2 pipeline + replaces transformer weights."""

    @modal.enter()
    def enter(self) -> None:
        import torch, json, os
        from transformers import AutoConfig
        from diffusers import Krea2Pipeline
        from safetensors.torch import load_file

        t0 = time.time()

        # 1. Download the Muse checkpoint if not cached
        # v5.49: Increased timeout to 1200s (20 min) for 12.8GB download
        muse_path = os.path.join(MUSE_CACHE_DIR, MUSE_CHECKPOINT_FILE)
        if not os.path.exists(muse_path) or os.path.getsize(muse_path) < 1_000_000_000:
            if not MUSE_CHECKPOINT_URL:
                print("[muse] WARNING: MUSE_CHECKPOINT_URL not set — falling back to base Krea 2 Turbo")
                self.use_muse = False
            else:
                print(f"[muse] Downloading Muse checkpoint ({12.8:.1f}GB) — this may take 5-10 min...")
                os.makedirs(MUSE_CACHE_DIR, exist_ok=True)
                result = subprocess.run(
                    ["curl", "-sS", "-L", "--max-time", "1200", "-o", muse_path, MUSE_CHECKPOINT_URL],
                    capture_output=True, text=True, timeout=1260
                )
                if result.returncode != 0 or not os.path.exists(muse_path) or os.path.getsize(muse_path) < 1_000_000_000:
                    print(f"[muse] Download failed (rc={result.returncode}): {result.stderr[:200]}")
                    print("[muse] Falling back to base Krea 2 Turbo")
                    self.use_muse = False
                else:
                    size_gb = os.path.getsize(muse_path) / (1024**3)
                    print(f"[muse] Downloaded {size_gb:.1f}GB — loading as transformer weights")
                    self.use_muse = True
        else:
            size_gb = os.path.getsize(muse_path) / (1024**3)
            print(f"[muse] CACHE HIT — {muse_path} ({size_gb:.1f}GB)")
            self.use_muse = True

        # 2. Load the base Krea 2 Turbo pipeline (for structure + text encoder + VAE)
        # v5.58: Patch config.json + model_index.json + tokenizer (same fix as Krea 2 Turbo)
        print(f"[muse] Loading base {BASE_MODEL_ID}...")
        try:
            import shutil
            from huggingface_hub import snapshot_download as _sd
            mp = _sd(BASE_MODEL_ID, cache_dir=HF_CACHE_DIR,
                     allow_patterns=["*.json", "tokenizer/*"])

            # 1. Patch text_encoder config.json (rope_scaling)
            te_config_path = os.path.join(mp, "text_encoder", "config.json")
            if os.path.exists(te_config_path):
                with open(te_config_path, "r") as f:
                    te_config = json.load(f)
                patched = False
                if not te_config.get("rope_scaling"):
                    te_config["rope_scaling"] = {"mrope_section": [24, 20, 20], "rope_type": "default"}
                    patched = True
                elif te_config["rope_scaling"].get("rope_type") == "mrope":
                    te_config["rope_scaling"]["rope_type"] = "default"
                    patched = True
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
                    print(f"[muse] PATCHED text_encoder config.json")

            # 2. Patch model_index.json: Qwen2Tokenizer → Qwen2TokenizerFast
            mi_path = os.path.join(mp, "model_index.json")
            with open(mi_path, "r") as f:
                mi = json.load(f)
            if mi.get("tokenizer", ["", ""])[1] == "Qwen2Tokenizer":
                mi["tokenizer"] = ["transformers", "Qwen2TokenizerFast"]
                with open(mi_path, "w") as f:
                    json.dump(mi, f, indent=2)
                print("[muse] PATCHED model_index.json: Qwen2Tokenizer → Qwen2TokenizerFast")

            # 3. Copy tokenizer files to root + patch tokenizer_config.json
            tok_dir = os.path.join(mp, "tokenizer")
            if os.path.isdir(tok_dir):
                for f in os.listdir(tok_dir):
                    src = os.path.join(tok_dir, f)
                    dst = os.path.join(mp, f)
                    if not os.path.exists(dst) and os.path.isfile(src):
                        shutil.copy2(src, dst)
                tc_path = os.path.join(mp, "tokenizer_config.json")
                if os.path.exists(tc_path):
                    with open(tc_path, "r") as f:
                        tcfg = json.load(f)
                    changed = False
                    if tcfg.get("tokenizer_class") == "Qwen2Tokenizer":
                        tcfg["tokenizer_class"] = "Qwen2TokenizerFast"
                        changed = True
                    est = tcfg.get("extra_special_tokens")
                    if isinstance(est, list):
                        tcfg["additional_special_tokens"] = est
                        del tcfg["extra_special_tokens"]
                        changed = True
                    if changed:
                        with open(tc_path, "w") as f:
                            json.dump(tcfg, f, indent=2)
                        print("[muse] PATCHED tokenizer_config.json")
        except Exception as e:
            print(f"[muse] Config patch warning: {e}")

        self.pipe = Krea2Pipeline.from_pretrained(
            BASE_MODEL_ID,
            torch_dtype=torch.bfloat16,
            cache_dir=HF_CACHE_DIR,
        )

        # 3. Replace transformer weights with Muse checkpoint (if downloaded)
        if self.use_muse:
            try:
                print("[muse] Replacing transformer weights with Muse checkpoint...")
                muse_state_dict = load_file(muse_path, device="cpu")
                # The Muse checkpoint contains the full transformer weights.
                # Load them into the pipeline's transformer model.
                self.pipe.transformer.load_state_dict(muse_state_dict, strict=False)
                del muse_state_dict
                print("[muse] Transformer weights replaced successfully!")
            except Exception as e:
                print(f"[muse] Failed to replace transformer weights: {e}")
                print("[muse] Continuing with base Krea 2 Turbo weights")
                self.use_muse = False

        self.pipe.to("cuda")
        self.load_time = time.time() - t0
        mode = "Muse (Stable Yogi)" if self.use_muse else "Base Krea 2 Turbo (fallback)"
        print(f"[muse] Loaded in {self.load_time:.1f}s — mode: {mode}")

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
                "model": "Muse by Stable Yogi Krea2 V1.5 Pro" if self.use_muse else BASE_MODEL_ID,
                "gpu": "H100",
                "mode": "muse" if self.use_muse else "base",
                "load_time_s": getattr(self, "load_time", 0),
            }

        @web.post("/generate")
        async def generate(request: Request):
            body = await request.json()
            prompt = body.get("prompt", "")
            steps = body.get("steps", 8)  # Muse: 8 steps
            cfg = body.get("cfg", 1.0)    # Muse: CFG 1.0
            seed = body.get("seed", 42)
            height = body.get("height", 1152)  # Muse recommended: 896×1152
            width = body.get("width", 896)
            loras = body.get("loras", [])

            t0 = time.time()
            lora_status = []
            active_adapters = []
            active_weights = []

            # Load user-selected LoRAs (same logic as SDXL app)
            if loras:
                for lora in loras:
                    repo = lora.get("repo", "")
                    adapter = lora.get("adapter", "")
                    weight = float(lora.get("weight", 0.5))
                    weight_name = lora.get("weight_name", "")
                    if not repo:
                        continue
                    try:
                        if weight_name == "__civitai_resolved__":
                            import hashlib
                            url_hash = hashlib.md5(repo.encode()).hexdigest()[:12]
                            cache_file = os.path.join(LORA_CACHE_DIR, f"civitai_{url_hash}.safetensors")
                            if os.path.exists(cache_file) and os.path.getsize(cache_file) > 1000:
                                print(f"[civitai] CACHE HIT — {cache_file}")
                            else:
                                os.makedirs(LORA_CACHE_DIR, exist_ok=True)
                                subprocess.run(["curl", "-sS", "-L", "--max-time", "120", "-o", cache_file, repo],
                                               capture_output=True, text=True, timeout=180)
                            load_kwargs = {"adapter_name": adapter} if adapter else {}
                            self.pipe.load_lora_weights(cache_file, **load_kwargs)
                            active_adapters.append(adapter or "civitai_lora")
                            active_weights.append(weight)
                            lora_status.append({"repo": repo[:80], "status": "loaded", "weight": weight, "source": "civitai_cdn"})
                        else:
                            load_kwargs = {}
                            if adapter: load_kwargs["adapter_name"] = adapter
                            if weight_name: load_kwargs["weight_name"] = weight_name
                            self.pipe.load_lora_weights(repo, **load_kwargs)
                            active_adapters.append(adapter or repo.split("/")[-1])
                            active_weights.append(weight)
                            lora_status.append({"repo": repo, "status": "loaded", "weight": weight, "source": "huggingface"})
                    except Exception as exc:
                        lora_status.append({"repo": repo[:80], "status": "failed", "error": str(exc)[:300]})

                if active_adapters:
                    try:
                        self.pipe.set_adapters(active_adapters, adapter_weights=active_weights)
                    except Exception as set_err:
                        print(f"set_adapters failed: {set_err}")

            # Krea 2 Muse: no negative prompt (DiT architecture)
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
                try: self.pipe.unload_lora_weights()
                except: pass

            model_name = "Muse by Stable Yogi Krea2 V1.5 Pro" if self.use_muse else BASE_MODEL_ID
            return JSONResponse({
                "image": image_b64,
                "ms": int(gen_ms),
                "size": f"{width}x{height}",
                "model": model_name,
                "mode": "muse" if self.use_muse else "base",
                "lora_status": lora_status,
                "seed": int(seed),
            })

        return web
