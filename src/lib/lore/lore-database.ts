/**
 * NEXUS Weaver — Lore System
 *
 * A structured knowledge base of aesthetic elements that the creative brain
 * uses to enrich prompts pre-generation. Each category contains curated
 * entries with metadata (materials, styles, colors, pairings) that the
 * prompt enhancer draws from based on detected themes.
 *
 * Over time, the taste profile system tags which lore entries produce
 * high-scoring generations, creating a feedback loop that refines the
 * lore's effectiveness.
 *
 * Categories:
 * 1. Garments (tops, bottoms, dresses, outerwear)
 * 2. Footwear (boots, heels, sneakers, sandals)
 * 3. Legwear (stockings, tights, socks)
 * 4. Accessories (jewelry, bags, belts, headwear)
 * 5. Hairstyles (cuts, colors, textures, styling)
 * 6. Colors (palettes, combinations, mood mappings)
 * 7. Materials (fabrics, leather, metal, textures)
 * 8. Story/Lore (thematic templates, mood, setting)
 * 9. Human Details (skin, eyes, body type, expression)
 * 10. Composition (camera, lighting, framing, angle)
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface LoreEntry {
  id: string;
  name: string;
  category: LoreCategory;
  /** Natural-language description that gets injected into prompts */
  description: string;
  /** Tags for matching against user prompt themes */
  tags: string[];
  /** Other entry IDs that pair well with this one */
  pairsWith?: string[];
  /** Style themes this entry fits */
  themes: string[];
  /** Maturity level: safe | suggestive | mature */
  maturity: "safe" | "suggestive" | "mature";
  /** How many times this entry has been used in approved generations */
  approvalCount?: number;
  /** Average judge score when this entry was used */
  avgScore?: number;
}

export type LoreCategory =
  | "garment"
  | "footwear"
  | "legwear"
  | "accessory"
  | "hairstyle"
  | "color"
  | "material"
  | "story"
  | "human"
  | "composition";

// ── Garments ─────────────────────────────────────────────────────────────────

const GARMENTS: LoreEntry[] = [
  {
    id: "garment-cape-coat",
    name: "Floor-length Cape Coat",
    category: "garment",
    description: "floor-length cape-coat in high-gloss black patent leather, open, voluminous faux fur trim at oversized collar and hem, revealing satin lining",
    tags: ["coat", "cape", "leather", "patent", "fur", "outerwear", "dramatic"],
    pairsWith: ["legwear-sheer-stockings", "footwear-goth-boots", "accessory-silver-buckles"],
    themes: ["editorial", "goth", "luxury", "winter", "dramatic"],
    maturity: "safe",
  },
  {
    id: "garment-corset-lace",
    name: "Chantilly Lace Corset",
    category: "garment",
    description: "delicate black Chantilly lace corset top with shiny leather straps and lustrous metal buckles, structured bodice with boning",
    tags: ["corset", "lace", "chantilly", "leather", "straps", "buckles", "lingerie"],
    pairsWith: ["legwear-sheer-stockings", "garment-cape-coat", "accessory-metal-buckles"],
    themes: ["editorial", "goth", "luxury", "sensual"],
    maturity: "suggestive",
  },
  {
    id: "garment-trench-cyberpunk",
    name: "Cyberpunk Trench",
    category: "garment",
    description: "asymmetric tech-wear trench coat with holographic paneling, integrated LED strips, matte black waterproof fabric with reflective accents",
    tags: ["trench", "techwear", "cyberpunk", "holographic", "LED", "asymmetric"],
    pairsWith: ["footwear-combat-boots", "accessory-chrome-jewelry", "hairstyle-neon-streaks"],
    themes: ["cyberpunk", "futuristic", "streetwear", "neon"],
    maturity: "safe",
  },
  {
    id: "garment-silk-slip-dress",
    name: "Silk Slip Dress",
    category: "garment",
    description: "bias-cut champagne silk slip dress with delicate lace trim, cowl neckline, fluid drape catching light",
    tags: ["slip", "silk", "dress", "lace", "bias-cut", "champagne", "elegant"],
    pairsWith: ["footwear-strap-heels", "accessory-pearl-choker", "hairstyle-soft-waves"],
    themes: ["editorial", "luxury", "minimalist", "summer", "elegant"],
    maturity: "suggestive",
  },
  {
    id: "garment-oversized-blazer",
    name: "Oversized Structured Blazer",
    category: "garment",
    description: "oversized double-breasted blazer with sharp shoulder pads, nipped waist, premium wool blend in charcoal pinstripe",
    tags: ["blazer", "oversized", "structured", "pinstripe", "wool", "tailored"],
    pairsWith: ["footwear-loafers", "accessory-gold-chain", "hairstyle-sleek-bob"],
    themes: ["editorial", "business", "minimalist", "androgynous"],
    maturity: "safe",
  },
  {
    id: "garment-aviator-jacket",
    name: "Vintage Aviator Jacket",
    category: "garment",
    description: "distressed brown shearling aviator jacket with worn leather collar, brass zipper, cropped fit",
    tags: ["aviator", "jacket", "shearling", "leather", "vintage", "brown", "cropped"],
    pairsWith: ["footwear-combat-boots", "legwear-wool-socks", "hairstyle-messy-bun"],
    themes: ["casual", "vintage", "autumn", "rugged"],
    maturity: "safe",
  },
];

