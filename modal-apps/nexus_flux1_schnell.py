"""NEXUS Visual Weaver — FLUX.1-schnell Generation
Uses @modal.web_server pattern (like the official Modal vLLM example).
This QUEUES requests during cold start — no 404.
"""
from __future__ import annotations
import base64, io, time, subprocess, socket
from typing import Any
import modal

APP_NAME = "nexus-visual"
MODEL_ID = "black-forest-labs/FLUX.1-schnell"
HF_CACHE_DIR = "/root/.cache/huggingface"
PORT = 8000

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git")
    .uv_pip_install(
        "Pillow", "accelerate",
        "git+https://github.com/huggingface/diffusers.git",
        "huggingface-hub", "peft",
        "safetensors", "sentencepiece", "torch==2.7.1",
        "transformers", "fastapi[standard]", "uvicorn",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HOME": HF_CACHE_DIR})
)

hf_cache_vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
volumes = {HF_CACHE_DIR: hf_cache_vol}
secrets = [modal.Secret.from_name("huggingface-secret")]

def wait_ready(proc):
    while True:
        try:
            socket.create_connection(("localhost", PORT), timeout=1).close()
            return
        except OSError:
            if proc.poll() is not None:
                raise RuntimeError(f"Server exited with {proc.returncode}")

@app.function(
    image=image, gpu="H100", volumes=volumes, secrets=secrets,
    timeout=600, scaledown_window=300, min_containers=0, max_containers=1,
)
@modal.concurrent(max_inputs=10)
@modal.web_server(port=PORT, startup_timeout=600)
def serve():
    """Start a uvicorn server running FastAPI with FLUX.1-schnell."""
    code = '''
import base64, io, time, torch
from diffusers import FluxPipeline
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

MODEL_ID = "black-forest-labs/FLUX.1-schnell"
CACHE_DIR = "/root/.cache/huggingface"

app = FastAPI(title="NEXUS FLUX.1-schnell")
pipe = None

@app.on_event("startup")
async def startup():
    global pipe
    print(f"Loading {MODEL_ID}...")
    t0 = time.time()
    pipe = FluxPipeline.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16, cache_dir=CACHE_DIR).to("cuda")
    print(f"{MODEL_ID} loaded in {time.time()-t0:.1f}s")

@app.get("/health")
async def health():
    return {"status": "ok" if pipe else "loading", "model": MODEL_ID, "gpu": "H100"}

@app.post("/generate")
async def generate(req: Request):
    body = await req.json()
    prompt = body["prompt"]
    steps = body.get("steps", 4)
    cfg = body.get("cfg", 3.5)
    seed = body.get("seed", 42)
    h = body.get("h", body.get("height", 1024))
    w = body.get("w", body.get("width", 1024))
    loras = body.get("loras")
    
    t0 = time.time()
    lora_status = []
    active_adapters = []
    active_weights = []
    
    if loras:
        for lora in loras:
            repo = lora.get("repo", "")
            adapter = lora.get("adapter", "")
            weight = float(lora.get("weight", 0.7))
            if not repo: continue
            try:
                if adapter: pipe.load_lora_weights(repo, adapter_name=adapter)
                else: pipe.load_lora_weights(repo)
                active_adapters.append(adapter or repo.split("/")[-1])
                active_weights.append(weight)
                lora_status.append({"repo": repo, "status": "loaded", "weight": weight})
            except Exception as exc:
                lora_status.append({"repo": repo, "status": "failed", "error": str(exc)[:300]})
        if active_adapters:
            pipe.set_adapters(active_adapters, adapter_weights=active_weights)
    
    generator = torch.Generator(device="cuda").manual_seed(seed)
    result = pipe(prompt=prompt, num_inference_steps=steps, guidance_scale=cfg, height=h, width=w, generator=generator, output_type="pil").images[0]
    gen_ms = (time.time() - t0) * 1000
    
    buf = io.BytesIO()
    result.save(buf, format="PNG")
    image_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    
    if active_adapters:
        pipe.unload_lora_weights()
    
    return {"image": image_b64, "ms": int(gen_ms), "size": f"{w}x{h}", "model": MODEL_ID, "lora_status": lora_status}
'''
    # Write the server code to a file and run it with uvicorn
    with open("/tmp/server.py", "w") as f:
        f.write(code)
    
    proc = subprocess.Popen(
        ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", str(PORT)],
        cwd="/tmp",
    )
    wait_ready(proc)
    print(f"FLUX.1 server ready on port {PORT}")
