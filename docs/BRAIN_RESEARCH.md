# NEXUS Weaver — Brain Model Research (v5.31)

## Executive Summary

Deep research into Modal-compatible, uncensored, vision-capable fine-tuned models
for the ST3GG (safety) + Visual Judge (quality) brain stages.

## The Problem

The AEON-7/Qwen3.6-27B-AEON-Ultimate-Uncensored-BF16 model was deployed as a
Modal Auto Endpoint on B200 GPU (EU West). This caused:
1. **Cost burning**: B200 is ~$4-8/hr (most expensive GPU)
2. **Cold-start issues**: 60-120s cold start, 503 errors
3. **No direct integration**: Custom HF fine-tune, not a Modal "supported base model"
4. **Auth complexity**: Required proxy tokens (wk-/ws-) instead of API tokens

## The Solution

**kasimat/Qwen3.6-27B-AEON-Ultimate-Uncensored-FP8-MTP** — the SAME AEON
uncensored model, but in FP8 format deployable via vLLM on L40S.

## Why This Model

| Criterion | Old (AEON BF16 on B200) | New (AEON FP8 on L40S) |
|-----------|------------------------|------------------------|
| Model | AEON-7/Qwen3.6-27B-AEON-Ultimate-Uncensored-BF16 | kasimat/Qwen3.6-27B-AEON-Ultimate-Uncensored-FP8-MTP |
| GPU | B200 (EU West) | L40S (same as FLUX.2) |
| Cost/hr | ~$4-8 | ~$0.50-1.50 |
| VRAM | ~54GB (BF16) | ~27GB (FP8) |
| Cold start | 60-120s | ~20s (shares volume with FLUX.2) |
| Vision | Yes (Qwen3VLProcessor) | Yes (Qwen3VLProcessor) |
| Uncensored | Yes (AEON abliteration) | Yes (same AEON abliteration) |
| vLLM | No (Auto Endpoint) | Yes (standard deployment) |
| Auth | Proxy tokens (wk-/ws-) | API tokens (ak-/as-) or none |
| Downloads | 19K | 63K |

## Model Architecture (verified from config.json)

```
model_type: qwen3_5
architectures: ['Qwen3_5ForConditionalGeneration']
vision_config: present
processor_class: Qwen3VLProcessor
image_processor_type: Qwen2VLImageProcessorFast
video_processor_type: Qwen3VLVideoProcessor
```

This is a full VLM (Vision-Language Model) that can:
- Analyze images (Visual Judge stage)
- Process text (ST3GG safety stage)
- Handle video (future video judging)

## Top Candidates Evaluated

### For Visual Judge (vision required)

| Model | Format | Vision | VRAM | GPU | Downloads | Verdict |
|-------|--------|--------|------|-----|-----------|---------|
| **kasimat/Qwen3.6-27B-AEON-Ultimate-Uncensored-FP8-MTP** | FP8 safetensors | Yes | ~27GB | L40S | 63K | **SELECTED** |
| HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive | GGUF only | Yes (mmproj) | ~22GB | L40S | 2.8M | GGUF = llama.cpp only |
| HauhauCS/Qwen3.6-27B-Uncensored-HauhauCS-Aggressive | GGUF only | Yes (mmproj) | ~27GB | L40S | 455K | GGUF = llama.cpp only |
| AEON-7/Gemma-4-26B-A4B-it-Uncensored-NVFP4 | NVFP4 | Yes | ~16GB | L40S | 74K | Needs transformers v5+ |
| HauhauCS/Gemma4-26B-A4B-Uncensored-HauhauCS-Balanced | GGUF only | Yes (mmproj) | ~14GB | L40S | 167K | GGUF = llama.cpp only |

### For ST3GG (text-only, safety reasoning)

Same model serves both roles — no need for a separate text-only model.
The AEON FP8 handles both vision + text in one deployment.

## Community Feedback (from web research)

### HauhauCS (GGUF, not selected)
- "Best lossless uncensored models out there" (author's claim, community-validated)
- 0/465 refusals benchmark; preserves 100% of base capabilities
- BUT: GGUF format only → requires llama.cpp, not vLLM
- Would need a llama.cpp Modal app (different deployment pattern)

### AEON (FP8, SELECTED)
- "Capability-enhanced" abliteration (72 hrs of research, hundreds of parallel AI runs)
- Native MTP (multi-token prediction) preserved = faster decoding
- FP8 native = fits L40S 48GB with room for KV cache
- vLLM compatible = standard OpenAI-compatible API
- "Fine-tune changes behavior — not a 'pure' Qwen 3.6 anymore" — acceptable for
  our use case (we WANT the enhanced reasoning for safety + aesthetic analysis)

### Gemma 4 (not selected for now)
- Higher MMMU-Pro score (76.9% vs Qwen3.6's lower score)
- Better for "subjective/creative aesthetic judgment"
- BUT: NVFP4 format needs transformers v5+ (compatibility risk)
- Heretic fine-tunes have residual refusals (15/100 for 31B)
- Future consideration if Qwen3.6 underperforms

## Deployment Plan

1. **Deploy**: `modal deploy modal-apps/nexus_brain_vllm.py`
2. **Update secrets.ts**: Point MODAL_BRAIN_URL to the new vLLM endpoint
3. **Update brain-client.ts**: Remove proxy auth (vLLM on L40S doesn't need it)
4. **Test**: Verify ST3GG + Judge stages use the new endpoint
5. **Monitor**: Check cost/quality vs the old B200 endpoint

## Cost Projection

| Metric | Old (B200) | New (L40S) | Savings |
|--------|-----------|-----------|---------|
| Cost per hour (active) | ~$6 | ~$1 | 83% |
| Cold start time | 60-120s | ~20s | 75% |
| Idle cost (scaled down) | $0 | $0 | same |
| Daily cost (moderate use) | ~$15-25 | ~$3-5 | 80% |

The brain endpoint shares the L40S GPU pool with FLUX.2 — when both are active,
they run on separate L40S instances but share the same hf-hub-cache volume,
making cold starts for both much faster after the first load.
