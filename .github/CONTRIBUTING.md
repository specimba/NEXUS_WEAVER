# Contributing to NEXUS Visual Weaver

## For Human Contributors

### Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/NEXUS_WEAVER.git`
3. Install dependencies: `bun install`
4. Copy `.env.example` to `.env` and fill in your tokens
5. Create the database: `bun run db:push`
6. Start dev server: `bun run dev`

### Development Workflow

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Make changes following the code style
3. Test: `bunx tsc --noEmit && bun run lint`
4. Test in browser (preview panel)
5. Commit with conventional commits:
   ```
   feat: add new feature
   fix: fix a bug
   docs: update documentation
   refactor: restructure code
   ```
6. Push and create a PR

### Code Style

- TypeScript throughout with strict typing
- shadcn/ui components preferred over custom implementations
- Use `'use client'` and `'use server'` directives
- Prisma for all database access
- No hardcoded secrets (use `secrets.ts` which reads from env)

## For AI Agent Contributors

### Onboarding

1. Read `AGENTS.md` — critical rules and quick context
2. Read `HANDOFF.md` — comprehensive project documentation
3. Read `worklog.md` (last 3 entries) — what previous agents did
4. Run `scripts/handoff-import.sh` if a handoff tarball was provided
5. Verify the system is running (see `handoff/checklist.md`)

### Agent Rules

1. **NEVER use z-ai SDK as fallback** for brain stages — causes 429 rate limits
2. **NEVER commit `.env`** — it contains real tokens
3. **NEVER deploy H100 apps** without explicit instruction — expensive
4. **NEVER increase FLUX.2 steps above 4** — degrades quality
5. **NEVER increase LoRA weights above 0.5** when stacking — causes homogeneous images
6. **ALWAYS append to `worklog.md`** after completing work
7. **ALWAYS test with Agent Browser** before claiming something works
8. **ALWAYS use `handoff/template_handoff.md`** when transferring to another agent

### Making Changes

- Make all changes in ONE batch (the Z.ai platform redeploys on every file change)
- Test after changes stabilize
- Commit with clear messages explaining what and why
- Push to GitHub for persistence

### Reporting Issues

Use the issue templates in `.github/ISSUE_TEMPLATE/`:
- Bug report: for confirmed bugs
- Feature request: for new features
- Agent task: for AI agent work items
