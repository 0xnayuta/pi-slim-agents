# Roadmap — pi-slim-agents

## v0.1.0 — Current

**Project skeleton and built-in agent prompts.**

- [x] Pi-mono extension package structure
- [x] 5 built-in agents as markdown files (orchestrator, explorer, librarian, oracle, fixer)
- [x] Agent loading with priority: project > user > package
- [x] Config file support (`.pi/slim-agents.json`, `~/.pi/agent/slim-agents.json`)
- [x] `/agents` command to list available agents
- [x] `delegate_agent` tool with prompt-based delegation
- [x] Skill for using slim agents
- [x] Documentation (design, agent authoring, roadmap)

## v0.2.0 — Planned

**Enhanced delegation and agent capabilities.**

- [ ] Agent dependency resolution (agent A can call agent B)
- [ ] Delegation history tracking (which agents were called, results)
- [ ] Agent execution metrics (tokens used, time taken)
- [ ] Configurable agent model preferences
- [ ] Agent aliases (e.g., `@exp` → `@explorer`)

## v0.3.0 — Planned

**Child session delegation (when pi-mono API supports it).**

- [ ] Independent model calls via pi-mono provider API
- [ ] Specialist runs in isolated context (no main session pollution)
- [ ] Streaming results back to main session
- [ ] Parallel delegation support

## v0.4.0 — Planned

**Advanced features.**

- [ ] Agent templates for common patterns (reviewer, tester, documenter)
- [ ] Agent composition (combine agents for complex workflows)
- [ ] Agent-specific tool permissions (restrict which tools each agent can use)
- [ ] Custom agent validation (schema checks for frontmatter)
- [ ] Agent testing utilities

## Future Ideas

- [ ] Agent marketplace / sharing
- [ ] Agent performance benchmarking
- [ ] Agent learning from delegation outcomes
- [ ] Integration with pi-mono TUI for agent status display
- [ ] Agent-specific context window management
