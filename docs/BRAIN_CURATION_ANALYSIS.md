# NEXUS Weaver — Brain Model Curation Analysis (v5.32)

## Your Curation — Fully Digested

You curated 10 models across 3 strategic tiers. Here's my analysis of each,
mapped to the Modal-supported base models and our brain stage requirements.

## The Modal-Supported Base Model Constraint

| Family | Allowed Bases (Vision-capable) |
|--------|-------------------------------|
| **Qwen3.5** | 0.8B, 2B, 4B, **9B**, 27B FP8, 35B A3B FP8, 122B A10B FP8, 397B A17B FP8 |
| **Qwen3.6** | 27B, 27B FP8, 35B A3B, 35B A3B FP8 |
| **Gemma 4** | E2B IT, E4B IT, **26B A4B IT**, **31B IT** |

---

## Tier 1: Qwen3.5-9B VLMs (The Smart Choice for ST3GG + Light Judge)

### 1. prithivMLmods/Qwen3.5-9B-Unredacted-MAX
- **Base**: Qwen/Qwen3.5-9B ✅ (Modal-supported)
- **Architecture**: `qwen3_5` / `Qwen3_5ForConditionalGeneration` — TRUE VLM
- **Pipeline**: `image-text-to-text` — has vision processor
- **Format**: Safetensors, BF16 — vLLM-deployable
- **Uncensored**: 94.5% non-refusal rate (abliterated)
- **Size**: 9B params (~18GB BF16, ~9GB FP8)
- **GPU**: Fits L40S 48GB easily, even fits smaller GPUs
- **Downloads**: 29 (new but well-documented)
- **Role**: ST3GG safety scanning + light visual judge
- **VRAM**: ~9GB FP8 → L40S with massive headroom

### 2. prithivMLmods/Q3.5-9B-DS-v4-Flash-DA
- **Base**: Qwen/Qwen3.5-9B ✅ (via Unredacted-MAX)
- **Architecture**: `qwen3_5` VLM
- **Pipeline**: `image-text-to-text` — vision capable
- **Training**: DeepSeek V4 reasoning distillation + abliteration
- **Format**: Safetensors, BF16 — vLLM-deployable
- **Size**: 9B params
- **Role**: ST3GG with enhanced reasoning (DeepSeek V4 traces)
- **VRAM**: ~9GB FP8 → L40S

### 3. prithivMLmods/Q3.5-9B-GLM-5.1-DA
- **Base**: Qwen/Qwen3.5-9B ✅ (via Unredacted-MAX)
- **Architecture**: `qwen3_5` VLM
- **Pipeline**: `image-text-to-text` — vision capable
- **Training**: GLM-5.1 math reasoning distillation + abliteration
- **Format**: Safetensors, BF16 — vLLM-deployable
- **Size**: 9B params
- **Role**: ST3GG with math/structured reasoning
- **VRAM**: ~9GB FP8 → L40S

### 4. ReadyArt/Omega-Evolution-9B-v2.2
- **Base**: Qwen/Qwen3.5-9B ✅
- **Focus**: NSFW/ERP roleplay (uncensored, unaligned)
- **Note**: Gated (requires access request)
- **Role**: Not ideal for brain stages (roleplay-focused, not reasoning)

---

## Tier 2: Gemma 4 31B (The Heavy Judge)

### 5. llmfan46/gemma-4-31B-it-uncensored-heretic
- **Base**: google/gemma-4-31B-it ✅ (Modal-supported)
- **Architecture**: `gemma4` — VLM (Text + Image)
- **Pipeline**: `image-text-to-text`
- **Uncensored**: 10/100 refusals (heretic ARA method), 0.0541 KL divergence
- **Format**: Safetensors (BF16) + GGUF + **mmproj vision file**
- **Size**: 31B params (~61GB BF16, ~32GB Q8, ~18GB Q4)
- **MMLU**: 85.90% (heretic) vs 86.50% (original) — minimal quality loss
- **Vision**: Requires mmproj file (`gemma-4-31B-it-mmproj-BF16.gguf`)
- **GPU**: 
  - BF16: H100 80GB only (~61GB)
  - FP8: L40S 48GB (~32GB) ✅
  - Q4: L40S 48GB (~18GB) ✅
- **Role**: Visual Judge (high-quality vision analysis)
- **VRAM**: ~32GB FP8 → L40S with headroom for KV cache

### 6. MRockatansky/Gemma-4-31B-storymaxxed2
- **Base**: google/gemma-4-31B-it ✅ (via heretic-ara)
- **Focus**: Creative writing, narrative prose (DPO-trained)
- **Format**: GGUF + **mmproj vision file**
- **Role**: Alternative judge for aesthetic/creative quality assessment

### 7. ReadyArt/For-Her-Darkside-31B-v1.3
- **Base**: google/gemma-4-31B-it ✅
- **Focus**: NSFW/ERP roleplay
- **Note**: Gated, roleplay-focused, text layers only trained
- **Role**: Not ideal for brain stages

---

## Tier 3: Gemma 4 26B A4B (The Efficient MoE)

