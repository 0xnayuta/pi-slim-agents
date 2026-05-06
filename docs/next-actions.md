# Next Actions

Current task board for pi-slim-agents development.

## Now

These are the immediate priorities during dogfood / pre-publish stabilization:

### Verify D1-fix in devpiano

- [ ] Confirm no "require is not defined" errors on pi startup
- [ ] Verify `/agents status` shows correct agent counts
- [ ] Check that metadata (createdAt, lastModified, sizeBytes) loads correctly
- [ ] Run in devpiano: `cd G:/path/to/devpiano && pnpm dev`

### Continue devpiano dogfood

- [ ] Use two-step pattern with real development tasks
- [ ] Test `/agent explorer find X` + ask main agent to search
- [ ] Test direct search pattern as alternative
- [ ] Compare both patterns for quality/completeness

### Record dogfood feedback

- [ ] Document prompt quality issues
- [ ] Note runner behavior problems
- [ ] Flag UX clarity gaps
- [ ] Track which patterns work best

### Improve prompt-only UX if needed

- [ ] Review dogfood feedback for UX improvements
- [ ] Consider additional help text or examples
- [ ] Update docs/dogfood.md if patterns change

---

## Next

These are the next priorities after dogfood validates core functionality:

### Add R5 deferred tests

These tests were identified in R5 but deferred for post-0.1.0:

- [ ] **Unicode/Chinese input tests** — test agent behavior with non-ASCII task text
- [ ] **Repeated flag tests** — test `/agent --mode deep --mode quick` edge case
- [ ] **--flag-like text in task parsing** — document limitation (quote task text)
- [ ] **outputTemplate=false integration test** — verify plain output rendering
- [ ] **Concurrent history append tests** — test race conditions with persistent history

### Provider-call feasibility spike

- [ ] Monitor pi-mono ExtensionAPI releases for model calling support
- [ ] Test `@mariozechner/pi-ai` importability when pi-mono updates
- [ ] Update `/agents status` to reflect new availability
- [ ] Mark provider-call as "stable" when verified working

### Child-session runner feasibility spike

- [ ] Investigate pi-mono child session API (if available)
- [ ] Design independent model call architecture
- [ ] Test isolated specialist context
- [ ] Implement streaming results if API supports it

---

## Later

These are planned for future milestones:

### npm publish

- [ ] Resolve npm account auth issue (2FA/token)
- [ ] Update CHANGELOG.md with release date
- [ ] Update README.md status to "v0.1.0"
- [ ] Run `npm publish --access public`
- [ ] Verify on npmjs.com
- [ ] Create GitHub release with tag

### Token usage tracking

- [ ] Requires real provider-call integration
- [ ] Collect usage data from model responses
- [ ] Expose via `/agents metrics` or dedicated command
- [ ] Design privacy-safe output format

### Agent composition design

- [ ] Only if real need appears in dogfood
- [ ] Agent A can call agent B (dependency resolution)
- [ ] Design composition/pipeline patterns
- [ ] Document in design doc if implemented

---

## Deferred

These features are planned but not scheduled:

### Token usage tracking

**Status:** Deferred (requires real provider-call)

**Rationale:** Cannot track usage without model call integration.

### Streaming

**Status:** Deferred (not in scope for v0.1.0)

**Rationale:** Requires real provider-call integration.

### Scheduler / cron

**Status:** Deferred (not in scope for v0.1.0)

**Rationale:** pi-slim-agents is request-response, not persistent.

### Worktree isolation

**Status:** Deferred (not in scope for v0.1.0)

**Rationale:** Adds complexity without clear benefit for v0.1.0.

### MCP integration

**Status:** Deferred (not in scope for v0.1.0)

**Rationale:** MCP ecosystem not stabilized yet.

### Tag autocomplete in `/agent`

**Status:** Deferred (requires pi-mono completion API)

**Rationale:** Not critical for core functionality.

### README table of contents

**Status:** Deferred (nice to have)

**Rationale:** README is long but functional without TOC.

### docs/ navigation index

**Status:** Deferred (nice to have)

**Rationale:** Can be added post-release.

---

## Completed

These actions have been completed:

### R0-R7 audit

**Completed:** 2026-05-06

- R0: Package review
- R1: Extension integration
- R2: Agent/template loading/config
- R3: Command parsing/CLI UX
- R4: Runner/history/metrics/JSON
- R5: Tests/edge cases (minor gaps deferred)
- R6: Documentation/user experience
- R7: Final release readiness → Ready for 0.1.0

### D1-fix: ESM require is not defined

**Completed:** 2026-05-06

- Fixed `require('os').homedir()` in `src/metadata.ts`
- Changed to `os.homedir()` (already imported)
- Verified no require in dist/ output
- Added ESM compatibility tests

### D1-fix: Prompt-only UX clarification

**Completed:** 2026-05-06

- Added execution metadata (`executed`, `toolsExecuted`, `childSessionStarted`) to DelegationResult
- Added UX banner for prompt-only mode
- Updated help text with prompt-only warning
- Created docs/dogfood.md guide
- Updated README with current limitations section

---

## References

- [docs/project-state.md](project-state.md) — Current project state summary
- [docs/reviews/index.md](reviews/index.md) — Review round details
- [docs/roadmap.md](roadmap.md) — Feature roadmap

---

*Last updated: 2026-05-06*