// ── Footwear ─────────────────────────────────────────────────────────────────

const FOOTWEAR: LoreEntry[] = [
  {
    id: "footwear-goth-boots",
    name: "Goth Platform Boots",
    category: "footwear",
    description: "high-heeled goth boots with intricate silver buckles, platform sole, black leather with matte finish",
    tags: ["boots", "goth", "heels", "buckles", "platform", "silver", "leather"],
    pairsWith: ["garment-cape-coat", "legwear-sheer-stockings"],
    themes: ["goth", "editorial", "dramatic", "winter"],
    maturity: "safe",
  },
  {
    id: "footwear-combat-boots",
    name: "Heavy Combat Boots",
    category: "footwear",
    description: "worn black leather combat boots with scuffed toe caps, heavy laces, metal eyelets, chunky rubber sole",
    tags: ["boots", "combat", "military", "worn", "laces", "chunky"],
    pairsWith: ["garment-aviator-jacket", "garment-trench-cyberpunk"],
    themes: ["cyberpunk", "streetwear", "rugged", "autumn"],
    maturity: "safe",
  },
  {
    id: "footwear-strap-heels",
    name: "Strappy Stiletto Heels",
    category: "footwear",
    description: "strappy stiletto heels with thin ankle straps, pointed toe, patent leather in deep burgundy",
    tags: ["heels", "stiletto", "strappy", "patent", "burgundy", "elegant"],
    pairsWith: ["garment-silk-slip-dress", "accessory-pearl-choker"],
    themes: ["editorial", "luxury", "elegant", "evening"],
    maturity: "safe",
  },
  {
    id: "footwear-loafers",
    name: "Leather Loafers",
    category: "footwear",
    description: "polished black leather loafers with silver horsebit detail, chunky lug sole, refined silhouette",
    tags: ["loafers", "leather", "horsebit", "chunky", "polished", "black"],
    pairsWith: ["garment-oversized-blazer", "accessory-gold-chain"],
    themes: ["business", "editorial", "minimalist", "androgynous"],
    maturity: "safe",
  },
];

// ── Legwear ──────────────────────────────────────────────────────────────────