### 8. Vortex5/Pantheon-Reasoning-26B-A4B-1.1-heretic
- **Base**: google/gemma-4-26B-A4B-it ✅ (via Gryphe/Pantheon)
- **Architecture**: `gemma4` MoE (3.8B active params)
- **Focus**: Reasoning + creative writing
- **Uncensored**: 13/100 refusals (heretic ARA), 0.0455 KL divergence
- **Format**: Safetensors
- **Size**: 26B total, 3.8B active → fast inference
- **GPU**: L40S 48GB (~26GB BF16, ~13GB FP8)
- **Role**: ST3GG with reasoning (MoE = fast + cheap)
- **VRAM**: ~13GB FP8 → L40S with massive headroom

---

## Tier 4: Speed Optimization (Not Brain Models)

### 9. z-lab/gemma-4-31B-it-DFlash
- **Base**: google/gemma-4-31B-it ✅
- **Purpose**: Speculative decoding DRAFTER (not a standalone brain)
- **Speedup**: 5.8x faster inference when paired with gemma-4-31B-it
- **How**: Drafts 15 tokens in parallel, main model verifies
- **Size**: 2B params (tiny drafter model)
- **Role**: Speed booster for ANY gemma-4-31B-it deployment
- **Use case**: Pair with llmfan46 heretic for 5.8x faster judging

### 10. Hikari07jp/DSpark-Gemma-4-31B-draft
- **Base**: z-lab/gemma-4-31B-it-DFlash ✅
- **Purpose**: Alternative DFlash drafter (retrained backbone)
- **Role**: Same as z-lab DFlash — speed optimization

---

## Strategic Recommendation

### Phase 1 (Immediate): Qwen3.5-9B for ST3GG
**Model**: `prithivMLmods/Qwen3.5-9B-Unredacted-MAX`
- Cheapest option (9B, ~9GB FP8)
- True VLM (can do both text + image)
- 94.5% non-refusal rate
- vLLM-deployable on L40S
- Fits alongside FLUX.2 on the same GPU type

### Phase 2 (Quality): Gemma 4 31B Heretic for Visual Judge
**Model**: `llmfan46/gemma-4-31B-it-uncensored-heretic`
- Highest vision quality (MMMU Pro 76.9%)
- 10/100 refusals (well-uncensored)
- 0.0541 KL divergence (minimal quality loss)
- Has mmproj vision file
- Needs FP8 quantization for L40S (~32GB)

### Phase 3 (Speed): DFlash for 5.8x Inference
**Model**: `z-lab/gemma-4-31B-it-DFlash` paired with gemma-4-31B-it
- 5.8x speedup on the Visual Judge
- Reduces judge latency from ~6s to ~1s
- Same GPU, just faster

### Optional: MoE for Cost-Sensitive Operations
**Model**: `Vortex5/Pantheon-Reasoning-26B-A4B-1.1-heretic`
- MoE with 3.8B active params
- Fast inference (like a 4B model)
- Good for high-QPS ST3GG scanning
- 13/100 refusals (slightly more than llmfan46)

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  NEXUS Weaver Brain Stack (L40S GPU pool)                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ST3GG Container (L40S)                             │   │
│  │  Model: prithivMLmods/Qwen3.5-9B-Unredacted-MAX     │   │
│  │  VRAM: ~9GB FP8                                     │   │
│  │  Role: Text safety scanning                         │   │
│  │  Latency: ~0.5-1s per call                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Visual Judge Container (L40S)                      │   │
│  │  Model: llmfan46/gemma-4-31B-it-uncensored-heretic  │   │
│  │  VRAM: ~32GB FP8                                    │   │
│  │  Role: Image quality scoring                        │   │
│  │  Latency: ~2-3s per call (warm)                     │   │
│  │  + DFlash: ~0.5s per call (5.8x speedup)            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Shared: hf-hub-cache volume (fast cold starts)             │
└─────────────────────────────────────────────────────────────┘
```

## Cost Comparison (vs old AEON on B200)

| Stage | Old (B200) | New (L40S) | Savings |
|-------|-----------|-----------|---------|
| ST3GG | ~$6/hr (AEON 27B) | ~$0.50/hr (Qwen 9B FP8) | 92% |
| Judge | ~$6/hr (AEON 27B) | ~$1.50/hr (Gemma 31B FP8) | 75% |
| Total/hr | ~$12 | ~$2 | 83% |
| Total/day (8h active) | ~$96 | ~$16 | 83% |

## Key Insights from Your Curation

1. **Qwen3.5-9B is the sweet spot for ST3GG** — small, cheap, VLM, uncensored, vLLM-ready
2. **Gemma 4 31B heretic is the best judge** — 10/100 refusals, 0.0541 KL div, has mmproj vision
3. **DFlash is a speed multiplier, not a brain** — pair it with the judge for 5.8x speedup
4. **MoE (26B A4B) is the middle ground** — 3.8B active = fast, 26B total = smart
5. **All models have Safetensors format** — vLLM-deployable, no llama.cpp needed

## Next Steps (Awaiting Your Confirmation)

1. **Deploy Qwen3.5-9B-Unredacted-MAX** as the ST3GG brain (cheapest, fastest)
2. **Deploy llmfan46/gemma-4-31B-it-uncensored-heretic** as the Visual Judge
3. **Optional: Add DFlash** to the Judge for 5.8x speedup
4. **Update secrets.ts** with the new endpoint URLs
5. **Update brain-client.ts** to route ST3GG → Qwen 9B, Judge → Gemma 31B
