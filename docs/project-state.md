# Project State

## Current status

- **Ready for 0.1.0** by R7 review
- **npm publish temporarily deferred** due to npm 2FA/token issue
- **Local dogfood in devpiano** is current focus

## Current phase

Dogfood / pre-publish stabilization.

## Stable capabilities

The following capabilities are stable and working in v0.1.0:

- **Prompt-only delegation** — stable default, generates specialist delegation prompts
- **Built-in agents** — 6 agents ready: explorer, librarian, oracle, fixer, designer, orchestrator
- **`/agent` shortcut** — direct invocation with `--mode` flag (quick, normal, deep)
- **`/agents` commands** — status, reload, history, metrics, replay, export-history, templates, create, validate
- **Templates** — 7 templates: security-reviewer, test-writer, doc-generator, refactor-planner, bug-triager, release-checker, cpp-reviewer
- **Tags/filter/regex** — filter agents/templates by tags, readonly, source, regex patterns
- **JSON output** — `--format json` for all commands
- **Metadata safe sourcePath** — no absolute paths, no API keys in JSON output
- **Prompt eval examples** — `examples/prompt-evals/` with static checker
- **Release checks** — `pnpm release:check` for full validation

## Experimental / fallback capabilities

- **Provider-call runner architecture** exists but real provider-call unavailable
- **Provider-call currently falls back to prompt-only** — pi-ai not importable via pnpm strict module resolution
- **Persistent history** — optional JSONL persistence (if configured)

## Not implemented

The following are out of scope for v0.1.0:

- Real provider-call integration (pending pi-mono ExtensionAPI)
- Child-session runner (pending pi-mono API)
- Background subagents
- Agent composition/pipelines
- Worktree isolation
- Scheduler/cron
- MCP integration
- Token usage tracking
- Tag autocomplete in `/agent`
- Provider-call streaming

## Important behavior

### `/agent` in prompt-only mode only generates a delegation prompt

In prompt-only mode (the stable default), `/agent` and `delegate_agent`:

- ✅ Return a structured specialist delegation prompt
- ✅ Show the agent's role, task, instructions, and expected output format
- ✅ Record the delegation in history

But:

- ❌ Do NOT execute grep, read, bash, or any other tools
- ❌ Do NOT search the codebase
- ❌ Do NOT start a background child agent
- ❌ Do NOT automatically continue running

**Actual code search still needs the main pi session to perform it.** Use the generated prompt to guide the main agent, then ask it to perform the search manually with grep/read/bash.

This is expected behavior for v0.1.0. See [docs/dogfood.md](dogfood.md) for recommended workflows.

## Recent milestones

| Milestone | Date | Status |
|-----------|------|--------|
| R0-R7 audit completed | 2026-05-06 | ✅ |
| R7: Ready for 0.1.0 | 2026-05-06 | ✅ |
| Release-prep completed | 2026-05-06 | ✅ |
| D1-fix: ESM require fix | 2026-05-06 | ✅ |
| D1-fix: Prompt-only UX fix | 2026-05-06 | ✅ |
| Dogfood started in devpiano | 2026-05-06 | 🔄 |

## Current known issues / risks

| Issue | Impact | Mitigation |
|-------|--------|------------|
| npm publish blocked by npm account auth flow | Cannot publish to npm | Defer publish, code is release-ready |
| prompt-only UX may confuse new users | User expectation mismatch | D1 UX fix with banners + docs/dogfood.md |
| provider-call unavailable: pi-ai not importable | Falls back to prompt-only | Expected, monitor pi-mono API |
| Need dogfood feedback in devpiano | Untested in real workflow | Continue two-step Explorer workflow |
| R5 minor tests deferred | Test coverage gaps | Add in v0.1.x if needed |

## Next recommended actions

1. **Verify D1-fix in devpiano** — confirm no "require is not defined" errors on startup
2. **Continue dogfood with two-step pattern** — `/agent` + ask main agent to perform search
3. **Record dogfood feedback** — prompt quality, runner behavior, UX clarity
4. **Improve prompt-only UX if needed** — based on dogfood findings
5. **Add R5 deferred tests** — Unicode/Chinese, repeated flags, outputTemplate=false
6. **Revisit npm publish** — when account auth issue resolved

## Documentation

- [docs/roadmap.md](roadmap.md) — Feature roadmap and milestone history
- [docs/design.md](design.md) — Architecture and design decisions
- [docs/dogfood.md](dogfood.md) — Dogfooding guide with workflows
- [docs/provider-call.md](provider-call.md) — Provider-call investigation and status
- [docs/reviews/index.md](reviews/index.md) — Review round summary
- [docs/decisions.md](decisions.md) — Key design decisions
- [docs/next-actions.md](next-actions.md) — Current action items

---

*Last updated: 2026-05-06*