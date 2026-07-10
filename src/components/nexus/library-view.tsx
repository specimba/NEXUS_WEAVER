"use client";

import { useMemo, useState } from "react";
import { useNexus } from "./store";
import { SectionHeader } from "./command-view";
import {
  LORA_LIBRARY,
  LORA_CATEGORIES,
  visibleLoras,
  countMature,
  type LoraEntry,
  type LoraCategory,
  type LoraSource,
  type EngineFamily,
} from "@/lib/lora-library";
import { ENGINES } from "@/lib/engines";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Library as LibraryIcon,
  Search,
  ExternalLink,
  Plus,
  Check,
  Lock,
  ShieldAlert,
  Tags,
  Cpu,
  Boxes,
  FileText,
  GitBranch,
  Trash2,
  ArrowRight,
  Eye,
  Star,
  Download,
  Loader2,
  Sparkles,
  AlertCircle,
  Link2,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Source metadata — icon + label + tone for each LoRA source type.
// ---------------------------------------------------------------------------
function sourceMeta(src: LoraSource): {
  icon: LucideIcon;
  label: string;
  cls: string;
} {
  switch (src) {
    case "huggingface":
      return {
        icon: Boxes,
        label: "HF",
        cls: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      };
    case "civitai":
      return {
        icon: Tags,
        label: "Civitai",
        cls: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
      };
    case "github":
      return {
        icon: GitBranch,
        label: "GitHub",
        cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
      };
    case "arxiv":
      return {
        icon: FileText,
        label: "arXiv",
        cls: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
      };
  }
}

