"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel, SectionHeader } from "./command-view";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ScrollText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Lock,
  KeyRound,
  FileKey,
  Eye,
  Scale,
  Info,
  RefreshCw,
  BrainCircuit,
  ExternalLink,
  Star,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useNexus } from "./store";
import {
  HARD_BLOCKLIST,
  POLICY_CATEGORIES,
  LEGAL_DISCLAIMER,
  EU_COMPLIANCE_NOTES,
  DEFAULT_POLICY,
  type ActivePolicy,
  type PolicyCategory,
} from "@/lib/policy";
import {
  BRAIN_MODELS,
  getBrain,
  DEFAULT_BRAIN_ID,
  type BrainModel,
} from "@/lib/brain";

// We fetch generations + safety scans via the gallery endpoint and join client-side
interface GenItem {
  id: string;
  prompt: string;
  style: string;
  aspect: string;
  wardrobe: string | null;
  status: string;
  verdict: string | null;
  overallScore: number | null;
  imagePath: string | null;
  createdAt: string;
}

interface DetailData {
  id: string;
  safety: {
    passed: boolean;
    score: number;
    riskLevel: string;
    flags: string[];
    rationale: string;
    stageMs: number;
  } | null;
}

function useComplianceRows() {
  return useQuery({
    queryKey: ["nexus-compliance"],
    queryFn: async () => {
      const [genRes, auditRes] = await Promise.all([
        fetch("/api/gallery?limit=100", { cache: "no-store" }),
        fetch("/api/audit?limit=80", { cache: "no-store" }),
      ]);
      const gen = (await genRes.json()) as { items: GenItem[] };
      const audit = (await auditRes.json()) as {
        items: {
          id: string;
          kind: string;
          message: string;
          severity: string;
          generationId: string | null;
          createdAt: string;
        }[];
      };

      // fetch safety detail for each generation
      const details = await Promise.all(
        gen.items.map(async (g) => {
          try {
            const r = await fetch(`/api/gallery/${g.id}`, { cache: "no-store" });
            if (!r.ok) return null;
            const d = (await r.json()) as DetailData;
            return { id: g.id, safety: d.safety, prompt: g.prompt, createdAt: g.createdAt };
          } catch {
            return null;
          }
        })
      );

      return {
        generations: gen.items,
        safetyRows: details.filter((d): d is NonNullable<typeof d> => d !== null),
        audit: audit.items,
      };
    },
    refetchInterval: 30000,
  });
}

// ---------------------------------------------------------------------------
// Policy & Legal section — NSFW/mature controls, content filters, EU compliance
// ---------------------------------------------------------------------------

function usePolicyUpdater() {
  const setPolicy = useNexus((s) => s.setPolicy);
  return useCallback(
    async (patch: Partial<ActivePolicy>) => {
      try {
        const res = await fetch("/api/policy", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error("Failed to update policy");
        const updated = (await res.json()) as ActivePolicy;
        setPolicy(updated);
        return updated;
      } catch (e) {
        toast.error("Policy update failed", {
          description: e instanceof Error ? e.message : "Unknown error",
        });
        return null;
      }
    },
    [setPolicy],
  );
}

function ConsentBadge({ status }: { status: string | null }) {
  if (status === "accepted") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
        <CheckCircle2 className="h-2.5 w-2.5" /> accepted
      </span>
    );
  }
  if (status === "rejected" || status === "revoked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-rose-300">
        <XCircle className="h-2.5 w-2.5" /> {status}
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-300">
        <AlertTriangle className="h-2.5 w-2.5" /> pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-zinc-500/40 bg-zinc-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-300">
      <Lock className="h-2.5 w-2.5" /> not shown
    </span>
  );
}

function SeverityBadge({ severity }: { severity: PolicyCategory["severity"] }) {
  const cls =
    severity === "critical"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
      : severity === "high"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
        : severity === "medium"
          ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
          : "border-zinc-500/40 bg-zinc-500/10 text-zinc-300";
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider",
        cls,
      )}
    >
      {severity}
    </span>
  );
}

