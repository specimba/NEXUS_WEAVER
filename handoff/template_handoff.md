# Agent Handoff Template

> Copy this file, fill in the blanks, and share with the next agent.

## Handoff ID: handoff-YYYY-MM-DD-XXX

**From Agent**: [your name/ID]
**To Agent**: [next agent name/ID]
**Timestamp**: [ISO 8601]
**Git Tag**: [latest tag, e.g., v5.37]

---

## What I Changed

[List every file you modified and why]

- `src/lib/pipeline.ts` — [what changed and why]
- `modal-apps/nexus_flux2_klein9b.py` — [what changed and why]
- ...

## What's Working

- [Feature 1] — [how to test it]
- [Feature 2] — [how to test it]

## What's Broken

- [Feature 1] — [error message] — [suspected cause]
- ...

## What's Untested

- [Feature 1] — [why it wasn't tested]
- ...

## Next Steps

### P0 (Do First)
1. [Task] — [why] — [estimated effort]

### P1 (Do This Week)
1. [Task] — [why] — [estimated effort]

### P2 (Future)
1. [Task] — [why] — [estimated effort]

## Blockers

- [Blocker] — [workaround if any]

## Warnings

- [Warning 1] — [what happens if ignored]
- [Warning 2] — [what happens if ignored]

## Credits

- Modal credits remaining: $[amount]
- Workspace budget used: [X]%

## Modal App States

| App | State | GPU |
|-----|-------|-----|
| nexus-flux2-klein9b | deployed/stopped | L40S |
| nexus-wan22-i2v | deployed/stopped | H100 |
| ... | ... | ... |

## Managed Endpoints

| Endpoint | Status | Model |
|----------|--------|-------|
| qwen3-5-9b-unredacted-max | live/inactive | Qwen 9B |
| gemma-4-31b-it-uncensored-heretic | live/inactive | Gemma 31B |
| brisk-evolution-4b-v0-1 | live/inactive | Brisk 4B |

## Key Decisions Made

- [Decision 1] — [rationale]
- [Decision 2] — [rationale]
