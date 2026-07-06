r"""Modal FLUX LoRA training lane for NEXUS Visual Weaver.

This trains a small DreamBooth-style FLUX LoRA from a local image folder.
It is intentionally separate from the HF Space runtime: training runs on Modal,
then optionally uploads the LoRA artifacts to a Hugging Face model repo.

Minimum run:
  $env:UV_CACHE_DIR=(Resolve-Path .uv-cache).Path
  $env:UV_TOOL_DIR=(Resolve-Path .uv-tools).Path
  uvx modal run scripts/modal_flux_lora_train.py --dataset-dir C:\path\to\images --run-name raven-couture-smoke --max-steps 10

Real run:
  uvx modal run scripts/modal_flux_lora_train.py --dataset-dir C:\path\to\images --run-name raven-couture-v1 --max-steps 800 --push-repo specimba/nexus-raven-couture-lora
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import modal


APP_NAME = "nexus-flux-lora"
DEFAULT_BASE_MODEL = "black-forest-labs/FLUX.1-dev"
CACHE_DIR = "/cache"
RUNS_DIR = "/runs"

app = modal.App(APP_NAME)

image = (
    modal.Image.from_registry("nvidia/cuda:12.8.1-devel-ubuntu22.04", add_python="3.12")
    .entrypoint([])
    .apt_install("git")
    .uv_pip_install(
        "accelerate>=1.8.1",
        "bitsandbytes>=0.46.0",
        "datasets>=3.6.0",
        "huggingface-hub>=0.36.0",
        "peft>=0.15.0",
        "Pillow>=11.2.1",
        "safetensors>=0.5.3",
        "sentencepiece>=0.2.0",
        "torch==2.7.1",
        "torchvision==0.22.1",
        "transformers>=4.53.0",
        "wandb>=0.20.0",
        "git+https://github.com/huggingface/diffusers.git",
        extra_options="--index-strategy unsafe-best-match",
        extra_index_url="https://download.pytorch.org/whl/cu128",
    )
    .run_commands("git clone --depth 1 https://github.com/huggingface/diffusers.git /opt/diffusers")
    .env({"HF_XET_HIGH_PERFORMANCE": "1", "HF_HOME": CACHE_DIR, "WANDB_MODE": "disabled"})
)

cache_volume = modal.Volume.from_name("hf-hub-cache", create_if_missing=True)
runs_volume = modal.Volume.from_name("nexus-flux-lora-runs", create_if_missing=True)
volumes = {CACHE_DIR: cache_volume, RUNS_DIR: runs_volume}
secrets = [modal.Secret.from_name("huggingface-secret")]


def _safe_name(value: str) -> str:
    return "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in value).strip("-_") or "nexus-lora"


def _collect_dataset(dataset_dir: Path, default_caption: str) -> list[dict[str, Any]]:
    allowed = {".png", ".jpg", ".jpeg", ".webp"}
    records: list[dict[str, Any]] = []
    for image_path in sorted(dataset_dir.iterdir()):
        if image_path.suffix.lower() not in allowed or not image_path.is_file():
            continue
        caption_path = image_path.with_suffix(".txt")
        caption = caption_path.read_text(encoding="utf-8").strip() if caption_path.exists() else default_caption
        records.append({"name": image_path.name, "caption": caption, "bytes": image_path.read_bytes()})
    if not records:
        raise ValueError(f"No training images found in {dataset_dir}. Use png/jpg/jpeg/webp files.")
    return records


@app.function(image=image, gpu="H100", volumes=volumes, secrets=secrets, timeout=60 * 60 * 6)
def train_lora(
    dataset: list[dict[str, Any]],
    *,
    run_name: str,
    base_model: str = DEFAULT_BASE_MODEL,
    instance_prompt: str,
    resolution: int = 768,
    max_steps: int = 800,
    rank: int = 16,
    learning_rate: float = 1e-4,
    push_repo: str | None = None,
) -> dict[str, Any]:
    run_slug = _safe_name(run_name)
    timestamp = int(time.time())
    work_dir = Path("/work") / f"{run_slug}-{timestamp}"
    data_dir = work_dir / "dataset"
    output_dir = Path(RUNS_DIR) / f"{run_slug}-{timestamp}"
    data_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = []
    for idx, record in enumerate(dataset):
        suffix = Path(record["name"]).suffix.lower() or ".png"
        image_path = data_dir / f"{idx:04d}{suffix}"
        caption_path = data_dir / f"{idx:04d}.txt"
        image_path.write_bytes(record["bytes"])
        caption_path.write_text(record["caption"], encoding="utf-8")
        manifest.append({"image": image_path.name, "caption": record["caption"]})
    (output_dir / "dataset_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    script = Path("/opt/diffusers/examples/dreambooth/train_dreambooth_lora_flux.py")
    if not script.exists():
        raise FileNotFoundError(f"Diffusers FLUX LoRA script missing: {script}")

    cmd = [
        "accelerate",
        "launch",
        str(script),
        "--pretrained_model_name_or_path",
        base_model,
        "--instance_data_dir",
        str(data_dir),
        "--output_dir",
        str(output_dir),
        "--instance_prompt",
        instance_prompt,
        "--resolution",
        str(resolution),
        "--train_batch_size",
        "1",
        "--gradient_accumulation_steps",
        "1",
        "--learning_rate",
        str(learning_rate),
        "--lr_scheduler",
        "constant",
        "--lr_warmup_steps",
        "0",
        "--max_train_steps",
        str(max_steps),
        "--rank",
        str(rank),
        "--mixed_precision",
        "bf16",
        "--gradient_checkpointing",
    ]
    print("running:", " ".join(cmd))
    completed = subprocess.run(cmd, cwd="/work", text=True, capture_output=True)
    (output_dir / "train_stdout.log").write_text(completed.stdout[-20000:], encoding="utf-8")
    (output_dir / "train_stderr.log").write_text(completed.stderr[-20000:], encoding="utf-8")
    if completed.returncode != 0:
        runs_volume.commit()
        raise RuntimeError(f"LoRA training failed with exit {completed.returncode}. See {output_dir}/train_stderr.log")

    artifacts = [str(path.relative_to(Path(RUNS_DIR))) for path in output_dir.rglob("*") if path.is_file()]
    upload_status = "not_requested"
    if push_repo:
        from huggingface_hub import HfApi

        token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
        api = HfApi(token=token)
        api.create_repo(push_repo, repo_type="model", private=True, exist_ok=True)
        api.upload_folder(
            repo_id=push_repo,
            repo_type="model",
            folder_path=str(output_dir),
            commit_message=f"Add NEXUS LoRA run {run_slug}",
        )
        upload_status = f"uploaded:{push_repo}"

    runs_volume.commit()
    return {
        "status": "success",
        "run_name": run_slug,
        "base_model": base_model,
        "images": len(dataset),
        "steps": max_steps,
        "rank": rank,
        "output_volume": f"nexus-flux-lora-runs:{output_dir.relative_to(Path(RUNS_DIR))}",
        "artifacts": artifacts,
        "upload_status": upload_status,
    }


@app.local_entrypoint()
def main(
    dataset_dir: str,
    run_name: str = "raven-couture-smoke",
    default_caption: str = (
        "nexusraven couture editorial, black patent leather long coat, "
        "chantilly lace, crimson hardware, platform boots, neon rain"
    ),
    instance_prompt: str = "nexusraven couture editorial",
    base_model: str = DEFAULT_BASE_MODEL,
    resolution: int = 768,
    max_steps: int = 10,
    rank: int = 16,
    learning_rate: float = 1e-4,
    push_repo: str | None = None,
) -> None:
    records = _collect_dataset(Path(dataset_dir), default_caption)
    print(f"collected {len(records)} images from {dataset_dir}")
    result = train_lora.remote(
        records,
        run_name=run_name,
        base_model=base_model,
        instance_prompt=instance_prompt,
        resolution=resolution,
        max_steps=max_steps,
        rank=rank,
        learning_rate=learning_rate,
        push_repo=push_repo,
    )
    print(json.dumps(result, indent=2))
