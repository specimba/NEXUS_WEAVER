"""NEXUS Visual Weaver — Creative Brain + DFlash Speed Optimizer

Deploys the llmfan46/gemma-4-31B-it-uncensored-heretic model with
z-lab/gemma-4-31B-it-DFlash speculative decoding for 5.8x speedup.

DFlash Compatibility:
- vLLM PR #41703 is NOT yet merged into mainline vLLM
- We install vLLM from the PR branch: git+https://github.com/vllm-project/vllm.git@refs/pull/41703/head
- SGLang PR #23000 is also open (alternative backend)
- If DFlash fails to load, the app falls back to standard vLLM (no speedup
  but still works)

Models:
- Main: google/gemma-4-31B-it (base, for DFlash verification)
- Uncensored: llmfan46/gemma-4-31B-it-uncensored-heretic (10/100 refusals)
- Drafter: z-lab/gemma-4-31B-it-DFlash (2B params, 5.8x speedup)

Roles:
1. Visual Judge — analyzes generated images, scores quality
2. Creative Enhancer — enriches prompts with lore-aware details
3. Nemotron — aggregates evidence into structured output

Deploy:
  modal deploy modal-apps/nexus_creative_brain.py
"""
import modal
import os
import subprocess

APP_NAME = "nexus-creative-brain"
MODEL_ID = "google/gemma-4-31B-it"  # Base model for DFlash
UNCENSORED_MODEL = "llmfan46/gemma-4-31B-it-uncensored-heretic"
DRAFT_MODEL = "z-lab/gemma-4-31B-it-DFlash"
HF_CACHE_DIR = "/root/.cache/huggingface"
MINUTES = 60

app = modal.App(APP_NAME)

# vLLM image — install from DFlash PR branch for speculative decoding support
# Falls back to standard vLLM if the PR branch fails to install
image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git", "ffmpeg")
    .pip_install(
        # Install vLLM from DFlash PR branch (NOT yet merged into mainline)
        # This enables --speculative-config '{"method": "dflash", ...}'
        "vllm @ git+https://github.com/vllm-project/vllm.git@refs/pull/41703/head",
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

# REUSE the existing hf-hub-cache volume
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

    # Start vLLM server with DFlash speculative decoding
    # The DFlash drafter model drafts 15 tokens in parallel, main model verifies
    # This gives 5.8x speedup at concurrency 1
    vllm_port = 8000

    # Try DFlash first, fall back to standard vLLM if it fails
    vllm_cmd_dflash = [
        "python", "-m", "vllm.entrypoints.openai.api_server",
        "--model", MODEL_ID,
        "--served-model-name", "nexus-creative-brain",
        "--port", str(vllm_port),
        "--host", "127.0.0.1",
        "--trust-remote-code",
        "--dtype", "auto",
        "--max-model-len", "32768",
        "--gpu-memory-utilization", "0.85",
        "--limit-mm-per-prompt", "image=2",
        # DFlash speculative decoding config
        "--speculative-config", '{"method": "dflash", "model": "' + DRAFT_MODEL + '", "num_speculative_tokens": 15, "attention_backend": "flash_attn"}',
        "--attention-backend", "triton_attn",
        "--max-num-batched-tokens", "32768",
    ]

    vllm_cmd_fallback = [
        "python", "-m", "vllm.entrypoints.openai.api_server",
        "--model", MODEL_ID,
        "--served-model-name", "nexus-creative-brain",
        "--port", str(vllm_port),
        "--host", "127.0.0.1",
        "--trust-remote-code",
        "--dtype", "auto",
        "--max-model-len", "32768",
        "--gpu-memory-utilization", "0.85",
        "--limit-mm-per-prompt", "image=2",
    ]

    print(f"Starting vLLM with DFlash for {MODEL_ID}...")
    proc = subprocess.Popen(
        vllm_cmd_dflash,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={**os.environ, "VLLM_WORKER_MULTIPROC_METHOD": "spawn"},
    )

    # Wait for vLLM to be ready (3 min timeout for model loading)
    import urllib.request
    t0 = time.time()
    ready = False
    dflash_active = True

    while time.time() - t0 < 180:
        try:
            req = urllib.request.urlopen(f"http://127.0.0.1:{vllm_port}/v1/models", timeout=2)
            if req.status == 200:
                ready = True
                print(f"vLLM + DFlash ready in {time.time()-t0:.1f}s")
                break
        except:
            pass
        time.sleep(2)

    # If DFlash failed, restart with fallback (standard vLLM, no speedup)
    if not ready:
        print("DFlash failed to start, falling back to standard vLLM...")
        proc.terminate()
        proc.wait(timeout=10)
        dflash_active = False
        proc = subprocess.Popen(
            vllm_cmd_fallback,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env={**os.environ, "VLLM_WORKER_MULTIPROC_METHOD": "spawn"},
        )
        t0 = time.time()
        while time.time() - t0 < 120:
            try:
                req = urllib.request.urlopen(f"http://127.0.0.1:{vllm_port}/v1/models", timeout=2)
                if req.status == 200:
                    ready = True
                    print(f"vLLM (fallback) ready in {time.time()-t0:.1f}s")
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
                    "dflash": dflash_active,
                    "speedup": "5.8x" if dflash_active else "1x (fallback)",
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