function categoryLabel(id: LoraCategory): string {
  return LORA_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

// Compact display string for a LoRA's engine affinity — used in the card
// summary line, the search index, and the apply toast. Replaces the v3
// `baseModel` field which was removed in the v4 multi-engine rewrite.
function familySummary(lora: LoraEntry): string {
  return lora.engineFamilies.length === 0
    ? "universal · all engines"
    : lora.engineFamilies.join(" · ");
}

// ---------------------------------------------------------------------------
// Unique engine families present across the engine catalog + LoRA library.
// Built once at module load so the chip row is stable.
// ---------------------------------------------------------------------------
const ENGINE_FAMILIES: EngineFamily[] = Array.from(
  new Set<EngineFamily>([
    ...ENGINES.map((e) => e.family as EngineFamily),
    ...LORA_LIBRARY.flatMap((l) => l.engineFamilies),
  ]),
).sort((a, b) => a.localeCompare(b));

// ---------------------------------------------------------------------------
// LibraryView — browses the curated HF + Civitai LoRA collection.
// ---------------------------------------------------------------------------
export function LibraryView() {
  const matureUnlocked = useNexus((s) => s.matureUnlocked());
  const loraIds = useNexus((s) => s.loraIds);
  const toggleLora = useNexus((s) => s.toggleLora);
  const clearLoras = useNexus((s) => s.clearLoras);
  const setView = useNexus((s) => s.setView);

  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<LoraCategory | "all">("all");
  const [activeEngine, setActiveEngine] = useState<EngineFamily | "all">("all");
  const [curatedOnly, setCuratedOnly] = useState(false);

  // Imported LoRAs (from the "Import by URL" dialog). Held in React state only —
  // no Prisma persistence this phase. They render alongside the static
  // LORA_LIBRARY entries and flow through the same search/category/engine filters.
  const [importedLoras, setImportedLoras] = useState<LoraEntry[]>([]);

  const total = LORA_LIBRARY.length + importedLoras.length;
  const matureCount = countMature() + importedLoras.filter((l) => l.mature).length;
  const visible = useMemo(() => {
    const lib = visibleLoras(matureUnlocked);
    // Imported first so they appear at the top of the grid (most-recently-added UX).
    const visibleImported = importedLoras.filter(
      (l) => !l.mature || matureUnlocked,
    );
    return [...visibleImported, ...lib];
  }, [matureUnlocked, importedLoras]);

  // Track imported IDs so we can render the "Imported" badge on those cards.
  const importedIdSet = useMemo(
    () => new Set(importedLoras.map((l) => l.id)),
    [importedLoras],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible.filter((l) => {
      if (activeCat !== "all" && l.category !== activeCat) return false;
      if (curatedOnly && l.priority !== "high") return false;
      if (activeEngine !== "all") {
        // Universal LoRAs (empty engineFamilies) always show under any engine filter.
        if (l.engineFamilies.length > 0 && !l.engineFamilies.includes(activeEngine))
          return false;
      }
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.purpose.toLowerCase().includes(q) ||
        familySummary(l).toLowerCase().includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [visible, query, activeCat, activeEngine, curatedOnly]);

  // Add an imported LoRA to local state. Dedupes by URL — prevents the user
  // from importing the same URL twice.
  const addImportedLora = (lora: LoraEntry) => {
    setImportedLoras((prev) => {
      if (prev.some((l) => l.url === lora.url)) {
        toast(`Already imported: ${lora.name}`, {
          description: "This URL is already in your imported LoRAs.",
        });
        return prev;
      }
      return [lora, ...prev];
    });
  };

  return (
    <div className="space-y-5 nexus-rise">
      <SectionHeader
        eyebrow="Library"
        title="LoRA Library"
        desc="Curated HuggingFace + Civitai adapters · 20h of curation"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <ImportLoraDialog onImported={addImportedLora} />
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
              <LibraryIcon className="h-3 w-3" />
              <span className="uppercase tracking-wider opacity-70">Total</span>
              <span className="font-semibold text-foreground">{total}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 font-mono text-[10px] text-emerald-300">
              <Eye className="h-3 w-3" />
              <span className="uppercase tracking-wider opacity-70">Visible</span>
              <span className="font-semibold">{visible.length}</span>
            </span>
            {importedLoras.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/5 px-2.5 py-1 font-mono text-[10px] text-fuchsia-300">
                <Download className="h-3 w-3" />
                <span className="uppercase tracking-wider opacity-70">Imported</span>
                <span className="font-semibold">{importedLoras.length}</span>
              </span>
            ) : null}
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
          placeholder="Search by name, tag, purpose, or base model…"
          className="nexus-input h-10 pl-9"
          aria-label="Search LoRA library"
        />
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCat("all")}
          className={cn(
            "nexus-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
            activeCat === "all"
              ? "nexus-chip-active border-primary/60 text-primary"
              : "border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40",
          )}
        >
          All
          <span className="font-mono text-[9px] opacity-60">{visible.length}</span>
        </button>
        {LORA_CATEGORIES.map((cat) => {
          const isMature = cat.id === "mature";
          const locked = isMature && !matureUnlocked;
          const count = visible.filter((l) => l.category === cat.id).length;
          const active = activeCat === cat.id;
          return (
            <Tooltip key={cat.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    if (locked) {
                      toast.error("Mature content is locked", {
                        description:
                          "Accept the 18+ notice and enable mature mode in Compliance.",
                      });
                      return;
                    }
                    setActiveCat(cat.id);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "nexus-chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    active &&
                      !locked &&
                      "nexus-chip-active border-primary/60 text-primary",
                    !active &&
                      !locked &&
                      "border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40",
                    locked &&
                      "cursor-not-allowed border-amber-500/40 bg-amber-500/5 text-amber-300/70 hover:border-rose-500/40",
                  )}
                >
                  {locked ? <Lock className="h-3 w-3" /> : null}
                  {cat.label}
                  <span className="font-mono text-[9px] opacity-60">
                    {locked ? matureCount : count}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {locked ? "Unlock in Compliance → Policy" : cat.description}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Engine-family filter + curated-only toggle */}
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
          {ENGINE_FAMILIES.map((fam) => {
            const count = visible.filter(
              (l) => l.engineFamilies.length === 0 || l.engineFamilies.includes(fam),
            ).length;
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
              htmlFor="curated-only"
              className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/5 px-3 py-1.5"
            >
              <Switch
                id="curated-only"
                checked={curatedOnly}
                onCheckedChange={setCuratedOnly}
                aria-label="Curated only"
              />
              <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-300">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                Curated only
              </span>
            </label>
          </TooltipTrigger>
          <TooltipContent>
            Show only NO8D / high-priority curated adapters.
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Grid or empty state */}
      {filtered.length === 0 ? (
        <div className="nexus-card rounded-xl py-16 text-center">
          <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No LoRAs match this engine family — try “All engines”.
          </p>
          <button
            onClick={() => {
              setQuery("");
              setActiveCat("all");
              setActiveEngine("all");
              setCuratedOnly(false);
            }}
            className="mt-3 text-xs text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((lora, idx) => (
            <LoraCard
              key={lora.id}
              lora={lora}
              applied={loraIds.includes(lora.id)}
              isImported={importedIdSet.has(lora.id)}
              onToggle={() => {
                const willApply = !loraIds.includes(lora.id);
                toggleLora(lora.id);
                if (willApply) {
                  toast.success(`Applied: ${lora.name}`, {
                    description: `Weight ${lora.recommendedWeight.toFixed(2)} · ${familySummary(lora)}`,
                  });
                } else {
                  toast(`Removed: ${lora.name}`);
                }
              }}
              index={idx}
            />
          ))}
        </div>
      )}

      {/* Sticky bottom action bar */}
      {loraIds.length > 0 ? (
        <div className="sticky bottom-20 z-30 md:bottom-6">
          <div className="nexus-card nexus-glow flex items-center justify-between gap-3 rounded-xl px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                <Check className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  <span className="font-mono text-primary">{loraIds.length}</span>{" "}
                  LoRA{loraIds.length === 1 ? "" : "s"} applied
                </div>
                <div className="truncate font-mono text-[10px] text-muted-foreground">
                  {loraIds.slice(0, 3).join(", ")}
                  {loraIds.length > 3 ? ` +${loraIds.length - 3}` : ""}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  clearLoras();
                  toast("Cleared all applied LoRAs");
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" /> Clear
              </button>
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
// LoraCard — a single LoRA entry card.
// ---------------------------------------------------------------------------
function LoraCard({
  lora,
  applied,
  isImported = false,
  onToggle,
  index,
}: {
  lora: LoraEntry;
  applied: boolean;
  isImported?: boolean;
  onToggle: () => void;
  index: number;
}) {
  const sm = sourceMeta(lora.source);
  const SourceIcon = sm.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
      className={cn(
        "nexus-card nexus-card-hover nexus-card-glow relative flex flex-col rounded-xl p-4",
        lora.mature && "border-rose-500/30",
        applied && "ring-1 ring-emerald-500/40",
        isImported && "border-fuchsia-500/40",
      )}
    >
      {/* Mature ribbon */}
      {lora.mature ? (
        <div className="absolute right-0 top-0 rounded-bl-lg bg-rose-500/90 px-2 py-0.5 font-mono text-[9px] font-bold text-white">
          18+
        </div>
      ) : null}

      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-foreground">{lora.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
              {categoryLabel(lora.category)}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider",
                sm.cls,
              )}
            >
              <SourceIcon className="h-2.5 w-2.5" /> {sm.label}
            </span>
            {lora.isControl ? (
              <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-cyan-300">
                control
              </span>
            ) : null}
            {isImported ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 rounded border border-fuchsia-500/40 bg-fuchsia-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-fuchsia-300">
                    <Download className="h-2.5 w-2.5" />
                    Imported
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Imported by URL — not persisted. License must be verified manually.
                </TooltipContent>
              </Tooltip>
            ) : null}
            {lora.priority === "high" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-300">
                    <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                    Curated
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  NO8D / high-priority curated adapter — flagship for its engine family.
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>
        <a
          href={lora.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center justify-center rounded-md border border-border/60 p-1.5 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          aria-label={`Open ${lora.name} on ${sm.label} (new tab)`}
          title={lora.url}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Engine-family summary (replaces v3 base-model line) */}
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
        <Cpu className="h-3 w-3 shrink-0" />
        <span className="truncate">{familySummary(lora)}</span>
      </div>

      {/* Engine-family badges */}
      <div className="mb-2 flex flex-wrap gap-1">
        {lora.engineFamilies.length === 0 ? (
          <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-300">
            Universal
          </span>
        ) : (
          lora.engineFamilies.map((fam) => (
            <span
              key={fam}
              className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-fuchsia-300"
            >
              {fam}
            </span>
          ))
        )}
      </div>

      {/* Purpose */}
      <p className="mb-3 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
        {lora.purpose}
      </p>

      {/* Tags */}
      <div className="mb-3 flex flex-wrap gap-1">
        {lora.tags.map((tag) => (
          <span
            key={tag}
            className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 font-mono text-[9px] text-primary">
          weight {lora.recommendedWeight.toFixed(2)}
        </span>
        <button
          onClick={onToggle}
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
              <Plus className="h-3 w-3" /> Apply
            </>
          )}
        </button>
      </div>

      {/* License hint */}
      <div className="mt-2 truncate font-mono text-[8px] text-muted-foreground/60">
        license: {lora.license}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ImportLoraDialog — "Import by URL" dialog. POSTs to /api/lora/import, shows
// a preview card with Add/Cancel actions. Imported LoRAs are passed up to the
// parent via onImported (no Prisma persistence this phase).
// ---------------------------------------------------------------------------
type ImportStatus = "idle" | "loading" | "preview" | "error";

function ImportLoraDialog({ onImported }: { onImported: (lora: LoraEntry) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [preview, setPreview] = useState<LoraEntry | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const reset = () => {
    setUrl("");
    setStatus("idle");
    setPreview(null);
    setErrorMsg(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Reset state shortly after close so the dialog content doesn't flash empty
      setTimeout(reset, 200);
    }
  };

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setErrorMsg("Please enter a URL.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErrorMsg(null);
    setPreview(null);
    try {
      const res = await fetch("/api/lora/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as
        | { lora?: LoraEntry; error?: string; details?: string }
        | null;
      if (!res.ok || !data?.lora) {
        const msg = data?.error ?? `Import failed (HTTP ${res.status})`;
        const details = data?.details ? ` — ${data.details}` : "";
        setErrorMsg(`${msg}${details}`);
        setStatus("error");
        return;
      }
      setPreview(data.lora);
      setStatus("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(`Network error: ${msg}`);
      setStatus("error");
    }
  };

  const handleAddToLibrary = () => {
    if (!preview) return;
    onImported(preview);
    toast.success(`Added to library: ${preview.name}`, {
      description: `Imported from ${preview.source} · visible at top of grid`,
    });
    setOpen(false);
    setTimeout(reset, 200);
  };

  const handleCancel = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-fuchsia-500/40 bg-fuchsia-500/10 px-2.5 py-1 font-mono text-[10px] font-medium text-fuchsia-300 transition hover:border-fuchsia-500/60 hover:bg-fuchsia-500/20"
            aria-label="Import LoRA by URL"
          >
            <Download className="h-3 w-3" />
            <span className="uppercase tracking-wider">Import</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          Import a LoRA from HuggingFace or Civitai by URL. Civitai.com uses the
          free REST API; Civitai.red (NSFW) uses Browserless.
        </TooltipContent>
      </Tooltip>
      <DialogContent className="nexus-card max-w-lg gap-0 rounded-xl border-border/60 p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border/40 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-fuchsia-500/15 text-fuchsia-300">
              <Download className="h-4 w-4" />
            </span>
            Import LoRA by URL
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Paste a HuggingFace ({"huggingface.co/{owner}/{repo}"}), Civitai
            ({"civitai.com/models/{id}"}), or Civitai.red
            ({"civitai.red/models/{id}"}) URL. The backend auto-detects the source
            and scrapes structured metadata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5">
          {/* URL input + Import button */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (status !== "idle") {
                    setStatus("idle");
                    setErrorMsg(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && status !== "loading") {
                    e.preventDefault();
                    void handleImport();
                  }
                }}
                placeholder="https://civitai.com/models/12345 or https://huggingface.co/owner/repo"
                className="nexus-input h-10 pl-9"
                aria-label="LoRA URL"
                disabled={status === "loading"}
              />
            </div>
            <Button
              onClick={() => void handleImport()}
              disabled={status === "loading" || url.trim().length === 0}
              size="sm"
              className="h-10 shrink-0 gap-1.5 bg-fuchsia-500/90 px-4 text-fuchsia-50 hover:bg-fuchsia-500"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Scraping…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Import
                </>
              )}
            </Button>
          </div>

          {/* Loading state */}
          {status === "loading" ? (
            <div className="flex items-center gap-2 rounded-md border border-border/40 bg-card/40 px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-fuchsia-300" />
              <span>
                Fetching metadata — HF uses the public API (fast), Civitai.red
                spins up a headless browser (~10-20s).
              </span>
            </div>
          ) : null}

          {/* Error state */}
          {status === "error" && errorMsg ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold">Import failed</div>
                <div className="mt-0.5 break-words text-[11px] text-rose-300/80">
                  {errorMsg}
                </div>
              </div>
            </div>
          ) : null}

          {/* Preview card */}
          {status === "preview" && preview ? (
            <div className="space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Preview
              </div>
              <div
                className={cn(
                  "nexus-card relative rounded-lg border p-3.5",
                  preview.mature ? "border-rose-500/30" : "border-fuchsia-500/30",
                )}
              >
                {preview.mature ? (
                  <div className="absolute right-0 top-0 rounded-bl-lg bg-rose-500/90 px-2 py-0.5 font-mono text-[8px] font-bold text-white">
                    18+
                  </div>
                ) : null}
                <h4 className="truncate text-sm font-bold text-foreground">
                  {preview.name}
                </h4>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider",
                      sourceMeta(preview.source).cls,
                    )}
                  >
                    {(() => {
                      const sm = sourceMeta(preview.source);
                      const Icon = sm.icon;
                      return (
                        <>
                          <Icon className="h-2.5 w-2.5" /> {sm.label}
                        </>
                      );
                    })()}
                  </span>
                  <span className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                    {categoryLabel(preview.category)}
                  </span>
                  {preview.isControl ? (
                    <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-cyan-300">
                      control
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {preview.engineFamilies.length === 0 ? (
                    <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-300">
                      Universal
                    </span>
                  ) : (
                    preview.engineFamilies.map((fam) => (
                      <span
                        key={fam}
                        className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-fuchsia-300"
                      >
                        {fam}
                      </span>
                    ))
                  )}
                </div>
                <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
                  {preview.purpose}
                </p>
                {preview.tags.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {preview.tags.slice(0, 8).map((tag) => (
                      <span
                        key={tag}
                        className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                    {preview.tags.length > 8 ? (
                      <span className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[8px] text-muted-foreground">
                        +{preview.tags.length - 8} more
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {preview.notes ? (
                  <div className="mt-2 truncate font-mono text-[8px] text-muted-foreground/70">
                    {preview.notes}
                  </div>
                ) : null}
                <div className="mt-1 truncate font-mono text-[8px] text-muted-foreground/60">
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-primary hover:underline"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    {preview.url}
                  </a>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex-row items-center justify-end gap-2 border-t border-border/40 px-5 py-3.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-9 px-3 text-xs"
          >
            Cancel
          </Button>
          {status === "preview" && preview ? (
            <Button
              size="sm"
              onClick={handleAddToLibrary}
              className="h-9 gap-1.5 bg-emerald-500/90 px-4 text-emerald-50 hover:bg-emerald-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Add to Library
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
