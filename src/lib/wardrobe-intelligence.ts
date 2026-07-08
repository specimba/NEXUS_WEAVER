/**
 * Wardrobe Intelligence Parser — extracts structured garment data from prompts.
 *
 * Based on the user's architecture spec: treat wardrobe as a first-class
 * structured object with garments, materials, colors, silhouette, and mood.
 *
 * This parser uses keyword matching + pattern extraction (no LLM needed —
 * fast, deterministic, runs client-side). AEON can later enhance the result
 * with deeper analysis.
 */

export interface WardrobeGarment {
  type: string;         // "coat", "corset", "stockings", "boots", etc.
  material?: string;    // "leather", "lace", "fur", "satin", etc.
  color?: string;       // "black", "red", "crimson", etc.
  detail?: string;      // "high-gloss", "sheer", "polished", etc.
  raw: string;          // the original text snippet that matched
}

export interface WardrobeSpec {
  garments: WardrobeGarment[];
  materials: string[];    // unique materials found
  colors: string[];       // unique colors found
  silhouette?: string;    // "floor-length", "form-fitting", "oversized", etc.
  mood?: string;          // "dramatic", "provocative", "elegant", etc.
  accessories: string[];  // "buckles", "straps", "chains", etc.
  footwear?: string;      // "high heel boots", "platform boots", etc.
}

// ── Pattern databases ────────────────────────────────────────────────────────

const GARMENT_TYPES: Record<string, string[]> = {
  "coat": ["coat", "cape", "cape-coat", "jacket", "blazer", "trench", "parka", "overcoat"],
  "corset": ["corset", "bodice", "bustier"],
  "dress": ["dress", "gown", "robe", "frock"],
  "skirt": ["skirt", "kilt"],
  "top": ["top", "blouse", "shirt", "bra", "bustier top"],
  "stockings": ["stockings", "thigh-highs", "pantyhose", "tights", "hose"],
  "boots": ["boots", "heels", "stilettos", "pumps", "sandals"],
  "gloves": ["gloves", "gauntlets"],
  "hat": ["hat", "crown", "tiara", "headpiece"],
  "lingerie": ["lingerie", "bra", "panties", "thong", "garter", "g-string"],
  "pants": ["pants", "trousers", "leggings", "jeans"],
  "swimwear": ["bikini", "swimsuit", "one-piece"],
  "uniform": ["uniform", "costume", "armor"],
};

const MATERIALS: Record<string, string[]> = {
  "leather": ["leather", "patent leather", "faux leather", "pleather"],
  "lace": ["lace", "chantilly lace", "chantilly"],
  "fur": ["fur", "faux fur", "fox fur", "mink"],
  "satin": ["satin", "silk", "velvet"],
  "metal": ["metal", "chrome", "steel", "iron", "gold", "silver"],
  "cotton": ["cotton", "linen", "denim"],
  "rubber": ["rubber", "latex", "pvc", "vinyl"],
  "mesh": ["mesh", "sheer", "transparent", "see-through"],
  "wool": ["wool", "knit", "cashmere", "tweed"],
};

const COLORS: string[] = [
  "black", "white", "red", "crimson", "scarlet", "blue", "navy", "cyan",
  "green", "emerald", "yellow", "gold", "golden", "orange", "amber",
  "purple", "violet", "magenta", "pink", "rose", "grey", "gray", "silver",
  "brown", "tan", "beige", "cream", "ivory", "burgundy", "maroon",
  "teal", "turquoise", "indigo", "charcoal",
];

const SILHOUETTES: string[] = [
  "floor-length", "floor length", "knee-length", "mid-thigh", "oversized",
  "form-fitting", "form fitting", "fitted", "loose", "flowing", "voluminous",
  "high-slit", "open", "cropped", "mini", "maxi",
];

const MOODS: string[] = [
  "dramatic", "provocative", "seductive", "elegant", "sensual", "erotic",
  "mysterious", "confident", "alluring", "powerful", "dark", "ethereal",
  "gothic", "cinematic", "luxurious", "opulent",
];

const ACCESSORIES: string[] = [
  "buckles", "straps", "chains", "studs", "rings", "earrings", "necklace",
  "choker", "headpiece", "crown", "tiara", "clasp", "zipper", "buttons",
  "spikes", "hardware", "accents", "trim", "collar",
];

/**
 * Parse a text prompt and extract structured wardrobe data.
 * Fast, deterministic, no LLM needed.
 */