const LEGWEAR: LoreEntry[] = [
  {
    id: "legwear-sheer-stockings",
    name: "Sheer Black Stockings",
    category: "legwear",
    description: "sheer black stockings with intricate lace patterns at the thigh, silicon grip top, semi-transparent denier",
    tags: ["stockings", "sheer", "black", "lace", "thigh-high", "hosiery"],
    pairsWith: ["garment-cape-coat", "garment-corset-lace", "footwear-goth-boots"],
    themes: ["editorial", "goth", "sensual", "luxury"],
    maturity: "suggestive",
  },
  {
    id: "legwear-opaque-tights",
    name: "Opaque Wool Tights",
    category: "legwear",
    description: "thick opaque wool-blend tights in charcoal grey, ribbed texture, full coverage",
    tags: ["tights", "opaque", "wool", "charcoal", "ribbed", "thick"],
    pairsWith: ["garment-oversized-blazer", "footwear-loafers"],
    themes: ["autumn", "winter", "casual", "cozy"],
    maturity: "safe",
  },
  {
    id: "legwear-wool-socks",
    name: "Slouchy Wool Socks",
    category: "legwear",
    description: "slouchy cream wool socks scrunched at the ankle, visible above boot shaft",
    tags: ["socks", "wool", "cream", "slouchy", "cozy"],
    pairsWith: ["footwear-combat-boots", "garment-aviator-jacket"],
    themes: ["casual", "autumn", "vintage", "cozy"],
    maturity: "safe",
  },
];

// ── Accessories ──────────────────────────────────────────────────────────────

const ACCESSORIES: LoreEntry[] = [
  {
    id: "accessory-silver-buckles",
    name: "Intricate Silver Buckles",
    category: "accessory",
    description: "intricate silver buckles with engraved filigree detail, brushed metal finish, decorative and functional",
    tags: ["buckles", "silver", "filigree", "engraved", "metal"],
    pairsWith: ["footwear-goth-boots", "garment-cape-coat"],
    themes: ["goth", "editorial", "luxury"],
    maturity: "safe",
  },
  {
    id: "accessory-chrome-jewelry",
    name: "Chrome Statement Jewelry",
    category: "accessory",
    description: "floating chrome accessories, polished geometric pendants, reflective metal cuffs, holographic surface",
    tags: ["chrome", "jewelry", "geometric", "polished", "holographic", "pendant"],
    pairsWith: ["garment-trench-cyberpunk"],
    themes: ["cyberpunk", "futuristic", "neon"],
    maturity: "safe",
  },
  {
    id: "accessory-pearl-choker",
    name: "Pearl Choker",
    category: "accessory",
    description: "single-strand pearl choker with delicate silk knot, lustrous Akoya pearls, sits at the base of the neck",
    tags: ["pearl", "choker", "silk", "akoya", "elegant", "necklace"],
    pairsWith: ["garment-silk-slip-dress", "footwear-strap-heels"],
    themes: ["editorial", "luxury", "elegant", "minimalist"],
    maturity: "safe",
  },
  {
    id: "accessory-gold-chain",
    name: "Layered Gold Chain",
    category: "accessory",
    description: "layered gold chain necklace with mixed link sizes, warm 18k tone, medium weight drape",
    tags: ["gold", "chain", "layered", "necklace", "18k"],
    pairsWith: ["garment-oversized-blazer", "footwear-loafers"],
    themes: ["business", "editorial", "luxury"],
    maturity: "safe",
  },
];

// ── Hairstyles ───────────────────────────────────────────────────────────────

