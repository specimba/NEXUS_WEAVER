"use client";

import { useMemo, useState } from "react";
import { useNexus } from "./store";
import { SectionHeader } from "./command-view";
import {
  LORA_PACKS,
  packWeightSum,
  type LoraPack,
  type LoraPackSource,
} from "@/lib/lora-packs";
import { getLora } from "@/lib/lora-library";
import { ENGINES } from "@/lib/engines";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Boxes,
  Search,
  Lock,
  ShieldAlert,
  Tags,
  Cpu,
  Sparkles,
  Layers,
  Plus,
  Check,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Zap,
  Eye,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Source metadata — icon + label + tone for each pack source.
// ---------------------------------------------------------------------------
function sourceMeta(src: LoraPackSource): {
  icon: LucideIcon;
  label: string;
  cls: string;
} {
  switch (src) {
    case "aeon":
      return {
        icon: Sparkles,
        label: "AEON",
        cls: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300",
      };
    case "curated":
      return {
        icon: Boxes,
        label: "Curated",
        cls: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      };
    case "civitai":
      return {
        icon: Tags,
        label: "Civitai",
        cls: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
      };
    case "hf":
      return {
        icon: Boxes,
        label: "HF",
        cls: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      };
    case "user":
      return {
        icon: Layers,
        label: "User",
        cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      };
  }
}

// Resolve the engine family label for a pack via the engines catalog.
function engineFamily(engineId: string): string {
  return ENGINES.find((e) => e.id === engineId)?.family ?? engineId;
}

function engineName(engineId: string): string {
  return ENGINES.find((e) => e.id === engineId)?.shortName ?? engineId;
}

// Unique engine families present across the pack catalog (for the chip row).
const PACK_ENGINE_FAMILIES: string[] = Array.from(
  new Set(LORA_PACKS.map((p) => engineFamily(p.engineId))),
).sort((a, b) => a.localeCompare(b));

