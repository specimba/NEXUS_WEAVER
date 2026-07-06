"use client";

import { useEffect, useState } from "react";
import { useNexus } from "./store";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  Check,
  X,
  Lock,
  Scale,
  EyeOff,
  Loader2,
  AlertOctagon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MATURE_ACK_TEXT, LEGAL_DISCLAIMER } from "@/lib/policy";

type Phase = "loading" | "prompt" | "accepting" | "done";

/**
 * NSFW 18+ consent gate.
 *
 * Renders a full-screen modal on first load (when consentStatus is null and
 * the user has not yet dismissed the mature-content intro). The user must
 * explicitly Accept or Reject. The decision is POSTed to /api/consent and
 * recorded with an anonymous device fingerprint.
 *
 * Conservative default: mature content stays OFF until the user accepts AND
 * enables mature mode in Compliance → Policy. Accepting here only records the
 * 18+ declaration; it does not auto-enable mature generation.
 */
export function ConsentGate() {
  const fingerprint = useNexus((s) => s.fingerprint);
  const consentStatus = useNexus((s) => s.consentStatus);
  const setConsent = useNexus((s) => s.setConsent);
  const [phase, setPhase] = useState<Phase>("loading");
  const [checked, setChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // On mount, fetch existing consent for this fingerprint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint, action: "check" }),
        });
        if (!res.ok) throw new Error("consent-check");
        const data = await res.json();
        if (cancelled) return;
        if (data.status && data.status !== "pending") {
          setConsent(data.status, data.tier ?? "safe");
          setPhase("done");
        } else {
          setPhase("prompt");
        }
      } catch {
        if (!cancelled) setPhase("prompt");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fingerprint, setConsent]);

  async function submit(action: "accept" | "reject") {
    if (action === "accept" && !checked) return;
    setPhase("accepting");
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint, action }),
      });
      if (!res.ok) throw new Error("consent-submit");
      const data = await res.json();
      setConsent(data.status, data.tier ?? "safe");
      setPhase("done");
      setDismissed(true);
    } catch {
      setPhase("prompt");
    }
  }

  // Don't render once a decision is recorded (and the intro dismissed).
  if (phase === "done" || dismissed) return null;
  // Only show the gate if consent is unknown.
  if (consentStatus !== null) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
      >
        <motion.div
          className="nexus-card nexus-glow-strong relative w-full max-w-2xl overflow-hidden rounded-2xl"
          initial={{ scale: 0.96, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
        >
          {/* Top accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-amber-500/60 via-rose-500/50 to-amber-500/60" />

          {/* Header */}
          <div className="flex items-start gap-4 border-b border-border/50 p-6">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-400 nexus-glow">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2
                id="consent-title"
                className="font-mono text-lg font-bold tracking-tight text-foreground"
              >
                NSFW · 18+ Content Notice
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This studio can generate adult-oriented imagery. Before you
                continue, you must review and acknowledge the entry policy.
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[50vh] overflow-y-auto nexus-scroll p-6">
            {/* Acknowledgement checklist */}
            <div className="space-y-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">
                <Scale className="h-3.5 w-3.5" /> Entry Policy Acknowledgement
              </div>
              {MATURE_ACK_TEXT.split(". ")
                .filter(Boolean)
                .map((line, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg border border-border/40 bg-background/40 p-3 text-[13px] leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-amber-500/15 font-mono text-[10px] font-bold text-amber-300">
                      {i + 1}
                    </span>
                    <span>{line.trim()}.</span>
                  </div>
                ))}
            </div>

            {/* Hard blocklist callout */}
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
              <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <div className="text-[12px] leading-relaxed text-rose-200/90">
                <span className="font-semibold text-rose-300">
                  Always-blocked content:{" "}
                </span>
                CSAM / minors, nonconsensual intimate imagery, real-person
                likeness abuse, extreme violence, hate symbols, self-harm, and
                terrorism. These cannot be disabled and attempts are logged.
              </div>
            </div>

            {/* Legal disclaimer */}
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-border/40 bg-background/40 p-3">
              <Scale className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {LEGAL_DISCLAIMER}
              </p>
            </div>

            {/* Checkbox */}
            <label
              className={cn(
                "mt-5 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition",
                checked
                  ? "border-emerald-500/50 bg-emerald-500/8"
                  : "border-border/50 bg-background/40 hover:border-border"
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-500"
              />
              <span className="text-[13px] leading-relaxed text-foreground">
                I have read and understood the entry policy. I am 18+ and accept
                full responsibility for any content I generate. I understand
                accepting here records my declaration but does{" "}
                <span className="font-semibold">not</span> auto-enable mature
                generation — that requires a separate toggle in Compliance →
                Policy.
              </span>
            </label>
          </div>

          {/* Footer actions */}
          <div className="flex flex-col gap-3 border-t border-border/50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              <span className="font-mono" suppressHydrationWarning>
                fp: {fingerprint ? `${fingerprint.slice(0, 14)}…` : "—"} · policy v3.0 · EU
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => submit("reject")}
                disabled={phase === "accepting"}
                className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
              >
                <X className="h-4 w-4" /> Reject
              </button>
              <button
                onClick={() => submit("accept")}
                disabled={!checked || phase === "accepting"}
                className="nexus-btn-primary inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                {phase === "accepting" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Accept &amp; Continue
              </button>
            </div>
          </div>

          {/* Safe-mode reassurance */}
          <div className="flex items-center justify-center gap-2 border-t border-border/40 bg-background/30 px-5 py-3 text-[10px] text-muted-foreground">
            <EyeOff className="h-3 w-3" />
            Safe mode is ON by default. Mature LoRAs stay hidden until you
            explicitly unlock them.
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
