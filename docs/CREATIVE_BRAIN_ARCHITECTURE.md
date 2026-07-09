# NEXUS Weaver — Creative Brain + MeGA LoRA Architecture (v5.32)

## Vision

The brain evolves from a passive judge into an **active creative collaborator** that:
1. **Enhances prompts** pre-generation with lore-aware enrichment
2. **Judges** post-generation with vision-based quality scoring
3. **Learns** from every generation via the taste profile
4. **Distills** approved experiences into a custom LoRA (MeGA pack)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NEXUS Creative Brain System                       │
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │  ST3GG Brain  │    │ Creative     │    │ Visual Judge │          │
│  │  (Qwen 9B)   │    │ Enhancer     │    │ (Gemma 31B   │          │
│  │              │    │ (Gemma 31B   │    │  + DFlash)   │          │
│  │  Safety scan │    │  heretic)    │    │              │          │
│  │  Text-only   │    │ Lore-aware   │    │ Image score  │          │
│  │  ~0.5s/call  │    │ prompt enrich│    │ ~1s w/DFlash │          │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘          │
│         │                   │                   │                   │
│         ▼                   ▼                   ▼                   │
│  ┌──────────────────────────────────────────────────────┐          │
│  │              Experience Logger                        │          │
│  │  Logs every generation (prompt, LoRAs, score, image)  │          │
│  └──────────────────────┬───────────────────────────────┘          │
│                         │                                           │
│                         ▼                                           │
│  ┌──────────────────────────────────────────────────────┐          │
│  │              Taste Profile                            │          │
│  │  Evolving preference weights:                         │          │
│  │  - Style preferences (cinematic, goth, etc.)          │          │
│  │  - Color palette preferences                          │          │
│  │  - LoRA combo success rates                           │          │
│  │  - Lore entry approval counts                         │          │
│  │  - High/low score keywords                            │          │
│  └──────────────────────┬───────────────────────────────┘          │
│                         │                                           │
│                         ▼ (batch, future)                           │
│  ┌──────────────────────────────────────────────────────┐          │
│  │              MeGA LoRA Distillation                   │          │
│  │  Collects approved (prompt, image) pairs              │          │
│  │  Trains custom LoRA on user's aesthetic               │          │
│  │  Deploys as "NEXUS-MeGA-v1" LoRA                      │          │
│  └──────────────────────────────────────────────────────┘          │
│                                                                     │
│  ┌──────────────────────────────────────────────────────┐          │
│  │              Lore Database                            │          │
│  │  Structured knowledge: garments, footwear, legwear,   │          │
│  │  accessories, hairstyles, colors, materials, story,   │          │
│  │  human details, composition                           │          │
│  │  30+ curated entries with pairing logic               │          │
│  └──────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Lore Database (`src/lib/lore/lore-database.ts`)

Structured knowledge base with 30+ curated entries across 10 categories:

| Category | Entries | Example |
|----------|---------|---------|
| Garments | 6 | Floor-length cape coat, Chantilly lace corset, Cyberpunk trench |
| Footwear | 4 | Goth platform boots, Combat boots, Strappy stilettos, Loafers |
| Legwear | 3 | Sheer stockings, Opaque tights, Slouchy wool socks |
| Accessories | 4 | Silver buckles, Chrome jewelry, Pearl choker, Gold chain |
| Hairstyles | 6 | Ginger windblown, Jet black wet, Neon streaks, Soft waves |
| Colors | 4 | Warm golden, Dark contrast, Neon drenched, Soft pastel |
| Materials | 3 | Patent leather, Chantilly lace, Silk charmeuse |
| Story | 4 | Editorial fashion, Cyberpunk noir, Gothic cathedral, Golden hour |
| Human | 3 | Pale skin with pores, Grey-blue eyes, Dark-red lipstick |
| Composition | 4 | Hasselblad 80mm, Studio lighting, Full-body wide, Macro detail |

Each entry has:
- `description` — natural language for prompt injection
- `tags` — for matching against user prompt
- `themes` — style themes (editorial, goth, cyberpunk, etc.)
- `pairsWith` — other entries that complement it
- `approvalCount` / `avgScore` — updated by taste profile feedback

### 2. Taste Profile (`src/lib/taste-profile.ts`)

Evolving preference vector stored in Prisma:

```typescript
interface TasteVector {
  styles: Record<string, number>;           // "cinematic" → 5.5
  colors: Record<string, number>;           // "dark-palette" → 3.2
  compositions: Record<string, number>;
  preferredLore: Record<string, number>;    // "garment-cape-coat" → 8
  preferredLoraCombos: Record<string, number>;
  highScoreKeywords: Record<string, number>; // "leather" → 12
  lowScoreKeywords: Record<string, number>;
  aspectRatioScores: Record<string, number>;
  totalAnalyzed: number;
}
```

Every approved/rejected generation updates the profile. The prompt enhancer
reads the profile to bias lore selection toward entries that historically
produce high scores.

### 3. Experience Logger (`src/lib/experience-logger.ts`)

Every generation becomes a structured experience record in Prisma:

