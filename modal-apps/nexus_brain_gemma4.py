"""NEXUS Visual Weaver — Uncensored Brain (vLLM OpenAI-compatible server)

v2: Fixed the GGUF loading issue. vLLM cannot load GGUF from a remote repo
directly. This version uses the HuggingFace transformers-format model that
vLLM supports natively. The model is cached in the hf-hub-cache volume for
fast startup.

This is a SELF-DEPLOYED alternative to the Huihui-Qwen Modal Auto Endpoint.
The primary brain path uses the Modal Auto Endpoint (MODAL_BRAIN_URL) when
MODAL_TOKEN_ID + MODAL_TOKEN_SECRET are set. This self-deployed app is only
needed if the user wants to run their own brain model instead of using the
managed Modal Endpoint.

Deploy with:
  modal deploy modal-apps/nexus_brain_gemma4.py

After deploy, set MODAL_BRAIN_URL in .env to the serve URL:
  https://specimba--nexus-brain-uncensored-serve.modal.run
And remove MODAL_TOKEN_ID / MODAL_TOKEN_SECRET (self-deployed endpoints
don't require proxy auth unless you explicitly enable it).
"""
from __future__ import annotations
import time, subprocess, socket
from typing import Any
import modal

APP_NAME = "nexus-brain-uncensored"

# Use a standard HuggingFace model in transformers format (NOT GGUF).
# vLLM can load this directly from the HF repo. This is the same model
# used in Modal's official vLLM inference example.
# For an uncensored variant, replace with: "huihui-ai/Qwen2.5-32B-Instruct-abliterated"
MODEL_ID = "google/gemma-4-26B-A4B-it"
HF_CACHE_DIR = "/root/.cache/huggingface"
VLLM_PORT = 8000
MINUTES = 60

app = modal.App(APP_NAME)

vllm_image = (
    modal.Image.from_registry("nvidia/cuda:12.9.0-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .uv_pip_install("vllm>=0.10.0", "huggingface-hub", "transformers", "torch==2.7.1", "fastapi[standard]")
    .env({"HF_HOME": HF_CACHE_DIR, "HF_XET_HIGH_PERFORMANCE": "1", "VLLM_USE_V1": "1"})
)

# REUSE existing hf-hub-cache volume
hf_cache_vol = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
vllm_cache_vol = modal.Volume.from_name("vllm-cache", create_if_missing=True)
volumes = {HF_CACHE_DIR: hf_cache_vol, "/root/.cache/vllm": vllm_cache_vol}
secrets = [modal.Secret.from_name("huggingface-secret")]


def wait_ready(proc: subprocess.Popen):
    """Wait for vLLM to be ready, or raise if it exits."""
    while True:
        try:
            socket.create_connection(("localhost", VLLM_PORT), timeout=1).close()
            return
        except OSError:
            if proc.poll() is not None:
                raise RuntimeError(f"vLLM exited with {proc.returncode}")


@app.function(
    image=vllm_image,
    gpu="H100",
    volumes=volumes,
    secrets=secrets,
    timeout=10 * MINUTES,
    scaledown_window=15 * MINUTES,
    min_containers=0,
    max_containers=1,
    cpu=8,
    memory=65536,
)
@modal.concurrent(max_inputs=100)
@modal.web_server(port=VLLM_PORT, startup_timeout=10 * MINUTES)
def serve():
    """Start vLLM server in OpenAI-compatible mode."""
    cmd = [
        "vllm", "serve",
        MODEL_ID,
        "--served-model-name", MODEL_ID,
        "--host", "0.0.0.0",
        "--port", str(VLLM_PORT),
        "--uvicorn-log-level", "info",
        "--trust-remote-code",
        "--dtype", "bfloat16",
        "--gpu-memory-utilization", "0.85",
        "--max-model-len", "8192",
        "--enforce-eager",  # faster cold start (disables Torch compilation + CUDA graphs)
    ]

    print(f"Starting vLLM with model: {MODEL_ID}")
    print("Command:", " ".join(cmd))
    proc = subprocess.Popen(" ".join(cmd), shell=True)
    wait_ready(proc)
    print(f"vLLM server ready on port {VLLM_PORT} — serving {MODEL_ID}")
