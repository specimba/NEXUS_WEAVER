# Handoff Checklist

## Pre-Handoff (Before transferring to a new agent)

- [ ] All changes committed to git: `git add -A && git commit -m "..." && git push`
- [ ] `worklog.md` updated with latest work entry
- [ ] Dev server status noted (running/stopped)
- [ ] Modal app states noted (which are deployed/stopped)
- [ ] `.env` file exists and has correct tokens
- [ ] `HANDOFF.md` is current (update if architecture changed)
- [ ] `AGENTS.md` is current (update if rules changed)
- [ ] Any broken features documented in `current_status.broken`
- [ ] Any untested features documented in `current_status.untested`
- [ ] Git tag created for major versions: `git tag -a v5.X -m "..."`

## Post-Handoff (When receiving from another agent)

- [ ] Read `AGENTS.md` completely
- [ ] Read `HANDOFF.md` (at least sections 1-3 and 10)
- [ ] Read last 3 entries in `worklog.md`
- [ ] Check `.env` exists and has tokens
- [ ] Run `bun run db:push` (ensure database is created)
- [ ] Start dev server: `bun run dev`
- [ ] Verify dev server responds: `curl -sS -o /dev/null -w "%{http_code}" http://localhost:3000/`
- [ ] Check Modal CLI: `modal profile current`
- [ ] Verify FLUX.2 is deployed: `modal app list | grep flux2`
- [ ] Open page in Agent Browser and check for console errors
- [ ] Run a test pipeline generation to verify end-to-end

## Verification Commands

```bash
# Check TypeScript
bunx tsc --noEmit 2>&1 | grep -v "examples/\|skills/\|brain-client.ts"

# Check lint
bun run lint

# Check dev server
curl -sS -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/

# Check Modal apps
modal app list

# Check endpoint warm-up
curl -sS http://localhost:3000/api/modal/warm-endpoints | python3 -m json.tool

# Check prompt enhancer
curl -sS -X POST http://localhost:3000/api/prompt/enhance \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a red apple"}' | python3 -m json.tool
```