const HAIRSTYLES: LoreEntry[] = [
  {
    id: "hairstyle-ginger-windblown",
    name: "Fiery Ginger Windblown",
    category: "hairstyle",
    description: "fiery red ginger hair windblown dramatically, loose waves catching golden light, vibrant copper tones",
    tags: ["ginger", "red", "windblown", "waves", "copper", "dramatic"],
    pairsWith: ["garment-cape-coat", "color-warm-palette"],
    themes: ["editorial", "dramatic", "autumn", "luxury"],
    maturity: "safe",
  },
  {
    id: "hairstyle-jet-black-wet",
    name: "Jet Black Wet Waves",
    category: "hairstyle",
    description: "jet-black wet wavy hair, slicked back with glossy finish, water droplets catching light, sharp contrast",
    tags: ["black", "wet", "wavy", "slicked", "glossy"],
    pairsWith: ["garment-corset-lace", "color-dark-palette"],
    themes: ["editorial", "goth", "sensual", "dramatic"],
    maturity: "safe",
  },
  {
    id: "hairstyle-neon-streaks",
    name: "Neon Streaked Undercut",
    category: "hairstyle",
    description: "asymmetric undercut with neon magenta and cyan streaks, shaved sides, textured top, holographic hair gel",
    tags: ["neon", "undercut", "magenta", "cyan", "asymmetric", "cyberpunk"],
    pairsWith: ["garment-trench-cyberpunk", "accessory-chrome-jewelry"],
    themes: ["cyberpunk", "futuristic", "neon", "edgy"],
    maturity: "safe",
  },
  {
    id: "hairstyle-soft-waves",
    name: "Soft Beach Waves",
    category: "hairstyle",
    description: "soft beach waves in honey-blonde, tousled texture, natural parting, sun-kissed highlights",
    tags: ["blonde", "honey", "waves", "beach", "tousled", "natural"],
    pairsWith: ["garment-silk-slip-dress", "color-warm-palette"],
    themes: ["summer", "editorial", "natural", "elegant"],
    maturity: "safe",
  },
  {
    id: "hairstyle-sleek-bob",
    name: "Sleek Chin-Length Bob",
    category: "hairstyle",
    description: "sleek chin-length bob with blunt cut, glossy finish, center part, jet black with sharp edges",
    tags: ["bob", "sleek", "blunt", "glossy", "black", "short"],
    pairsWith: ["garment-oversized-blazer", "footwear-loafers"],
    themes: ["business", "editorial", "minimalist", "androgynous"],
    maturity: "safe",
  },
  {
    id: "hairstyle-messy-bun",
    name: "Textured Messy Bun",
    category: "hairstyle",
    description: "textured messy bun with loose face-framing strands, casual updo, slight frizz, warm brown tones",
    tags: ["bun", "messy", "textured", "casual", "brown", "updo"],
    pairsWith: ["garment-aviator-jacket", "footwear-combat-boots"],
    themes: ["casual", "autumn", "vintage", "natural"],
    maturity: "safe",
  },
];

// ── Colors ───────────────────────────────────────────────────────────────────

const COLORS: LoreEntry[] = [
  {
    id: "color-warm-palette",
    name: "Warm Golden Palette",
    category: "color",
    description: "rich warm color palette: golden amber, burnt sienna, deep burgundy, warm cream, copper accents",
    tags: ["warm", "golden", "amber", "burgundy", "copper", "autumn"],
    pairsWith: ["hairstyle-ginger-windblown", "hairstyle-soft-waves"],
    themes: ["autumn", "editorial", "luxury", "warm"],
    maturity: "safe",
  },
  {
    id: "color-dark-palette",
    name: "Dark Contrast Palette",
    category: "color",
    description: "rich high-contrast palette: black as night, high-shine patent, deep crimson, silver accents, stark whites",
    tags: ["dark", "contrast", "black", "crimson", "silver", "patent"],
    pairsWith: ["hairstyle-jet-black-wet", "garment-cape-coat"],
    themes: ["goth", "editorial", "dramatic", "luxury"],
    maturity: "safe",
  },
  {
    id: "color-neon-palette",
    name: "Neon Drenched Palette",
    category: "color",
    description: "vibrant neon palette: electric cyan, hot magenta, acid yellow, deep void black, holographic shifts",
    tags: ["neon", "cyan", "magenta", "electric", "holographic", "cyberpunk"],
    pairsWith: ["hairstyle-neon-streaks", "garment-trench-cyberpunk"],
    themes: ["cyberpunk", "futuristic", "neon", "edgy"],
    maturity: "safe",
  },
  {
    id: "color-pastel-palette",
    name: "Soft Pastel Palette",
    category: "color",
    description: "soft pastel palette: blush pink, lavender, mint green, cream, dusty rose, gentle gradients",
    tags: ["pastel", "pink", "lavender", "mint", "cream", "soft"],
    pairsWith: ["garment-silk-slip-dress", "hairstyle-soft-waves"],
    themes: ["spring", "romantic", "soft", "dreamy"],
    maturity: "safe",
  },
];

