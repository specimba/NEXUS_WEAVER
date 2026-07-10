---
name: Agent Task
about: Define a task for an AI agent to work on
title: "[AGENT TASK] "
labels: agent-task
assignees: ''
---

## Task Summary

One-line description of what the agent should accomplish.

## Context

Why this task is needed. Reference relevant worklog entries, GitHub issues, or user feedback.

## Scope

### What to do
- [ ] Specific action item 1
- [ ] Specific action item 2
- [ ] Specific action item 3

### What NOT to do
- Things the agent should avoid (e.g., "don't deploy H100 apps")

## Files to Modify

- `src/lib/...` — [what to change]
- `modal-apps/...` — [what to change]

## Success Criteria

How to verify the task is complete:
- [ ] TypeScript compiles without errors
- [ ] Lint passes
- [ ] Agent Browser shows no console errors
- [ ] Feature works end-to-end

## Constraints

- Modal credits remaining: $[amount]
- Don't deploy H100 apps unless explicitly stated
- Follow rules in AGENTS.md

## Handoff

After completing this task:
1. Commit and push to GitHub
2. Append to worklog.md
3. Fill out handoff/template_handoff.md
