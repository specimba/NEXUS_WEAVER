"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Panel, SectionHeader } from "./command-view";
import { VerdictBadge, StatusDot } from "./verdict-badge";
import { ScoreRing } from "./score-ring";
import { cn } from "@/lib/utils";
import type { GenerationListItem } from "@/lib/nexus-types";
import { useNexus } from "./store";
import {
  Images,
  Trash2,
  X,
  Loader2,
  ShieldCheck,
  ScanEye,
  FileJson,
  Clock,
  Filter,
  RotateCcw,
  Download,
  Search,
  Star,
  Columns2,
  ArrowLeftRight,
} from "lucide-react";
import { toast } from "sonner";

interface GalleryResp {
  items: GenerationListItem[];
  total: number;
  limit: number;
  offset: number;
}

function useGallery(filter: string) {
  return useQuery<GalleryResp>({
    queryKey: ["nexus-gallery", filter],
    queryFn: async () => {
      const res = await fetch("/api/gallery?limit=60", { cache: "no-store" });
      if (!res.ok) throw new Error("gallery");
      return res.json();
    },
    refetchInterval: 20000,
  });
}

const FAV_KEY = "nexus-favorites";

function loadFavs(): Set<string> {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(FAV_KEY) : null;
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}
function saveFavs(s: Set<string>) {
  try {
    window.localStorage.setItem(FAV_KEY, JSON.stringify([...s]));
  } catch {
    /* ignore */
  }
}