// ── Materials ────────────────────────────────────────────────────────────────

const MATERIALS: LoreEntry[] = [
  {
    id: "material-patent-leather",
    name: "High-Gloss Patent Leather",
    category: "material",
    description: "high-gloss black patent leather with mirror-like sheen, structured drape, reflective surface catching light",
    tags: ["patent", "leather", "gloss", "black", "sheen", "reflective"],
    pairsWith: ["garment-cape-coat", "color-dark-palette"],
    themes: ["editorial", "goth", "luxury", "dramatic"],
    maturity: "safe",
  },
  {
    id: "material-chantilly-lace",
    name: "Chantilly Lace",
    category: "material",
    description: "delicate black Chantilly lace with floral pattern, scalloped edges, semi-transparent, fine threadwork",
    tags: ["lace", "chantilly", "floral", "black", "delicate", "transparent"],
    pairsWith: ["garment-corset-lace", "legwear-sheer-stockings"],
    themes: ["editorial", "luxury", "sensual", "goth"],
    maturity: "suggestive",
  },
  {
    id: "material-silk-charmeuse",
    name: "Silk Charmeuse",
    category: "material",
    description: "liquid silk charmeuse with lustrous front and matte back, fluid drape, catching light in pools",
    tags: ["silk", "charmeuse", "lustrous", "fluid", "liquid"],
    pairsWith: ["garment-silk-slip-dress", "color-warm-palette"],
    themes: ["editorial", "luxury", "elegant", "sensual"],
    maturity: "suggestive",
  },
];

// ── Story/Lore ───────────────────────────────────────────────────────────────

const STORIES: LoreEntry[] = [
  {
    id: "story-editorial-fashion",
    name: "High-Fashion Editorial",
    category: "story",
    description: "high-fashion editorial photography with cinematic provocative aesthetic, professional studio composition, magazine cover quality",
    tags: ["editorial", "fashion", "magazine", "studio", "professional", "cinematic"],
    pairsWith: ["color-dark-palette", "composition-studio-lighting"],
    themes: ["editorial", "luxury", "fashion"],
    maturity: "safe",
  },
  {
    id: "story-cyberpunk-noir",
    name: "Cyberpunk Noir",
    category: "story",
    description: "dark cyberpunk aesthetic with neon-drenched drama, decaying urban architecture, holographic displays, ethereal mist",
    tags: ["cyberpunk", "neon", "noir", "urban", "dystopian", "holographic"],
    pairsWith: ["color-neon-palette", "garment-trench-cyberpunk"],
    themes: ["cyberpunk", "futuristic", "neon", "dramatic"],
    maturity: "safe",
  },
  {
    id: "story-gothic-cathedral",
    name: "Gothic Cathedral",
    category: "story",
    description: "gothic cathedral interior with stained glass windows, powerful beams of colored daylight, heavy dust motes, stone arches",
    tags: ["gothic", "cathedral", "stained-glass", "stone", "dust", "religious"],
    pairsWith: ["color-dark-palette", "garment-cape-coat"],
    themes: ["goth", "dramatic", "editorial", "religious"],
    maturity: "safe",
  },
  {
    id: "story-golden-hour",
    name: "Golden Hour Editorial",
    category: "story",
    description: "golden hour lighting with warm sun flares, lens flare, soft bokeh background, natural skin glow",
    tags: ["golden-hour", "warm", "sun", "flare", "bokeh", "natural"],
    pairsWith: ["color-warm-palette", "hairstyle-ginger-windblown"],
    themes: ["editorial", "summer", "natural", "warm"],
    maturity: "safe",
  },
];

