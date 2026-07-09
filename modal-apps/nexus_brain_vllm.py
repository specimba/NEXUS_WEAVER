"""NEXUS Visual Weaver — ST3GG Brain (vLLM on L40S)

Deploys prithivMLmods/Qwen3.5-9B-Unredacted-MAX — a 9B parameter VLM that
handles the ST3GG safety scanning stage. This is the cheapest brain model
that still has full vision + text capabilities.

Model: prithivMLmods/Qwen3.5-9B-Unredacted-MAX
  - Base: Qwen/Qwen3.5-9B (Modal-supported)
  - Architecture: Qwen3_5ForConditionalGeneration (TRUE VLM)
  - Uncensored: 94.5% non-refusal rate (abliterated)
  - Format: Safetensors, BF16 — vLLM-deployable
  - Size: 9B params (~18GB BF16, ~9GB FP8)
  - GPU: L40S 48GB (massive headroom)
  - Cost: ~$0.50/hr (vs ~$6/hr on B200 = 92% savings)

Roles:
  1. ST3GG safety scan (text-only, ~0.5s per call)
  2. Light visual judge (if creative brain is unavailable)

Deploy:
  modal deploy modal-apps/nexus_brain_vllm.py
"""
import modal
import os
import subprocess

APP_NAME = "nexus-brain-vllm"
MODEL_ID = "prithivMLmods/Qwen3.5-9B-Unredacted-MAX"
HF_CACHE_DIR = "/root/.cache/huggingface"
MINUTES = 60

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git", "ffmpeg")
    .uv_pip_install(
        "vllm>=0.8.0",
        "transformers>=4.57.0",
        "huggingface-hub==0.36.0",
        "torch==2.7.1",
        "accelerate~=1.8.1",
        "fastapi[standard]",
        "httpx",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .env({
        "HF_XET_HIGH_PERFORMANCE": "1",
        "HF_HOME": HF_CACHE_DIR,
        "VLLM_WORKER_MULTIPROC_METHOD": "spawn",
    })
)

hf_cache_vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
volumes = {HF_CACHE_DIR: hf_cache_vol}
secrets = [modal.Secret.from_name("huggingface-secret")]


@app.function(
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
@modal.asgi_app()
def web_app():
    import time
    import subprocess
    import os
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    import httpx

    web = FastAPI()

    vllm_port = 8000
    vllm_cmd = [
        "python", "-m", "vllm.entrypoints.openai.api_server",
        "--model", MODEL_ID,
        "--served-model-name", MODEL_ID,
        "--port", str(vllm_port),
        "--host", "127.0.0.1",
        "--trust-remote-code",
        "--dtype", "auto",
        "--max-model-len", "16384",
        "--gpu-memory-utilization", "0.80",
        "--limit-mm-per-prompt", "image=2",
    ]

    print(f"Starting vLLM for {MODEL_ID}...")
    proc = subprocess.Popen(
        vllm_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={**os.environ, "VLLM_WORKER_MULTIPROC_METHOD": "spawn"},
    )

    import urllib.request
    t0 = time.time()
    ready = False
    while time.time() - t0 < 180:
        try:
            req = urllib.request.urlopen(f"http://127.0.0.1:{vllm_port}/v1/models", timeout=2)
            if req.status == 200:
                ready = True
                print(f"vLLM ready in {time.time()-t0:.1f}s")
                break
        except:
            pass
        time.sleep(2)

    @web.get("/health")
    async def health():
        if not ready:
            return JSONResponse({"status": "starting", "model": MODEL_ID, "gpu": "L40S"}, status_code=503)
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                r = await client.get(f"http://127.0.0.1:{vllm_port}/v1/models")
                return JSONResponse({
                    "status": "ok",
                    "model": MODEL_ID,
                    "gpu": "L40S",
                    "vllm": r.json(),
                })
        except Exception as e:
            return JSONResponse({"status": "error", "model": MODEL_ID, "error": str(e)}, status_code=503)

    @web.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
    async def proxy(path: str, request: Request):
        if not ready:
            return JSONResponse({"error": "vLLM server not ready"}, status_code=503)
        body = await request.body()
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.request(
                request.method,
                f"http://127.0.0.1:{vllm_port}/{path}",
                content=body,
                headers={k: v for k, v in request.headers.items() if k.lower() not in ["host", "content-length"]},
                params=request.query_params,
            )
            return JSONResponse(r.json(), status_code=r.status_code)

    return web