function PolicyLegalSection() {
  const policyFromStore = useNexus((s) => s.policy);
  const consentStatus = useNexus((s) => s.consentStatus);
  const putPolicy = usePolicyUpdater();
  const [matureDialogOpen, setMatureDialogOpen] = useState(false);

  const policy = policyFromStore ?? DEFAULT_POLICY;
  const consentAccepted = consentStatus === "accepted";

  const handleMatureToggle = (next: boolean) => {
    if (next) {
      if (!consentAccepted) {
        toast.error("18+ consent required", {
          description:
            "Accept the 18+ entry notice first to unlock mature content.",
        });
        return;
      }
      setMatureDialogOpen(true);
    } else {
      void putPolicy({ matureEnabled: false });
      toast("Mature content disabled");
    }
  };

  const confirmMatureEnable = async () => {
    setMatureDialogOpen(false);
    const updated = await putPolicy({ matureEnabled: true });
    if (updated) {
      toast.success("Mature content enabled", {
        description:
          "Mature LoRAs are now visible. Hard blocklist still enforced.",
      });
    }
  };

  const getDisposition = (catId: string): "block" | "flag" | "allow" => {
    if (policy.blockCategories.includes(catId)) return "block";
    if (policy.flagCategories.includes(catId)) return "flag";
    return "allow";
  };

  const handleDispositionChange = (
    catId: string,
    disposition: "block" | "flag" | "allow",
    severity: PolicyCategory["severity"],
  ) => {
    if (disposition === "allow" && severity === "critical") {
      toast.error("Cannot allow critical-severity categories");
      return;
    }
    let blockCategories = policy.blockCategories.filter((c) => c !== catId);
    let flagCategories = policy.flagCategories.filter((c) => c !== catId);
    if (disposition === "block") blockCategories = [...blockCategories, catId];
    else if (disposition === "flag") flagCategories = [...flagCategories, catId];
    void putPolicy({ blockCategories, flagCategories });
  };

  return (
    <>
      {/* Section A + B */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* Section A — Mature Content Controls */}
        <Panel
          title="Mature Content (18+)"
          icon={<ShieldAlert className="h-4 w-4" />}
        >
          <div className="space-y-4">
            {/* Consent status badge */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                Consent status
              </span>
              <ConsentBadge status={consentStatus} />
            </div>

            {/* Mature switch */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/30 p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">Enable mature generation</div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Unlocks 18+ LoRAs + mature output tier. Hard blocklist always
                  applies.
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Switch
                      checked={policy.matureEnabled}
                      onCheckedChange={handleMatureToggle}
                      disabled={!consentAccepted}
                      aria-label="Toggle mature content"
                    />
                  </span>
                </TooltipTrigger>
                {!consentAccepted ? (
                  <TooltipContent>Accept the 18+ entry notice first.</TooltipContent>
                ) : null}
              </Tooltip>
            </div>

            {/* Re-show notice button */}
            <button
              onClick={() => window.location.reload()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Re-show 18+ notice (reload)
            </button>

            {/* Hard blocklist reminder */}
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-rose-300">
                <Lock className="h-3 w-3" /> Hard blocklist always enforced
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                CSAM, nonconsensual imagery, real-person likeness abuse, extreme
                violence, hate symbols, self-harm. Cannot be disabled.
              </p>
            </div>

            {/* AlertDialog for mature enable confirmation */}
            <AlertDialog
              open={matureDialogOpen}
              onOpenChange={setMatureDialogOpen}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-rose-400" />
                    Enable mature (18+) content?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2 text-left">
                    <span className="block">
                      This will unlock mature LoRAs and enable the mature generation
                      tier. You are solely responsible for all generated content.
                    </span>
                    <span className="block font-medium text-rose-300">
                      The hard blocklist remains enforced and cannot be disabled:
                      CSAM/minors, nonconsensual imagery, real-person likeness abuse,
                      extreme violence, hate symbols, self-harm, bestiality,
                      terrorism.
                    </span>
                    <span className="block">
                      Confirm only if you are 18+ and legally permitted in your
                      jurisdiction.
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={confirmMatureEnable}
                    className="bg-rose-600 text-white hover:bg-rose-700"
                  >
                    Confirm &amp; Enable
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Panel>

        {/* Section B — Content Filters */}
        <Panel title="Content Filters" icon={<ShieldX className="h-4 w-4" />}>
          <div className="space-y-4">
            {/* Hard blocklist chips */}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-rose-300">
                <Lock className="h-3 w-3" /> Hard Blocklist (always enforced,
                cannot be disabled)
              </div>
              <div className="flex flex-wrap gap-1.5">
                {HARD_BLOCKLIST.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[9px] text-rose-300"
                  >
                    <Lock className="h-2.5 w-2.5" /> {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Tunable categories */}
            <div>
              <div className="mb-2 text-[11px] font-semibold text-muted-foreground">
                Tunable Categories
              </div>
              <div className="nexus-scroll max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                {POLICY_CATEGORIES.map((cat) => {
                  const disposition = getDisposition(cat.id);
                  return (
                    <div
                      key={cat.id}
                      className="flex flex-col gap-2 rounded-lg border border-border/30 bg-background/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{cat.label}</span>
                          <SeverityBadge severity={cat.severity} />
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {cat.description}
                        </p>
                      </div>
                      <ToggleGroup
                        type="single"
                        value={disposition}
                        onValueChange={(val) => {
                          if (
                            val === "block" ||
                            val === "flag" ||
                            val === "allow"
                          ) {
                            handleDispositionChange(cat.id, val, cat.severity);
                          }
                        }}
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                      >
                        <ToggleGroupItem value="block" className="text-[10px]">
                          Block
                        </ToggleGroupItem>
                        <ToggleGroupItem value="flag" className="text-[10px]">
                          Flag
                        </ToggleGroupItem>
                        <ToggleGroupItem
                          value="allow"
                          className="text-[10px]"
                          disabled={cat.severity === "critical"}
                        >
                          Allow
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Min safety score slider + Policy mode select */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border/30 bg-background/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Min safety score
                  </span>
                  <span className="font-mono text-sm font-bold text-primary">
                    {policy.minSafetyScore}
                  </span>
                </div>
                <Slider
                  value={[policy.minSafetyScore]}
                  min={0}
                  max={100}
                  step={5}
                  onValueCommit={(vals) => {
                    if (vals[0] !== undefined) {
                      void putPolicy({ minSafetyScore: vals[0] });
                    }
                  }}
                />
                <p className="mt-1.5 text-[9px] text-muted-foreground">
                  Generations scoring below this are blocked. PUT on release.
                </p>
              </div>

              <div className="rounded-lg border border-border/30 bg-background/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Policy mode
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="text-muted-foreground hover:text-primary"
                        aria-label="Policy mode info"
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <div className="space-y-1 text-left">
                        <div>
                          <b>Conservative:</b> Block by default, flag ambiguous.
                        </div>
                        <div>
                          <b>Permissive:</b> Allow by default, flag only high-risk.
                        </div>
                        <div>
                          <b>Strict:</b> Block all tunable categories.
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select
                  value={policy.policyMode}
                  onValueChange={(val) =>
                    void putPolicy({
                      policyMode: val as ActivePolicy["policyMode"],
                    })
                  }
                >
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="conservative">Conservative</SelectItem>
                    <SelectItem value="permissive">Permissive</SelectItem>
                    <SelectItem value="strict">Strict</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[9px] text-muted-foreground">
                  Informational preset; overrides are applied above.
                </p>
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Section C — Legal & EU Compliance */}
      <Panel title="Legal & EU Compliance" icon={<Scale className="h-4 w-4" />}>
        <div className="space-y-4">
          {/* Legal disclaimer callout */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Scale className="h-4 w-4 text-amber-300" />
              <h4 className="text-sm font-semibold text-amber-300">
                Legal Disclaimer
              </h4>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {LEGAL_DISCLAIMER}
            </p>
          </div>

          {/* EU compliance notes grid */}
          <div className="grid gap-3 sm:grid-cols-2">
            {EU_COMPLIANCE_NOTES.map((note) => (
              <div
                key={note.title}
                className="rounded-lg border border-border/40 bg-background/30 p-3"
              >
                <h5 className="mb-1 text-[12px] font-semibold text-foreground">
                  {note.title}
                </h5>
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  {note.body}
                </p>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div className="rounded-lg border border-border/40 bg-background/20 p-3 text-center">
            <p className="font-mono text-[10px] text-muted-foreground">
              Policy version:{" "}
              <span className="text-primary">{policy.policyVersion}</span> ·
              Jurisdiction:{" "}
              <span className="text-foreground">{policy.jurisdiction}</span>
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              The platform provides tooling and governance only; end users bear
              full responsibility for generated content.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Brain Configuration — selects the uncensored Gemma 4 12B variant
// that powers ST3GG safety scan, the visual judge, and the Nemotron evidence
// parser. The brain ANALYZES content (including mature) — it does not generate
// mature content itself.
// ---------------------------------------------------------------------------

function BrainConfigSection() {
  const brainId = useNexus((s) => s.brainId);
  const setBrain = useNexus((s) => s.setBrain);
  const activeBrain = getBrain(brainId);
  const isDefault = activeBrain.id === DEFAULT_BRAIN_ID;

  return (
    <Panel
      title="Pipeline Brain"
      icon={<BrainCircuit className="h-4 w-4" />}
      action={
        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 font-mono text-[10px] text-emerald-300">
          <BrainCircuit className="h-3 w-3" />
          <span className="uppercase tracking-wider opacity-70">Active</span>
          <span className="font-semibold">{activeBrain.shortName}</span>
        </span>
      }
    >
      <div className="space-y-4">
        {/* Active brain summary */}
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Active brain
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-foreground">
                {activeBrain.name}
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {activeBrain.shortName} · {activeBrain.params} · ctx{" "}
                {activeBrain.contextWindow} · {activeBrain.quantization}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {activeBrain.uncensored ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-300">
                  <ShieldAlert className="h-2.5 w-2.5" /> Uncensored
                </span>
              ) : null}
              {activeBrain.recommended ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
                  <Star className="h-2.5 w-2.5 fill-emerald-400 text-emerald-400" />{" "}
                  Recommended
                </span>
              ) : null}
            </div>
          </div>
          <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
            {activeBrain.specialty}
          </p>
        </div>

        {/* Brain grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {BRAIN_MODELS.map((brain) => (
            <BrainCard
              key={brain.id}
              brain={brain}
              active={brain.id === brainId}
              onSelect={() => {
                if (brain.id === brainId) return;
                setBrain(brain.id);
                toast.success(`Brain switched: ${brain.shortName}`, {
                  description: brain.uncensored
                    ? "Uncensored — will analyze mature content without refusal."
                    : "Censored variant — may refuse mature analysis.",
                });
              }}
            />
          ))}
        </div>

        {/* Info callout — how the brain is used */}
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300">
            <Info className="h-3 w-3" /> How the brain is used
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            The brain powers the ST3GG safety scan, the visual judge, and the
            Nemotron evidence parser. An uncensored Gemma 4 12B (fable5
            abliterated) is recommended so the brain can ANALYZE mature visual
            content for safety verdicts instead of refusing. The brain does not
            generate mature content — it evaluates it.
          </p>
        </div>

        {/* Sandbox / Modal provenance note */}
        <div className="rounded-lg border border-border/40 bg-background/20 p-3">
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            <span className="font-mono text-amber-300">sandbox note:</span> When
            self-hosted on Modal (vLLM/sglang), these configs map 1:1 to the HF
            repo. In this sandbox, LLM calls route via z-ai-web-dev-sdk; the
            brain config tunes the prompts + records provenance.
            {isDefault ? (
              <span className="ml-1 font-mono text-emerald-300">
                · default brain in use
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </Panel>
  );
}

function BrainCard({
  brain,
  active,
  onSelect,
}: {
  brain: BrainModel;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-lg border p-3 transition",
        active
          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40"
          : "border-border/40 bg-background/30 hover:border-primary/30",
      )}
    >
      {active ? (
        <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-300">
          <CheckCircle2 className="h-2.5 w-2.5" /> Active
        </span>
      ) : null}

      {/* Header */}
      <div className="mb-1.5 pr-14">
        <h4 className="truncate text-sm font-bold text-foreground">
          {brain.name}
        </h4>
        <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
          {brain.shortName}
        </div>
      </div>

      {/* Specialty */}
      <p className="mb-2 line-clamp-1 text-[10px] text-muted-foreground">
        {brain.specialty}
      </p>

      {/* Spec badges */}
      <div className="mb-2 flex flex-wrap gap-1">
        <span className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
          {brain.params}
        </span>
        <span className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
          ctx {brain.contextWindow}
        </span>
        <span className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
          {brain.quantization}
        </span>
        <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-cyan-300">
          {brain.reasoning}
        </span>
      </div>

      {/* Uncensored + Recommended badges */}
      <div className="mb-2 flex flex-wrap gap-1">
        {brain.uncensored ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-amber-300">
                <ShieldAlert className="h-2.5 w-2.5" /> Uncensored
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Analyzes mature content without refusal.
            </TooltipContent>
          </Tooltip>
        ) : null}
        {brain.recommended ? (
          <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-300">
            <Star className="h-2.5 w-2.5 fill-emerald-400 text-emerald-400" />{" "}
            Recommended
          </span>
        ) : null}
      </div>

      {/* Roles */}
      <div className="mb-3 flex flex-wrap gap-1">
        {brain.roles.map((role) => (
          <span
            key={role}
            className="rounded border border-border/40 bg-background/40 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-muted-foreground"
          >
            {role}
          </span>
        ))}
      </div>

      {/* Footer: HF link + Use button */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <a
          href={brain.hfUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground transition hover:text-primary"
          aria-label={`Open ${brain.name} on HuggingFace (new tab)`}
        >
          <ExternalLink className="h-3 w-3" /> HF repo
        </a>
        <button
          onClick={onSelect}
          disabled={active}
          aria-pressed={active}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition",
            active
              ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-300"
              : "border border-border/60 text-foreground hover:border-primary/40 hover:bg-primary/5",
          )}
        >
          {active ? (
            <>
              <CheckCircle2 className="h-3 w-3" /> In use
            </>
          ) : (
            "Use this brain"
          )}
        </button>
      </div>
    </div>
  );
}

export function ComplianceView() {
  const { data, isLoading } = useComplianceRows();

  const rows = data?.safetyRows ?? [];
  const total = rows.length;
  const passed = rows.filter((r) => r.safety?.passed).length;
  const flagged = rows.filter((r) => r.safety && !r.safety.passed).length;
  const critical = rows.filter((r) => r.safety?.riskLevel === "critical").length;
  const avgScore =
    rows.length > 0
      ? rows.reduce((a, r) => a + (r.safety?.score ?? 0), 0) / rows.length
      : 0;

  const riskCounts = {
    safe: rows.filter((r) => r.safety?.riskLevel === "safe").length,
    low: rows.filter((r) => r.safety?.riskLevel === "low").length,
    medium: rows.filter((r) => r.safety?.riskLevel === "medium").length,
    high: rows.filter((r) => r.safety?.riskLevel === "high").length,
    critical: rows.filter((r) => r.safety?.riskLevel === "critical").length,
  };

  return (
    <div className="space-y-5 nexus-rise">
      <SectionHeader
        eyebrow="Compliance"
        title="Safety & Governance Ledger"
        desc="ST3GG security scan results, audit trail and governance posture across all pipeline runs."
        right={
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 font-mono text-[10px] text-emerald-300">
            <Lock className="h-3 w-3" /> Vault Encrypted
          </span>
        }
      />

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        <Kpi icon={ShieldCheck} label="Total Scans" value={String(total)} tone="neutral" />
        <Kpi icon={CheckCircle2} label="Passed" value={String(passed)} tone="ok" />
        <Kpi icon={ShieldAlert} label="Flagged" value={String(flagged)} tone="warn" />
        <Kpi icon={ShieldX} label="Critical" value={String(critical)} tone="bad" />
        <Kpi
          icon={Eye}
          label="Avg Safety"
          value={avgScore > 0 ? avgScore.toFixed(1) : "—"}
          tone="ok"
        />
      </section>

      {/* Policy & Legal controls */}
      <PolicyLegalSection />

      {/* Pipeline brain configuration */}
      <BrainConfigSection />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        {/* Safety scans table */}
        <Panel title="Safety Scan Ledger" icon={<ShieldCheck className="h-4 w-4" />}>
          {isLoading ? (
            <div className="grid place-items-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No safety scans recorded yet.
            </div>
          ) : (
            <div className="nexus-scroll max-h-[460px] overflow-y-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-card/95 backdrop-blur">
                  <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Prompt</th>
                    <th className="px-2 py-2 font-medium">Risk</th>
                    <th className="px-2 py-2 text-right font-medium">Score</th>
                    <th className="px-2 py-2 font-medium">Flags</th>
                    <th className="px-2 py-2 text-right font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const s = r.safety;
                    if (!s) {
                      return (
                        <tr key={r.id} className="border-t border-border/30">
                          <td className="max-w-[220px] truncate px-2 py-2 text-muted-foreground">{r.prompt}</td>
                          <td className="px-2 py-2 text-muted-foreground">—</td>
                          <td className="px-2 py-2 text-right font-mono text-muted-foreground">—</td>
                          <td className="px-2 py-2 text-muted-foreground">no scan</td>
                          <td className="px-2 py-2 text-muted-foreground">—</td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={r.id} className="border-t border-border/30 hover:bg-foreground/5">
                        <td className="max-w-[220px] truncate px-2 py-2 text-foreground">
                          {r.prompt}
                        </td>
                        <td className="px-2 py-2">
                          <RiskBadge level={s.riskLevel} />
                        </td>
                        <td className="px-2 py-2 text-right font-mono">
                          {Math.round(s.score)}
                        </td>
                        <td className="px-2 py-2">
                          {s.flags.length > 0 ? (
                            <div className="flex flex-wrap gap-0.5">
                              {s.flags.slice(0, 2).map((f) => (
                                <span
                                  key={f}
                                  className="rounded border border-amber-500/30 bg-amber-500/10 px-1 py-0.5 font-mono text-[8px] text-amber-300"
                                >
                                  {f}
                                </span>
                              ))}
                              {s.flags.length > 2 ? (
                                <span className="text-[9px] text-muted-foreground">
                                  +{s.flags.length - 2}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-[9px] text-muted-foreground">
                          {new Date(r.createdAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          {/* Risk distribution */}
          <Panel title="Risk Distribution" icon={<AlertTriangle className="h-4 w-4" />}>
            <div className="space-y-2">
              <DistRow label="Safe" count={riskCounts.safe} total={total} color="bg-emerald-400" />
              <DistRow label="Low" count={riskCounts.low} total={total} color="bg-cyan-400" />
              <DistRow label="Medium" count={riskCounts.medium} total={total} color="bg-amber-400" />
              <DistRow label="High" count={riskCounts.high} total={total} color="bg-orange-400" />
              <DistRow label="Critical" count={riskCounts.critical} total={total} color="bg-rose-400" />
            </div>
          </Panel>

          {/* Governance posture */}
          <Panel title="Governance Posture" icon={<KeyRound className="h-4 w-4" />}>
            <div className="space-y-1.5">
              <PostureRow icon={Lock} label="Secrets Vault" value="Encrypted" ok />
              <PostureRow icon={FileKey} label="MCP Validation" value="Active" ok />
              <PostureRow icon={KeyRound} label="OAuth (PKCE)" value="Configured" ok />
              <PostureRow icon={ShieldCheck} label="Claim Verification" value="640+ tests" ok />
              <PostureRow icon={ScrollText} label="Audit Trail" value="Append-only" ok />
              <PostureRow icon={AlertTriangle} label="Bridge Degradation" value="Missing" ok={false} />
            </div>
          </Panel>
        </div>
      </div>

      {/* Audit log */}
      <Panel title="Audit Trail" icon={<ScrollText className="h-4 w-4" />}>
        {isLoading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
        ) : (data?.audit.length ?? 0) === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No audit events yet.
          </div>
        ) : (
          <div className="nexus-scroll max-h-72 overflow-y-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-card/95 backdrop-blur">
                <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-2 py-2 font-medium">Severity</th>
                  <th className="px-2 py-2 font-medium">Kind</th>
                  <th className="px-2 py-2 font-medium">Message</th>
                  <th className="px-2 py-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {data?.audit.map((e) => (
                  <tr key={e.id} className="border-t border-border/30">
                    <td className="px-2 py-1.5">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 font-mono text-[8px] uppercase",
                          e.severity === "success"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : e.severity === "warn"
                              ? "bg-amber-500/15 text-amber-300"
                              : e.severity === "error"
                                ? "bg-rose-500/15 text-rose-300"
                                : "bg-cyan-500/15 text-cyan-300"
                        )}
                      >
                        {e.severity}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                      {e.kind}
                    </td>
                    <td className="max-w-[420px] truncate px-2 py-1.5 text-foreground">
                      {e.message}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono text-[9px] text-muted-foreground">
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  tone: "ok" | "warn" | "bad" | "neutral";
}) {
  const toneCls =
    tone === "ok"
      ? "border-emerald-500/20 text-emerald-300"
      : tone === "warn"
        ? "border-amber-500/20 text-amber-300"
        : tone === "bad"
          ? "border-rose-500/20 text-rose-300"
          : "border-border/60 text-foreground";
  return (
    <div className={cn("rounded-xl border bg-card/40 p-3.5", toneCls)}>
      <div className="mb-2 flex items-center justify-between">
        <Icon className="h-4 w-4 opacity-80" />
        <span className="text-[9px] uppercase tracking-wider opacity-60">{label}</span>
      </div>
      <div className="font-mono text-2xl font-bold leading-none">{value}</div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    safe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    low: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
    medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    high: "border-orange-500/40 bg-orange-500/10 text-orange-300",
    critical: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  };
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
        map[level] ?? "border-zinc-500/40 bg-zinc-500/10 text-zinc-300"
      )}
    >
      {level}
    </span>
  );
}

function DistRow({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{count}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PostureRow({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: typeof Lock;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border/30 bg-background/30 px-2 py-1.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="flex-1 text-[11px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[10px] text-foreground">{value}</span>
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-rose-400" />
      )}
    </div>
  );
}