// ---------------------------------------------------------------------------
// PacksView — browses ComfyUI-style workflow packs.
// ---------------------------------------------------------------------------
export function PacksView() {
  const matureUnlocked = useNexus((s) => s.matureUnlocked());
  const applyPack = useNexus((s) => s.applyPack);
  const loraIds = useNexus((s) => s.loraIds);
  const engineId = useNexus((s) => s.engineId);
  const prompt = useNexus((s) => s.prompt);
  const setView = useNexus((s) => s.setView);
  const powerMode = useNexus((s) => s.powerMode);
  const togglePowerMode = useNexus((s) => s.togglePowerMode);

  const [query, setQuery] = useState("");
  const [activeEngine, setActiveEngine] = useState<string | "all">("all");
  const [appliedPackId, setAppliedPackId] = useState<string | null>(null);

  const total = LORA_PACKS.length;
  const matureCount = LORA_PACKS.filter((p) => p.mature).length;
  const visible = useMemo(
    () => LORA_PACKS.filter((p) => (matureUnlocked ? true : !p.mature)),
    [matureUnlocked],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible.filter((p) => {
      if (activeEngine !== "all" && engineFamily(p.engineId) !== activeEngine) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.engineId.toLowerCase().includes(q) ||
        p.bestFor.some((b) => b.toLowerCase().includes(q)) ||
        p.loras.some((l) => l.loraId.toLowerCase().includes(q) || l.role.toLowerCase().includes(q))
      );
    });
  }, [visible, query, activeEngine]);

  function handleApply(pack: LoraPack) {
    if (pack.mature && !matureUnlocked) {
      toast.error("Pack is mature-gated", {
        description: "Accept the 18+ notice and enable mature mode in Compliance.",
      });
      return;
    }
    applyPack(pack.id);
    setAppliedPackId(pack.id);
  }

  // Was the current studio state derived from a pack? We detect this by
  // comparing the applied pack's LoRA IDs to the current loraIds.
  function isPackActive(pack: LoraPack): boolean {
    if (appliedPackId === pack.id) return true;
    if (pack.loras.length === 0 || loraIds.length !== pack.loras.length) return false;
    return pack.loras.every((l) => loraIds.includes(l.loraId));
  }

  return (
    <div className="space-y-5 nexus-rise">
      <SectionHeader
        eyebrow="Workflow Packs"
        title="ComfyUI-style Workflow Packs"
        desc="One-click bundles of engine + calibration + LoRA stack + prompt template. Curated for the multi-engine catalog and pre-tuned for AGENTS rule #5 (≤0.5 weights, ≤3 LoRAs)."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
              <Boxes className="h-3 w-3" />
              <span className="uppercase tracking-wider opacity-70">Total</span>
              <span className="font-semibold text-foreground">{total}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 font-mono text-[10px] text-emerald-300">
              <Eye className="h-3 w-3" />
              <span className="uppercase tracking-wider opacity-70">Visible</span>
              <span className="font-semibold">{visible.length}</span>
            </span>
            {matureUnlocked ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/30 bg-rose-500/5 px-2.5 py-1 font-mono text-[10px] text-rose-300">
                <ShieldAlert className="h-3 w-3" />
                <span className="uppercase tracking-wider opacity-70">Mature</span>
                <span className="font-semibold">{matureCount}</span>
              </span>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex cursor-help items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1 font-mono text-[10px] text-amber-300">
                    <Lock className="h-3 w-3" />
                    <span className="uppercase tracking-wider opacity-70">Mature</span>
                    <span className="font-semibold">{matureCount} locked</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Unlock in Compliance → Policy</TooltipContent>
              </Tooltip>
            )}
          </div>
        }
      />

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search packs by name, description, role, or bestFor tag…"
          className="nexus-input h-10 pl-9"
          aria-label="Search workflow packs"
        />
      </div>

      {/* Engine filter + Power Mode toggle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="nexus-scroll flex items-center gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
            Engine
          </span>
          <button
            onClick={() => setActiveEngine("all")}
            aria-pressed={activeEngine === "all"}
            className={cn(
              "nexus-chip inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
              activeEngine === "all"
                ? "nexus-chip-active border-primary/60 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40",
            )}
          >
            All engines
            <span className="font-mono text-[9px] opacity-60">{visible.length}</span>
          </button>
          {PACK_ENGINE_FAMILIES.map((fam) => {
            const count = visible.filter((p) => engineFamily(p.engineId) === fam).length;
            const active = activeEngine === fam;
            return (
              <button
                key={fam}
                onClick={() => setActiveEngine(fam)}
                aria-pressed={active}
                className={cn(
                  "nexus-chip inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "nexus-chip-active border-primary/60 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40",
                )}
              >
                {fam}
                <span className="font-mono text-[9px] opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              htmlFor="power-mode"
              className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/5 px-3 py-1.5"
            >
              <Switch
                id="power-mode"
                checked={powerMode}
                onCheckedChange={togglePowerMode}
                aria-label="Power Mode (silences rule #5 stack warning)"
              />
              <span className="inline-flex items-center gap-1 text-xs font-medium text-fuchsia-300">
                <Zap className="h-3 w-3 fill-fuchsia-400 text-fuchsia-400" />
                Power Mode
              </span>
            </label>
          </TooltipTrigger>
          <TooltipContent>
            Silences the 3-LoRA stacking warning (AGENTS rule #5). LoRAs are still added — Power Mode just hides the toast.
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Grid or empty state */}
      {filtered.length === 0 ? (
        <div className="nexus-card rounded-xl py-16 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No packs match this filter — try “All engines” or clear the search.
          </p>
          <button
            onClick={() => {
              setQuery("");
              setActiveEngine("all");
            }}
            className="mt-3 text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((pack, idx) => (
            <PackCard
              key={pack.id}
              pack={pack}
              applied={isPackActive(pack)}
              onApply={() => handleApply(pack)}
              index={idx}
            />
          ))}
        </div>
      )}

      {/* Sticky bottom action bar — only when a pack has been applied */}
      {appliedPackId ? (
        <div className="sticky bottom-20 z-30 md:bottom-6">
          <div className="nexus-card nexus-glow flex items-center justify-between gap-3 rounded-xl px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                <Check className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {LORA_PACKS.find((p) => p.id === appliedPackId)?.name ?? "Pack applied"}
                </div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  {loraIds.length} LoRA{loraIds.length === 1 ? "" : "s"} · {engineName(engineId)} · prompt {prompt.length} chars
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setView("studio")}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Open in Studio <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PackCard — a single pack card.
// ---------------------------------------------------------------------------
function PackCard({
  pack,
  applied,
  onApply,
  index,
}: {
  pack: LoraPack;
  applied: boolean;
  onApply: () => void;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const sm = sourceMeta(pack.source);
  const SourceIcon = sm.icon;
  const weightSum = packWeightSum(pack);
  const fam = engineFamily(pack.engineId);
  const engName = engineName(pack.engineId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      className={cn(
        "nexus-card nexus-card-hover nexus-card-glow relative flex flex-col rounded-xl p-4",
        pack.mature && "border-rose-500/30",
        applied && "ring-1 ring-emerald-500/40",
      )}
    >
      {/* Mature ribbon */}
      {pack.mature ? (
        <div className="absolute right-0 top-0 rounded-bl-lg bg-rose-500/90 px-2 py-0.5 font-mono text-[9px] font-bold text-white">
          18+
        </div>
      ) : null}

      {/* Header: emoji + name + source badge */}
      <div className="mb-2 flex items-start gap-3">
        <div
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/40 text-xl"
        >
          {pack.thumbnailEmoji ?? "📦"}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-foreground">{pack.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider",
                sm.cls,
              )}
            >
              <SourceIcon className="h-2.5 w-2.5" /> {sm.label}
            </span>
            <span className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-fuchsia-300">
              {fam}
            </span>
            {pack.mature ? (
              <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-rose-300">
                mature
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Engine + LoRA count + total weight summary */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Cpu className="h-3 w-3 shrink-0" />
          {engName}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="inline-flex items-center gap-1">
          <Layers className="h-3 w-3 shrink-0" />
          {pack.loras.length} LoRA{pack.loras.length === 1 ? "" : "s"}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3 shrink-0" />
          Σw {weightSum.toFixed(2)}
        </span>
      </div>

      {/* Description (rule #5 usage advice is embedded here) */}
      <p className="mb-3 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
        {pack.description}
      </p>

      {/* bestFor tags */}
      <div className="mb-3 flex flex-wrap gap-1">
        {pack.bestFor.slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-0.5 font-mono text-[8px] text-emerald-300"
          >
            ✓ {tag}
          </span>
        ))}
        {pack.bestFor.length > 3 ? (
          <span className="font-mono text-[8px] text-muted-foreground/60">
            +{pack.bestFor.length - 3} more
          </span>
        ) : null}
      </div>

      {/* Preview stack expand */}
      {expanded ? (
        <div className="mb-3 rounded-md border border-border/40 bg-background/40 p-2.5">
          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            LoRA Stack
          </div>
          <ul className="space-y-1.5">
            {pack.loras.map((entry, i) => {
              const lora = getLora(entry.loraId);
              return (
                <li key={entry.loraId} className="flex items-start gap-2">
                  <span className="mt-0.5 font-mono text-[9px] text-muted-foreground/60">
                    {i + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[11px] font-medium text-foreground">
                        {lora?.name ?? entry.loraId}
                      </span>
                      <span className="shrink-0 rounded border border-primary/30 bg-primary/5 px-1 py-0.5 font-mono text-[8px] text-primary">
                        w {entry.weight.toFixed(2)}
                      </span>
                    </div>
                    <div className="font-mono text-[8px] uppercase tracking-wider text-fuchsia-300/80">
                      role: {entry.role}
                    </div>
                    {entry.notes ? (
                      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                        {entry.notes}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          {pack.promptTemplate ? (
            <div className="mt-2.5 border-t border-border/40 pt-2">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Prompt Template
              </div>
              <p className="line-clamp-3 text-[10px] italic leading-snug text-muted-foreground">
                “{pack.promptTemplate}”
              </p>
            </div>
          ) : null}
          {pack.avoidFor.length > 0 ? (
            <div className="mt-2 border-t border-border/40 pt-2">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Avoid for
              </div>
              <div className="flex flex-wrap gap-1">
                {pack.avoidFor.map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-rose-500/30 bg-rose-500/5 px-1.5 py-0.5 font-mono text-[8px] text-rose-300"
                  >
                    ✗ {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Footer: preview toggle + apply button */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse stack preview" : "Expand stack preview"}
        >
          {expanded ? (
            <>
              <ChevronDown className="h-3 w-3" /> Hide stack
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3" /> Preview stack
            </>
          )}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onApply();
          }}
          aria-pressed={applied}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition",
            applied
              ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
              : "border border-border/60 text-foreground hover:border-primary/40 hover:bg-primary/5",
          )}
        >
          {applied ? (
            <>
              <Check className="h-3 w-3" /> Applied ✓
            </>
          ) : (
            <>
              <Plus className="h-3 w-3" /> Apply Pack
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