export function parseWardrobe(prompt: string): WardrobeSpec {
  const lower = prompt.toLowerCase();
  const garments: WardrobeGarment[] = [];
  const materialsFound: Set<string> = new Set();
  const colorsFound: Set<string> = new Set();
  const accessoriesFound: string[] = [];
  let silhouette: string | undefined;
  let mood: string | undefined;
  let footwear: string | undefined;

  // Extract garments with their surrounding context (material + color)
  for (const [type, keywords] of Object.entries(GARMENT_TYPES)) {
    for (const kw of keywords) {
      // Find all occurrences of this garment keyword
      const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, "gi");
      let match;
      while ((match = regex.exec(lower)) !== null) {
        const idx = match.index;
        // Get surrounding context (40 chars before, 20 after)
        const start = Math.max(0, idx - 40);
        const end = Math.min(lower.length, idx + kw.length + 20);
        const context = lower.slice(start, end);

        // Extract material from context
        let material: string | undefined;
        for (const [mat, matKeywords] of Object.entries(MATERIALS)) {
          if (matKeywords.some((mk) => context.includes(mk))) {
            material = mat;
            materialsFound.add(mat);
            break;
          }
        }

        // Extract color from context
        let color: string | undefined;
        for (const c of COLORS) {
          if (context.includes(c)) {
            color = c;
            colorsFound.add(c);
            break;
          }
        }

        // Extract detail (high-gloss, sheer, polished, etc.)
        let detail: string | undefined;
        const detailMatch = context.match(/(high-gloss|high gloss|glossy|sheer|polished|shiny|matte|textured|intricate|ornate|elaborate|layered)/);
        if (detailMatch) {
          detail = detailMatch[1];
        }

        garments.push({
          type,
          material,
          color,
          detail,
          raw: prompt.slice(start, end).trim(),
        });
      }
    }
  }

  // Extract silhouette
  for (const s of SILHOUETTES) {
    if (lower.includes(s)) {
      silhouette = s;
      break;
    }
  }

  // Extract mood
  for (const m of MOODS) {
    if (lower.includes(m)) {
      mood = m;
      break;
    }
  }

  // Extract accessories
  for (const a of ACCESSORIES) {
    if (lower.includes(a) && !accessoriesFound.includes(a)) {
      accessoriesFound.push(a);
    }
  }

  // Extract footwear
  const footwearMatch = lower.match(/(?:tall|high|platform|combat|stiletto|pointed)\s+(?:black\s+|red\s+|white\s+)?(?:boots|heels|pumps|stilettos)/);
  if (footwearMatch) {
    footwear = footwearMatch[0];
  } else {
    for (const kw of GARMENT_TYPES["boots"] || []) {
      if (lower.includes(kw)) {
        footwear = kw;
        break;
      }
    }
  }

  return {
    garments: deduplicateGarments(garments),
    materials: [...materialsFound],
    colors: [...colorsFound],
    silhouette,
    mood,
    accessories: accessoriesFound,
    footwear,
  };
}

/**
 * Check if a generated image matches the wardrobe spec.
 * Returns a match score (0-100) + list of mismatches.
 */
export function checkWardrobeAdherence(
  spec: WardrobeSpec,
  judgeObservations: string[]
): { score: number; mismatches: string[]; matches: string[] } {
  const mismatches: string[] = [];
  const matches: string[] = [];
  let score = 100;

  // Check each garment against judge observations
  const obsText = judgeObservations.join(" ").toLowerCase();

  for (const g of spec.garments) {
    const garmentDesc = [g.color, g.material, g.type].filter(Boolean).join(" ").toLowerCase();
    if (obsText.includes(g.type.toLowerCase())) {
      matches.push(`${g.type} visible`);
    } else {
      mismatches.push(`${g.type} not mentioned in judge observations`);
      score -= 10;
    }

    if (g.material && !obsText.includes(g.material.toLowerCase())) {
      mismatches.push(`${g.material} material not confirmed`);
      score -= 5;
    }

    if (g.color && !obsText.includes(g.color.toLowerCase())) {
      mismatches.push(`${g.color} color not confirmed`);
      score -= 5;
    }
  }

  // Check silhouette
  if (spec.silhouette && !obsText.includes(spec.silhouette)) {
    mismatches.push(`Silhouette "${spec.silhouette}" not confirmed`);
    score -= 5;
  }

  // Check footwear
  if (spec.footwear && !obsText.includes(spec.footwear.toLowerCase().split(" ").pop() || "")) {
    mismatches.push(`Footwear "${spec.footwear}" not confirmed`);
    score -= 5;
  }

  return {
    score: Math.max(0, score),
    mismatches,
    matches,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function deduplicateGarments(garments: WardrobeGarment[]): WardrobeGarment[] {
  const seen = new Set<string>();
  const deduped: WardrobeGarment[] = [];
  for (const g of garments) {
    const key = `${g.type}-${g.material ?? ""}-${g.color ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(g);
    }
  }
  return deduped;
}