// ── Human Details ────────────────────────────────────────────────────────────

const HUMANS: LoreEntry[] = [
  {
    id: "human-pale-pores",
    name: "Pale Skin with Visible Pores",
    category: "human",
    description: "pale flawless skin with visible pores, ultra-fine micro-details, warm undertones, natural texture",
    tags: ["pale", "skin", "pores", "flawless", "micro-details", "texture"],
    pairsWith: ["story-editorial-fashion", "composition-macro-detail"],
    themes: ["editorial", "luxury", "photorealistic"],
    maturity: "safe",
  },
  {
    id: "human-grey-blue-eyes",
    name: "Piercing Grey-Blue Eyes",
    category: "human",
    description: "piercing grey-blue eyes with sharp high cheekbones, intense gaze, visible iris detail",
    tags: ["eyes", "grey", "blue", "piercing", "cheekbones", "gaze"],
    pairsWith: ["human-pale-pores", "hairstyle-jet-black-wet"],
    themes: ["editorial", "dramatic", "goth"],
    maturity: "safe",
  },
  {
    id: "human-dark-red-lipstick",
    name: "Bold Dark-Red Matte Lipstick",
    category: "human",
    description: "bold dark-red matte lipstick, precisely applied, rich pigment, slightly glossy in highlights",
    tags: ["lipstick", "dark-red", "matte", "bold", "lip"],
    pairsWith: ["human-pale-pores", "color-dark-palette"],
    themes: ["editorial", "goth", "dramatic", "luxury"],
    maturity: "safe",
  },
];

// ── Composition ──────────────────────────────────────────────────────────────

const COMPOSITION: LoreEntry[] = [
  {
    id: "composition-hasselblad-80mm",
    name: "Hasselblad 80mm f/1.8",
    category: "composition",
    description: "shot with an 80mm lens at f/1.8 on a Hasselblad H6D-100c, shallow depth of field, medium format quality",
    tags: ["hasselblad", "80mm", "f/1.8", "medium-format", "shallow-dof", "professional"],
    pairsWith: ["story-editorial-fashion", "composition-studio-lighting"],
    themes: ["editorial", "luxury", "photorealistic"],
    maturity: "safe",
  },
  {
    id: "composition-studio-lighting",
    name: "Dramatic Studio Lighting",
    category: "composition",
    description: "powerful erect beams of vivid linear daylight, creating warm rim lighting, high dynamic range, professional composition",
    tags: ["lighting", "studio", "beams", "daylight", "rim-light", "hdr"],
    pairsWith: ["composition-hasselblad-80mm", "story-editorial-fashion"],
    themes: ["editorial", "luxury", "dramatic"],
    maturity: "safe",
  },
  {
    id: "composition-full-body-wide",
    name: "Full-Body Wide Angle",
    category: "composition",
    description: "long-distance full-body shot with wide-angle composition, razor-sharp focus on subject, layered background",
    tags: ["full-body", "wide-angle", "long-distance", "sharp", "layered"],
    pairsWith: ["composition-hasselblad-80mm"],
    themes: ["editorial", "fashion", "cyberpunk"],
    maturity: "safe",
  },
  {
    id: "composition-macro-detail",
    name: "Macro Detail Close-Up",
    category: "composition",
    description: "extreme close-up macro shot, razor-sharp detail on skin texture and fabric weave, shallow depth of field",
    tags: ["macro", "close-up", "detail", "skin", "fabric", "texture"],
    pairsWith: ["human-pale-pores", "material-chantilly-lace"],
    themes: ["editorial", "photorealistic", "luxury"],
    maturity: "safe",
  },
];