export function GalleryView() {
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [favs, setFavs] = useState<Set<string>>(() => loadFavs());
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<[string, string] | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const qc = useQueryClient();
  const { data, isLoading } = useGallery(filter);
  const setView = useNexus((s) => s.setView);

  const toggleFav = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavs(next);
      return next;
    });
  };

  const q = query.trim().toLowerCase();
  const items = (data?.items ?? []).filter((it) => {
    if (filter === "favorites" && !favs.has(it.id)) return false;
    if (filter === "approved") return it.verdict === "approved";
    if (filter === "rejected") return it.verdict === "rejected";
    if (filter === "review") return it.verdict === "needs_review";
    if (filter === "failed") return it.status === "failed";
    if (filter !== "all" && filter !== "favorites") return true;
    if (filter === "all" && q) {
      return (
        it.prompt.toLowerCase().includes(q) ||
        it.style.toLowerCase().includes(q) ||
        it.aspect.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filters = [
    { id: "all", label: "All" },
    { id: "favorites", label: "Favorites" },
    { id: "approved", label: "Approved" },
    { id: "review", label: "Needs Review" },
    { id: "rejected", label: "Rejected" },
    { id: "failed", label: "Failed" },
  ];

  return (
    <div className="space-y-5 nexus-rise">
      <SectionHeader
        eyebrow="Gallery"
        title="Generation Archive"
        desc="Every image weaved by the pipeline, with full provenance and verdicts."
        right={
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex flex-wrap justify-end gap-1">
                {filters.map((f) => {
                  const active = filter === f.id;
                  const count =
                    f.id === "favorites" ? favs.size : f.id === "all" ? (data?.total ?? 0) : undefined;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFilter(f.id)}
                      className={cn(
                        "nexus-chip inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                        active ? "nexus-chip-active" : "border-border/50 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {f.label}
                      {typeof count === "number" && count > 0 ? (
                        <span className="rounded bg-foreground/10 px-1 text-[9px]">{count}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => {
                  setCompareMode((v) => {
                    if (v) {
                      setSelectedForCompare([]);
                      return false;
                    }
                    return true;
                  });
                }}
                className={cn(
                  "nexus-chip inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                  compareMode
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                    : "border-border/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <Columns2 className="h-3 w-3" />
                {compareMode ? `Compare (${selectedForCompare.length}/2)` : "Compare"}
              </button>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search prompts, styles…"
                className="nexus-input w-56 rounded-md border border-border/50 bg-background/60 py-1 pl-7 pr-2 text-[11px] outline-none"
              />
              </div>
            </div>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Panel title={filter === "favorites" ? "No Favorites" : "Empty"} icon={<Images className="h-4 w-4" />}>
          <div className="grid place-items-center py-12 text-center">
            <div className="nexus-rise">
              {filter === "favorites" ? (
                <Star className="mx-auto mb-3 h-10 w-10 text-amber-400/40" />
              ) : (
                <Images className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              )}
              <p className="text-sm text-muted-foreground">
                {filter === "favorites"
                  ? "No favorites yet. Tap the ★ on any generation to save it here."
                  : query
                    ? `No generations match "${query}".`
                    : "No generations yet."}
              </p>
              <button
                onClick={() => setView("studio")}
                className="mt-3 rounded-lg bg-primary/15 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary transition hover:bg-primary/25"
              >
                Open Studio →
              </button>
            </div>
          </div>
        </Panel>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((it) => {
            const fav = favs.has(it.id);
            return (
              <button
                key={it.id}
                onClick={() => {
                  if (compareMode) {
                    setSelectedForCompare((prev) => {
                      if (prev.includes(it.id)) return prev.filter((x) => x !== it.id);
                      if (prev.length >= 2) return prev;
                      const next = [...prev, it.id];
                      if (next.length === 2) {
                        setCompareIds([next[0], next[1]]);
                      }
                      return next;
                    });
                  } else {
                    setSelected(it.id);
                  }
                }}
                className={cn(
                  "nexus-card nexus-card-hover group relative overflow-hidden rounded-xl text-left",
                  compareMode && selectedForCompare.includes(it.id) && "ring-2 ring-amber-400/60"
                )}
              >
                <div className="relative aspect-square overflow-hidden bg-background/60">
                  {it.imagePath ? (
                    
                    <img
                      src={it.imagePath}
                      alt={it.prompt}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-muted-foreground/40">
                      <X className="h-6 w-6" />
                    </div>
                  )}
                  {/* score chip on image */}
                  {typeof it.overallScore === "number" ? (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md nexus-glass px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                      {Math.round(it.overallScore)}
                    </span>
                  ) : null}
                  {/* favorite star */}
                  <span
                    role="button"
                    aria-label="toggle favorite"
                    onClick={(e) => toggleFav(e, it.id)}
                    className={cn(
                      "absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-md nexus-glass transition",
                      fav ? "text-amber-400" : "text-muted-foreground opacity-0 group-hover:opacity-100"
                    )}
                  >
                    <Star className={cn("h-3.5 w-3.5", fav && "fill-amber-400")} />
                  </span>
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 text-[11px] leading-snug text-foreground">
                    {it.prompt}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between">
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {it.style} · {it.aspect}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground/70">
                      {new Date(it.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <VerdictBadge verdict={it.verdict ?? it.status} size="sm" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <DetailDrawer
          id={selected}
          onClose={() => setSelected(null)}
          onDeleted={() => {
            setSelected(null);
            qc.invalidateQueries({ queryKey: ["nexus-gallery"] });
            qc.invalidateQueries({ queryKey: ["nexus-metrics"] });
          }}
        />
      ) : null}

      {compareIds ? (
        <CompareDrawer
          ids={compareIds}
          onClose={() => {
            setCompareIds(null);
            setSelectedForCompare([]);
          }}
        />
      ) : null}
    </div>
  );
}

interface DetailData {
  id: string;
  prompt: string;
  style: string;
  aspect: string;
  wardrobe: string | null;
  size: string;
  imagePath: string | null;
  status: string;
  verdict: string | null;
  overallScore: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  timings: Record<string, number> | null;
  evidence: Record<string, unknown> | null;
  safety: {
    passed: boolean;
    score: number;
    riskLevel: string;
    flags: string[];
    rationale: string;
    stageMs: number;
  } | null;
  judge: {
    promptAdherence: number;
    visualQuality: number;
    aestheticScore: number;
    safetyScore: number;
    wardrobeMatch: number;
    overallScore: number;
    verdict: string;
    observations: string[];
    strengths: string[];
    weaknesses: string[];
    stageMs: number;
  } | null;
}

function DetailDrawer({
  id,
  onClose,
  onDeleted,
}: {
  id: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { data, isLoading } = useQuery<DetailData>({
    queryKey: ["nexus-gen", id],
    queryFn: async () => {
      const res = await fetch(`/api/gallery/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("detail");
      return res.json();
    },
  });
  const [deleting, setDeleting] = useState(false);
  const loadSettings = useNexus((s) => s.loadSettings);
  const setView = useNexus((s) => s.setView);

  const del = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/gallery/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete");
      toast.success("Generation deleted");
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "delete failed");
      setDeleting(false);
    }
  };

  const rerun = () => {
    if (!data) return;
    loadSettings({
      prompt: data.prompt,
      style: data.style,
      aspect: data.aspect,
      wardrobe: data.wardrobe ?? "",
    });
    onClose();
    setView("studio");
    toast.info("Settings loaded into Studio — press Run to re-weave");
  };

  const exportEvidence = () => {
    if (!data?.evidence) return;
    const blob = new Blob([JSON.stringify(data.evidence, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus-evidence-${id.slice(-8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportFullReport = () => {
    if (!data) return;
    // Full report: metadata + safety + judge + evidence + timings
    const report = {
      schema: "nexus-visual-weaver/report@v1",
      exportedAt: new Date().toISOString(),
      generation: {
        id: data.id,
        prompt: data.prompt,
        style: data.style,
        aspect: data.aspect,
        wardrobe: data.wardrobe,
        size: data.size,
        imagePath: data.imagePath,
        status: data.status,
        verdict: data.verdict,
        overallScore: data.overallScore,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      },
      timings: data.timings,
      safety: data.safety,
      judge: data.judge,
      evidence: data.evidence,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus-report-${id.slice(-8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Full report exported");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-md sm:items-center sm:p-4">
      <div className="nexus-scale-in flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-border/60 bg-card shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Generation
            </span>
            <span className="font-mono text-xs text-primary">{id.slice(-8)}</span>
            {data ? <VerdictBadge verdict={data.verdict ?? data.status} size="sm" /> : null}
          </div>
          <div className="flex items-center gap-2">
            {data?.evidence ? (
              <button
                onClick={exportEvidence}
                className="nexus-press inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/50 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                title="Export Gemma 4 evidence JSON only"
              >
                <Download className="h-3 w-3" /> Evidence
              </button>
            ) : null}
            {data ? (
              <button
                onClick={exportFullReport}
                className="nexus-press inline-flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-300 transition hover:bg-emerald-500/20"
                title="Export full report JSON (metadata + safety + judge + evidence + timings)"
              >
                <FileJson className="h-3 w-3" /> Full Report
              </button>
            ) : null}
            <button
              onClick={rerun}
              disabled={!data}
              className="nexus-press inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-primary transition hover:bg-primary/20 disabled:opacity-50"
            >
              <RotateCcw className="h-3 w-3" /> Re-run
            </button>
            <button
              onClick={del}
              disabled={deleting}
              className="nexus-press inline-flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Delete
            </button>
            <button
              onClick={onClose}
              className="rounded-md border border-border/60 p-1.5 text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="nexus-scroll flex-1 overflow-y-auto p-4">
          {isLoading || !data ? (
            <div className="grid place-items-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border border-border/50 bg-background/40">
                  {data.imagePath ? (
                     
                    <img src={data.imagePath} alt={data.prompt} className="w-full" />
                  ) : (
                    <div className="grid aspect-square place-items-center text-muted-foreground">
                      <X className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-border/40 bg-background/30 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Prompt
                  </div>
                  <p className="text-sm text-foreground">{data.prompt}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                    <Meta label="Style" value={data.style} />
                    <Meta label="Aspect" value={data.aspect} />
                    <Meta label="Size" value={data.size} />
                  </div>
                  {data.wardrobe ? (
                    <div className="mt-2 text-[10px]">
                      <span className="text-muted-foreground">Wardrobe: </span>
                      <span className="text-foreground">{data.wardrobe}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/30 p-3">
                  <ScoreRing value={data.overallScore} size={64} label="Overall" />
                  <div className="flex-1 space-y-1.5">
                    {data.judge ? (
                      <>
                        <Bar label="Prompt adherence" v={data.judge.promptAdherence} />
                        <Bar label="Visual quality" v={data.judge.visualQuality} />
                        <Bar label="Aesthetic" v={data.judge.aestheticScore} />
                        <Bar label="Safety" v={data.judge.safetyScore} />
                        <Bar label="Wardrobe match" v={data.judge.wardrobeMatch} />
                      </>
                    ) : null}
                  </div>
                </div>

                {data.safety ? (
                  <DetailBlock title="ST3GG Safety" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
                    <Row k="Risk level" v={data.safety?.riskLevel ?? "unknown"} />
                    <Row k="Score" v={String(data.safety?.score ?? "—")} />
                    <Row k="Passed" v={data.safety?.passed ? "yes" : "no"} />
                    <Row k="Stage" v={`${data.safety?.stageMs ?? 0}ms`} />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {data.safety?.rationale ?? "No rationale provided."}
                    </p>
                    {(data.safety?.flags?.length ?? 0) > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {data.safety!.flags!.map((f) => (
                          <span
                            key={f}
                            className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] text-amber-300"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </DetailBlock>
                ) : null}

                {data.judge ? (
                  <DetailBlock title="Gemma 4 Judge" icon={<ScanEye className="h-3.5 w-3.5" />}>
                    <Row k="Verdict" v={data.judge?.verdict ?? "unknown"} />
                    <Row k="Stage" v={`${data.judge?.stageMs ?? 0}ms`} />
                    {(data.judge?.observations?.length ?? 0) > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                        {data.judge!.observations!.map((o, i) => (
                          <li key={i}>• {o}</li>
                        ))}
                      </ul>
                    ) : null}
                  </DetailBlock>
                ) : null}

                {data.evidence ? (
                  <DetailBlock title="Gemma 4 Evidence" icon={<FileJson className="h-3.5 w-3.5" />}>
                    <pre className="nexus-scroll max-h-48 overflow-auto rounded bg-background/60 p-2 text-[9px] leading-relaxed">
{JSON.stringify(data.evidence, null, 2)}
                    </pre>
                  </DetailBlock>
                ) : null}

                {data.timings ? (
                  <DetailBlock title="Stage Timings" icon={<Clock className="h-3.5 w-3.5" />}>
                    <div className="grid grid-cols-3 gap-1.5">
                      {Object.entries(data.timings).map(([k, v]) => (
                        <div
                          key={k}
                          className="rounded border border-border/30 bg-background/40 px-2 py-1 text-center"
                        >
                          <div className="font-mono text-[9px] uppercase text-muted-foreground">
                            {k}
                          </div>
                          <div className="font-mono text-[11px] text-foreground">
                            {v < 1000 ? `${v}ms` : `${(v / 1000).toFixed(1)}s`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </DetailBlock>
                ) : null}

                {data.errorMessage ? (
                  <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-[11px] text-rose-300">
                    {data.errorMessage}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Compare Drawer ────────────────────────────────────────────────────

function CompareDrawer({
  ids,
  onClose,
}: {
  ids: [string, string];
  onClose: () => void;
}) {
  const [dataA, setDataA] = useState<DetailData | null>(null);
  const [dataB, setDataB] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(() => true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/gallery/${ids[0]}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/gallery/${ids[1]}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([a, b]) => {
        if (cancelled) return;
        setDataA(a);
        setDataB(b);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ids]);

  const scoreRows: { label: string; a?: number; b?: number }[] = [
    { label: "Overall", a: dataA?.judge?.overallScore, b: dataB?.judge?.overallScore },
    { label: "Prompt adherence", a: dataA?.judge?.promptAdherence, b: dataB?.judge?.promptAdherence },
    { label: "Visual quality", a: dataA?.judge?.visualQuality, b: dataB?.judge?.visualQuality },
    { label: "Aesthetic", a: dataA?.judge?.aestheticScore, b: dataB?.judge?.aestheticScore },
    { label: "Safety", a: dataA?.judge?.safetyScore, b: dataB?.judge?.safetyScore },
    { label: "Wardrobe match", a: dataA?.judge?.wardrobeMatch, b: dataB?.judge?.wardrobeMatch },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="nexus-scale-in flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-[11px] uppercase tracking-wider text-amber-300">
              Comparison Mode
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border/60 p-1.5 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="nexus-scroll flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="grid place-items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {[dataA, dataB].map((data, idx) => (
                <div key={idx} className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase font-bold",
                        idx === 0
                          ? "bg-primary/15 text-primary"
                          : "bg-amber-500/15 text-amber-300"
                      )}
                    >
                      {idx === 0 ? "A" : "B"}
                    </span>
                    <VerdictBadge verdict={data?.verdict ?? data?.status} size="sm" />
                  </div>
                  {data?.imagePath ? (
                    <div className="overflow-hidden rounded-xl border border-border/40">
                      { }
                      <img src={data.imagePath} alt={data.prompt} className="w-full" />
                    </div>
                  ) : null}
                  <p className="text-sm text-foreground">{data?.prompt}</p>
                  <div className="flex gap-2 text-[10px] text-muted-foreground">
                    <span className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5">
                      {data?.style}
                    </span>
                    <span className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5">
                      {data?.aspect}
                    </span>
                  </div>
                  {data?.judge ? (
                    <div className="space-y-2">
                      <ScoreRing
                        value={data.judge.overallScore}
                        size={60}
                        label={idx === 0 ? "A" : "B"}
                      />
                      <div className="space-y-1.5">
                        {scoreRows
                          .filter((r) => r.label !== "Overall")
                          .map((row) => {
                            const val = idx === 0 ? row.a : row.b;
                            const otherVal = idx === 0 ? row.b : row.a;
                            const better =
                              typeof val === "number" &&
                              typeof otherVal === "number" &&
                              val > otherVal;
                            return (
                              <div key={row.label}>
                                <div className="mb-0.5 flex items-center justify-between text-[10px]">
                                  <span className="text-muted-foreground">{row.label}</span>
                                  <span
                                    className={cn(
                                      "font-mono",
                                      better ? "text-emerald-400" : "text-foreground"
                                    )}
                                  >
                                    {typeof val === "number" ? Math.round(val) : "—"}
                                  </span>
                                </div>
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      better ? "bg-emerald-400" : "bg-primary/60"
                                    )}
                                    style={{ width: `${val ?? 0}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border/30 bg-background/40 px-1.5 py-1">
      <div className="text-muted-foreground/60">{label}</div>
      <div className="font-mono text-foreground">{value}</div>
    </div>
  );
}

function Bar({ label, v }: { label: string; v: number }) {
  const color =
    v >= 80 ? "bg-emerald-400" : v >= 60 ? "bg-amber-400" : v >= 40 ? "bg-orange-400" : "bg-rose-400";
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{Math.round(v)}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/10">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function DetailBlock({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/30 p-3">
      <h4 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-foreground">{v}</span>
    </div>
  );
}
