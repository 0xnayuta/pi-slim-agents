# Roadmap — pi-slim-agents

## v0.3.0 — Current

**Provider-call runner and agent model/temperature configuration.**

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
- [x] 81 tests covering all new functionality

## v0.4.0 — Planned

**Full provider-call when pi-mono API supports it.**

- [ ] Direct model calling via ExtensionAPI (when available)
- [ ] Real provider-call with streaming results
- [ ] Agent-specific model preferences (beyond "current")
- [ ] Provider-call diagnostics (token usage, latency)

## v0.5.0 — Planned

**Enhanced delegation and agent capabilities.**

- [ ] Agent dependency resolution (agent A can call agent B)
- [ ] Delegation history tracking (which agents were called, results)
- [ ] Agent execution metrics (tokens used, time taken)
- [ ] Agent templates for common patterns (reviewer, tester, documenter)
- [ ] Agent composition (combine agents for complex workflows)

## v0.6.0 — Planned

**Child session delegation (when pi-mono API supports it).**

- [ ] Independent model calls via pi-mono child session API
- [ ] Specialist runs in isolated context (no main session pollution)
- [ ] Streaming results back to main session
- [ ] Parallel delegation support

## v0.7.0 — Planned

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