// ── Master Database ──────────────────────────────────────────────────────────

export const LORE_DATABASE: LoreEntry[] = [
  ...GARMENTS,
  ...FOOTWEAR,
  ...LEGWEAR,
  ...ACCESSORIES,
  ...HAIRSTYLES,
  ...COLORS,
  ...MATERIALS,
  ...STORIES,
  ...HUMANS,
  ...COMPOSITION,
];

// ── Lore Matching Engine ─────────────────────────────────────────────────────

/**
 * Find lore entries that match the themes/tags in a user's prompt.
 * Returns entries sorted by relevance (tag match count).
 */
export function findRelevantLore(
  prompt: string,
  maxResults: number = 5
): LoreEntry[] {
  const promptLower = prompt.toLowerCase();
  const scored = LORE_DATABASE.map((entry) => {
    let score = 0;
    // Check tag matches
    for (const tag of entry.tags) {
      if (promptLower.includes(tag.toLowerCase())) score += 2;
    }
    // Check theme matches
    for (const theme of entry.themes) {
      if (promptLower.includes(theme.toLowerCase())) score += 1;
    }
    // Check name match
    if (promptLower.includes(entry.name.toLowerCase())) score += 3;
    // Boost entries with high approval rates (taste profile feedback)
    if (entry.approvalCount && entry.approvalCount > 0) {
      score += Math.min(entry.approvalCount * 0.5, 3);
    }
    // Boost entries with high avg scores
    if (entry.avgScore && entry.avgScore > 90) {
      score += 1;
    }
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.entry);
}

/**
 * Get paired lore entries (entries that commonly pair with the given IDs).
 */
export function getPairedLore(entryIds: string[]): LoreEntry[] {
  const paired: LoreEntry[] = [];
  const seen = new Set(entryIds);
  for (const id of entryIds) {
    const entry = LORE_DATABASE.find((e) => e.id === id);
    if (entry?.pairsWith) {
      for (const pairId of entry.pairsWith) {
        if (!seen.has(pairId)) {
          const pair = LORE_DATABASE.find((e) => e.id === pairId);
          if (pair) {
            paired.push(pair);
            seen.add(pairId);
          }
        }
      }
    }
  }
  return paired;
}

/**
 * Build a lore enrichment string from matched entries.
 * This gets appended to the user's prompt before generation.
 */
export function buildLoreEnrichment(
  matchedEntries: LoreEntry[],
  maxChars: number = 400
): string {
  const descriptions = matchedEntries.map((e) => e.description);
  let enrichment = descriptions.join(". ");
  if (enrichment.length > maxChars) {
    enrichment = enrichment.slice(0, maxChars) + "...";
  }
  return enrichment;
}

/**
 * Update lore entry stats based on generation feedback.
 * Called when a generation is approved or rejected.
 */
export function updateLoreStats(
  entryIds: string[],
  approved: boolean,
  score: number
): void {
  for (const id of entryIds) {
    const entry = LORE_DATABASE.find((e) => e.id === id);
    if (entry) {
      if (!entry.approvalCount) entry.approvalCount = 0;
      if (!entry.avgScore) entry.avgScore = 0;
      if (approved) entry.approvalCount++;
      // Running average of scores
      const totalCount = entry.approvalCount || 1;
      entry.avgScore = (entry.avgScore * (totalCount - 1) + score) / totalCount;
    }
  }
}

/**
 * Get all lore entries for a specific category.
 */
export function getLoreByCategory(category: LoreCategory): LoreEntry[] {
  return LORE_DATABASE.filter((e) => e.category === category);
}

/**
 * Search lore by keyword.
 */
export function searchLore(query: string): LoreEntry[] {
  const q = query.toLowerCase();
  return LORE_DATABASE.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)) ||
      e.themes.some((t) => t.toLowerCase().includes(q))
  );
}
