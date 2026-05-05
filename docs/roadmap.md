# Roadmap — pi-slim-agents

## v0.1.0 — M2: Minimal Runnable Loop

**Baseline delegation with prompt-only runner.**

- [x] `/agents` command to list available specialist agents
- [x] `delegate_agent` tool for LLM delegation
- [x] Prompt-only runner (returns structured delegation prompt)
- [x] Routing hint injection via `before_agent_start`
- [x] 6 built-in agents: orchestrator, explorer, librarian, oracle, designer, fixer
- [x] Agent alias support (search → explorer, etc.)
- [x] Enable/disable configuration

## v0.1.0 — M3: Reliability & Config

**Testing, alias validation, and configuration.**

- [x] Test suite with tsx (no test framework)
- [x] Built-in agents loading tests
- [x] Frontmatter parsing tests
- [x] Alias conflict detection and resolution
- [x] Agent enable/disable via config
- [x] User-level and project-level config merge

## v0.1.0 — M4: Provider-Call Runner

**Dual runner mode with graceful fallback.**

- [x] `runnerMode` config: `"prompt-only"` (default) and `"provider-call"`
- [x] Provider-call runner architecture with `@mariozechner/pi-ai` complete() integration
- [x] Graceful fallback when pi-ai not importable (pnpm strict module resolution)
- [x] Agent-level `model` and `temperature` configuration
- [x] Temperature priority: config > frontmatter > default (0.2)
- [x] Model priority: agent > defaultModel > "current"
- [x] Prompt assembly: system prompt (agent body + boundaries) + user message (task/context/files/mode)
- [x] Provider-call output format with metadata
- [x] Disabled agent / unknown agent rejection in provider-call mode
- [x] Alias resolution in provider-call mode
- [x] 81 tests covering all functionality

## v0.1.0 — M5: Status / Reload / History / Metrics

**Observability, debuggability, and operational commands.**

- [x] `/agents status` — runtime status (runnerMode, provider-call availability, agent counts, config paths)
- [x] `/agents reload` — hot-reload config and agents from disk
- [x] `/agents history` — recent delegation history (in-memory, newest first)
- [x] `/agents metrics` — delegation metrics (counts, avg duration, per-agent, per-runnerMode)
- [x] Standalone fallback commands: `/agents-status`, `/agents-reload`, `/agents-history`, `/agents-metrics`
- [x] Delegation history recording in `delegate_agent` (timestamp, agent, task summary, status, duration, alias)
- [x] `determineDelegationStatus` — classifies outcomes as success/fallback/error
- [x] Agent `source` field (package/user/project) for diagnostics
- [x] Provider-call availability caching (checked once per session)
- [x] Secret sanitization in error messages
- [x] Provider-call investigation documented in `docs/provider-call.md`
- [x] 115 tests covering all new functionality

## v0.1.0 — M6: Shortcut / Output Template / Replay-lite

**User experience improvements and structured output.**

- [x] `/agent <agent-or-alias> <task...>` shortcut command
- [x] `/agent` reuses `runDelegation` core logic (no code duplication)
- [x] `/agent` records history and metrics
- [x] `/agent` handles empty task (help), unknown agent (available list), disabled agent (clear error)
- [x] Structured output templates with XML-like tags (`<summary>`, `<findings>`, `<evidence>`, `<risks>`, `<next_actions>`)
- [x] Per-agent template variations (explorer, librarian, oracle, fixer, designer, orchestrator)
- [x] `outputTemplate` config toggle (default: true)
- [x] `/agents replay <id>` — re-run delegation from history
- [x] `/agents-replay <id>` — standalone fallback
- [x] History records include auto-incrementing `id`
- [x] History records include `fullTask`, `fullContext`, `fullFiles` for replay (configurable)
- [x] `history.storeFullTask` config option (default: true)
- [x] Replay uses original `resolvedAgent` to prevent alias drift
- [x] Replay warns if alias now resolves to a different agent
- [x] Replay refuses disabled/removed agents with clear error
- [x] 157 tests covering all new functionality

## v0.2.0 — Planned

**Full provider-call when pi-mono API supports it.**

- [ ] Direct model calling via ExtensionAPI (when available)
- [ ] Real provider-call with streaming results
- [ ] Agent-specific model preferences (beyond "current")
- [ ] Provider-call diagnostics (token usage, latency)

## v0.3.0 — Planned

**Enhanced delegation and agent capabilities.**

- [ ] Agent dependency resolution (agent A can call agent B)
- [ ] Persistent delegation history (file-based)
- [ ] Agent templates for common patterns (reviewer, tester, documenter)
- [ ] Agent composition (combine agents for complex workflows)

## v0.4.0 — Planned

**Child session delegation (when pi-mono API supports it).**

- [ ] Independent model calls via pi-mono child session API
- [ ] Specialist runs in isolated context (no main session pollution)
- [ ] Streaming results back to main session
- [ ] Parallel delegation support

## v0.5.0 — Planned

**Advanced features.**

- [ ] Agent-specific tool permissions (restrict which tools each agent can use)
- [ ] Custom agent validation (schema checks for frontmatter)
- [ ] Agent testing utilities
- [ ] Worktree isolation or environment sandboxing

## Future Ideas

- [ ] Agent marketplace / sharing
- [ ] Agent performance benchmarking
- [ ] Agent learning from delegation outcomes
- [ ] Integration with pi-mono TUI for agent status display
- [ ] Agent-specific context window management
- [ ] Scheduler / cron-style orchestration
- [ ] Council / voting flows
- [ ] Session resume for delegated agents
- [ ] MCP integration
