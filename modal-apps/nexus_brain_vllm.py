"""NEXUS Visual Weaver — Brain Endpoint v2 (vLLM on L40S)

Replaces the old AEON B200 Auto Endpoint with a vLLM-served deployment of
the same AEON uncensored model, but in FP8 format on L40S (same GPU as
FLUX.2, 3-4x cheaper than H100/B200).

Model: kasimat/Qwen3.6-27B-AEON-Ultimate-Uncensored-FP8-MTP
  - Same AEON-7 uncensored fine-tune the user was already using
  - FP8 quantized → ~27GB VRAM (fits L40S 48GB with room for KV cache)
  - Full VLM: Qwen3_5ForConditionalGeneration + Qwen3VLProcessor
  - Can analyze images (visual judge) + text (ST3GG safety)
  - MTP (multi-token prediction) for faster inference
  - 63K HF downloads, vLLM-tagged

Deploy:
  modal deploy modal-apps/nexus_brain_vllm.py

Cost comparison:
  OLD: AEON on B200 (EU West Auto Endpoint) — ~$4-8/hr, cold-start 60-120s
  NEW: vLLM on L40S (same GPU as FLUX.2) — ~$0.50-1.50/hr, cold-start ~20s
  SAVINGS: ~85% per hour + shares volume cache with FLUX.2
"""
import modal
import os

APP_NAME = "nexus-brain-vllm"
MODEL_ID = "kasimat/Qwen3.6-27B-AEON-Ultimate-Uncensored-FP8-MTP"
HF_CACHE_DIR = "/root/.cache/huggingface"
MINUTES = 60

app = modal.App(APP_NAME)

# vLLM image — includes the latest vLLM with VLM support
image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git", "ffmpeg")
    .pip_install(
        "vllm>=0.8.0",  # VLM support (Qwen3-VL)
        "transformers>=4.57.0",  # Qwen3_5ForConditionalGeneration
        "huggingface-hub==0.36.0",
        "torch==2.7.1",
        "accelerate~=1.8.1",
        "fastapi[standard]",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HOME": HF_CACHE_DIR, "VLLM_WORKER_MULTIPROC_METHOD": "spawn"})
)

# REUSE the existing hf-hub-cache volume — brain weights cache alongside FLUX.2
hf_cache_vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
volumes = {HF_CACHE_DIR: hf_cache_vol}
secrets = [modal.Secret.from_name("huggingface-secret")]


@app.function(
    image=image,
    gpu="L40S",
    volumes=volumes,
    secrets=secrets,
    timeout=20 * MINUTES,
    scaledown_window=5 * MINUTES,  # Cost: scale down fast after idle
    min_containers=0,
    max_containers=1,
    cpu=8,
    memory=65536,
)
@modal.asgi_app()
def web_app():
    import subprocess
    import os
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse

    web = FastAPI()

    # Start vLLM server as a subprocess (non-blocking)
    # vLLM provides an OpenAI-compatible API at /v1/chat/completions
    # This is what the brain client already expects.
    vllm_port = 8000
    vllm_cmd = [
        "python", "-m", "vllm.entrypoints.openai.api_server",
        "--model", MODEL_ID,
        "--served-model-name", MODEL_ID,
        "--port", str(vllm_port),
        "--host", "127.0.0.1",
        "--trust-remote-code",  # Required for Qwen3_5ForConditionalGeneration
        "--dtype", "auto",  # FP8 model — vLLM auto-detects
        "--max-model-len", "32768",  # 32K context (enough for image+prompt)
        "--gpu-memory-utilization", "0.85",  # Leave room for vision encoder
        "--limit-mm-per-prompt", "image=2",  # Allow up to 2 images per request
    ]

    print(f"Starting vLLM server for {MODEL_ID}...")
    proc = subprocess.Popen(
        vllm_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={**os.environ, "VLLM_WORKER_MULTIPROC_METHOD": "spawn"},
    )

    # Wait for vLLM to be ready (poll the /v1/models endpoint)
    import time
    import urllib.request
    t0 = time.time()
    ready = False
    while time.time() - t0 < 180:  # 3 min timeout for model loading
        try:
            req = urllib.request.urlopen(f"http://127.0.0.1:{vllm_port}/v1/models", timeout=2)
            if req.status == 200:
                ready = True
                print(f"vLLM ready in {time.time()-t0:.1f}s")
                break
        except:
            pass
        time.sleep(2)

    if not ready:
        print("vLLM failed to start within 180s")
        # Print last few lines of vLLM output for debugging
        proc.terminate()
        output = proc.stdout.read().decode() if proc.stdout else ""
        print(output[-2000:])

    # Proxy requests to the vLLM server
    import httpx

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
        except:
            return JSONResponse({"status": "error", "model": MODEL_ID}, status_code=503)

    @web.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
    async def proxy(path: str, request: Request):
        if not ready:
            return JSONResponse({"error": "vLLM server not ready"}, status_code=503)
        # Forward to vLLM
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