```typescript
interface ExperienceRecord {
  generationId: string;
  prompt: string;              // user's raw prompt
  enrichedPrompt: string;      // prompt after lore enrichment
  loraIds: string[];
  loraWeights: Record<string, number>;
  seed: number;
  loreEntriesUsed: string[];
  overallScore: number;
  approved: boolean;
  imagePath: string;
  // ... (all judge scores)
}
```

Approved experiences (score ≥ 85) become training data for the MeGA LoRA.

### 4. Prompt Enhancer API (`/api/prompt/enhance-lore`)

Pre-generation stage that:
1. Analyzes the user's prompt for themes/tags
2. Matches against the lore database
3. Loads the taste profile to boost preferred entries
4. Gets paired lore (entries that complement the matched ones)
5. Builds a natural-language enrichment string
6. Returns the enhanced prompt + matched lore metadata

### 5. Creative Brain Modal App (`modal-apps/nexus_creative_brain.py`)

Deploys gemma-4-31B-it with DFlash speculative decoding:

- **Main model**: google/gemma-4-31B-it (base for DFlash verification)
- **Drafter**: z-lab/gemma-4-31B-it-DFlash (2B params, 5.8x speedup)
- **vLLM**: installed from PR #41703 branch (not yet merged to mainline)
- **Fallback**: if DFlash fails, restarts with standard vLLM (no speedup)
- **GPU**: L40S 48GB (~32GB for model + drafter)
- **Cost**: ~$1.50/hr (vs ~$6/hr on B200 = 75% savings)

### 6. DFlash Integration

z-lab/gemma-4-31B-it-DFlash is a **speculative decoding drafter** — not a
standalone brain model. It works by:
1. The drafter (2B params) generates 15 candidate tokens in parallel
2. The main model (31B) verifies them in a single forward pass
3. Accepted tokens are kept; rejected tokens trigger re-generation

**Speedup**: 5.8x at concurrency 1 (turns 6s judge calls into ~1s)

**Compatibility risk**: DFlash requires vLLM PR #41703 (not merged).
The Modal app installs from the PR branch with automatic fallback to
standard vLLM if the PR branch fails.

## Pipeline Integration

The creative brain adds a new pre-generation stage:

```
User Prompt
    │
    ▼
┌─────────────────┐
│  ST3GG Safety   │  ← Qwen3.5-9B-Unredacted-MAX (text-only, ~0.5s)
│  Scan prompt    │
└────────┬────────┘
         │ (if approved)
         ▼
┌─────────────────┐
│  Lore Enhancer  │  ← Lore database + taste profile (instant, no GPU)
│  Enrich prompt  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  FLUX.2 / Z-Img │  ← Image generation (4 steps, ~2s warm)
│  Generate image │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Visual Judge   │  ← Gemma 31B heretic + DFlash (~1s with DFlash)
│  Score image    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Experience     │  ← Log to DB + update taste profile
│  Logger         │
└─────────────────┘
```

## MeGA LoRA Distillation (Future Phase)

The MeGA LoRA is the culmination of the creative brain system — a custom
LoRA trained on the user's approved aesthetic preferences.

### Training Data Collection
- Approved generations (score ≥ 85) are logged with full metadata
- Each record has: prompt, enriched prompt, LoRA stack, seed, image
- After 100+ approved generations, enough data exists for training

### Training Pipeline (future)
1. Export approved (prompt, image) pairs from ExperienceLog
2. Use a LoRA training script (modal_flux_lora_train.py exists)
3. Train on the user's aesthetic: prompt → image pairs
4. The resulting LoRA encodes the user's "taste" as model weights
5. Deploy as "NEXUS-MeGA-v1" — a personalized LoRA that can be stacked
   with other LoRAs to bias generations toward the user's preferences

### Usage
```typescript
// In the LoRA library:
{
  id: "nexus-mega-v1",
  name: "MeGA NEXUS Edition v1",
  category: "style",
  engineFamilies: ["FLUX.2"],
  purpose: "Personalized aesthetic LoRA distilled from approved generations",
  recommendedWeight: 0.4,
  tags: ["personal", "mega", "nexus", "custom"],
}
```

## Cost Projection

| Component | Old (B200) | New (L40S) | Savings |
|-----------|-----------|-----------|---------|
| ST3GG | ~$6/hr (AEON 27B) | ~$0.50/hr (Qwen 9B) | 92% |
| Judge (no DFlash) | ~$6/hr | ~$1.50/hr (Gemma 31B) | 75% |
| Judge (with DFlash) | ~$6/hr | ~$1.50/hr (same GPU, 5.8x faster) | 75% + 5.8x throughput |
| Lore Enhancer | N/A | $0 (no GPU, instant) | 100% |
| **Total/day (8h)** | ~$96 | ~$16 | **83%** |

## Files Created

| File | Purpose |
|------|---------|
| `src/lib/lore/lore-database.ts` | 30+ curated lore entries + matching engine |
| `src/lib/taste-profile.ts` | Evolving preference vector |
| `src/lib/experience-logger.ts` | Generation experience logging + MeGA training data |
| `src/app/api/prompt/enhance-lore/route.ts` | Lore-aware prompt enhancer API |
| `modal-apps/nexus_creative_brain.py` | Gemma 31B + DFlash deployment |
| `prisma/schema.prisma` | TasteProfile + ExperienceLog models |
| `docs/CREATIVE_BRAIN_ARCHITECTURE.md` | This document |
