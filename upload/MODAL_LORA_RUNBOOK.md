# Modal LoRA / Refinement Runbook

This repo now has two Modal lanes:

- `scripts/modal_flux2_lora_generate.py` - practical FLUX.2-klein-9B generation with public NO8D control LoRAs.
- `scripts/modal_flux_kontext_refine.py` - image-to-image refinement with `black-forest-labs/FLUX.1-Kontext-dev`.
- `scripts/modal_flux_lora_train.py` - DreamBooth-style FLUX LoRA training using Diffusers' `train_dreambooth_lora_flux.py`.

## Current blocker

Local Modal CLI is available through `uvx`. Modal auth works when `MODAL_TOKEN_ID`
and `MODAL_TOKEN_SECRET` are present in the process environment.

The `nexus-kontext-refine` app failed because the configured Hugging Face token
does not have access to the gated `black-forest-labs/FLUX.1-Kontext-dev` repo:

```powershell
Cannot access gated repo ... black-forest-labs/FLUX.1-Kontext-dev ...
Access to model ... is restricted and you are not in the authorized list.
```

Do not retry Kontext until HF access is granted for that repo. Use the FLUX.2 +
NO8D lane below first.

Set Modal auth before running jobs:

```powershell
$env:UV_CACHE_DIR=(Resolve-Path .uv-cache).Path
$env:UV_TOOL_DIR=(Resolve-Path .uv-tools).Path
$env:MODAL_TOKEN_ID="<MODAL_TOKEN_ID>"
$env:MODAL_TOKEN_SECRET="<MODAL_TOKEN_SECRET>"
```

Modal also needs a secret named `huggingface-secret` containing `HF_TOKEN` or `HUGGING_FACE_HUB_TOKEN`.

## Practical FLUX.2 + NO8D LoRA lane

Use this first. It avoids the gated Kontext dependency and targets public NO8D
LoRAs that declare FLUX.2-klein compatibility.

```powershell
$env:UV_CACHE_DIR=(Resolve-Path .uv-cache).Path
$env:UV_TOOL_DIR=(Resolve-Path .uv-tools).Path
uvx modal run scripts/modal_flux2_lora_generate.py `
  --output-path outputs\modal\flux2-lora-smoke.png `
  --steps 8 `
  --size 1024 `
  --seed 42
```

The command prints a `lora_status` list. Do not claim adapter success unless at
least one entry has `"status": "loaded"` and an output PNG is written.

## Fast refinement lane

Use this when the Space generated a decent image and you need a better editorial finish quickly.
Requires authorized access to `black-forest-labs/FLUX.1-Kontext-dev`.

```powershell
$env:UV_CACHE_DIR=(Resolve-Path .uv-cache).Path
$env:UV_TOOL_DIR=(Resolve-Path .uv-tools).Path
uvx modal run scripts/modal_flux_kontext_refine.py `
  --input-path outputs\space-output.png `
  --output-path outputs\modal-refined.png `
  --prompt "Refine into premium gothic cyberpunk couture: sharper patent leather, cleaner silhouette, polished crimson hardware, coherent face and hands, high fashion rain lighting."
```

## LoRA smoke training

Prepare a folder with 5-20 curated PNG/JPG/WebP images. Optional sidecar captions use the same basename with `.txt`.

```powershell
$env:UV_CACHE_DIR=(Resolve-Path .uv-cache).Path
$env:UV_TOOL_DIR=(Resolve-Path .uv-tools).Path
uvx modal run scripts/modal_flux_lora_train.py `
  --dataset-dir C:\path\to\curated-raven-images `
  --run-name raven-couture-smoke `
  --max-steps 10
```

## LoRA real run

```powershell
uvx modal run scripts/modal_flux_lora_train.py `
  --dataset-dir C:\path\to\curated-raven-images `
  --run-name raven-couture-v1 `
  --max-steps 800 `
  --rank 16 `
  --push-repo specimba/nexus-raven-couture-lora
```

If `--push-repo` is omitted, artifacts stay in the Modal volume:

```text
nexus-flux-lora-runs:<run-name-timestamp>
```

## Evidence rule

Do not claim a trained LoRA until a Modal run returns `status: success` and either:

- an HF model repo contains the uploaded adapter artifacts, or
- `nexus-flux-lora-runs` contains a completed run with train logs and safetensors.
