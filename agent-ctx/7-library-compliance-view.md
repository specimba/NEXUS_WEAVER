# Task ID: 7 — LibraryView + ComplianceView

**Agent:** full-stack-developer (LibraryView + ComplianceView)
**Date:** 2026-06-30

## Task
Build `src/components/nexus/library-view.tsx` (new) and extend `src/components/nexus/compliance-view.tsx` with three new sections (Mature Policy Controls, Content Filters, Legal & EU Compliance).

## What was built

### PART 1 — library-view.tsx (NEW)
- Page header with stats row (total entries, visible count, mature count as locked pill when not unlocked).
- Search input filtering by name/tags/purpose/baseModel (case-insensitive, memoized).
- Category chip row: "All" + 9 LORA_CATEGORIES chips. Mature chip is amber/rose-bordered with a Lock icon and tooltip "Unlock in Compliance → Policy" when locked; clicking it shows a sonner toast.
- Responsive LoRA grid (1/2/3 cols). Each card: name, category badge, source badge (HF/Civitai/GitHub/arXiv with icons), baseModel (mono), 2-line clamped purpose, tag chips, recommendedWeight pill, external-link button (new tab, rel=noreferrer), Apply toggle (emerald when applied), rose "18+" ribbon for mature entries, license hint.
- Sticky bottom action bar (bottom-20 on mobile to clear fixed nav, bottom-6 on desktop) when loraIds.length > 0: shows count + applied IDs preview, Clear button, Open in Studio → button.
- Empty state with clear-filters button.
- Uses nexus-card, nexus-card-hover, nexus-card-glow, nexus-chip, nexus-chip-active, nexus-glow, nexus-rise, nexus-scroll classes.
- Framer Motion entrance animations on cards.
- Color system: emerald/teal primary, amber accent, rose for mature/danger. No indigo or blue.

### PART 2 — compliance-view.tsx (EXTENDED)
Added `PolicyLegalSection` component (inserted between KPIs and the existing safety-scan grid). Existing content untouched.

**Section A — Mature Content (18+) Panel:**
- Consent status badge (accepted/rejected/revoked/pending/not shown).
- Switch bound to `policy.matureEnabled`, disabled when consent not accepted (tooltip explains why).
- When toggled ON + consent accepted → AlertDialog with 3-point warning (unlocks mature, hard blocklist restated, 18+ jurisdiction confirmation). Confirm → PUT /api/policy {matureEnabled:true} + toast.
- When toggled OFF → PUT {matureEnabled:false} + toast.
- "Re-show 18+ notice (reload)" button (window.location.reload()).
- Hard blocklist reminder callout (rose).

**Section B — Content Filters Panel:**
- HARD_BLOCKLIST as read-only rose chips with Lock icons (heading: "always enforced, cannot be disabled").
- POLICY_CATEGORIES (9 rows) with severity badges + ToggleGroup (Block/Flag/Allow). Changing disposition updates blockCategories/flagCategories arrays and PUTs to /api/policy. Critical-severity categories cannot be set to Allow.
- Min safety score Slider (0-100, step 5, PUT onValueCommit).
- Policy mode Select (conservative/permissive/strict) with Info tooltip explaining each.
- Tunable categories list uses nexus-scroll + max-h-[60vh] overflow-y-auto.

**Section C — Legal & EU Compliance Panel:**
- LEGAL_DISCLAIMER in amber callout with Scale icon.
- EU_COMPLIANCE_NOTES (4 cards: EU AI Act Transparency, DSA, GDPR, Provenance & Audit Trail).
- Footer note with policy.policyVersion + policy.jurisdiction + responsibility statement.

## Helpers added
- `usePolicyUpdater()` — useCallback-wrapped PUT /api/policy that updates the store on success and shows error toast on failure.
- `ConsentBadge` — renders consent status with appropriate color/icon.
- `SeverityBadge` — renders policy category severity (critical/high/medium/low).

## API calls
All use relative `fetch("/api/policy", ...)` paths only. No new API routes created.

## Lint
`bun run lint` → 0 errors, 0 warnings in my files. (3 pre-existing warnings in gallery-view.tsx and studio-view.tsx — not mine.)

## Files touched
- NEW: `src/components/nexus/library-view.tsx`
- EXTENDED: `src/components/nexus/compliance-view.tsx` (imports + PolicyLegalSection + ConsentBadge + SeverityBadge + usePolicyUpdater; inserted `<PolicyLegalSection />` between KPIs and safety grid)
