# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - Unreleased

### Added

- **Built-in slim agents**: orchestrator, explorer, librarian, oracle, fixer, designer
- **`delegate_agent` tool**: Prompt-based delegation with configurable runner modes
- **`/agent` shortcut**: Direct invocation with mode flag (`--mode quick|normal|deep`)
- **Agent aliases**: search→explorer, arch→oracle, fix→fixer, ui→designer, etc.
- **Enable/disable configuration**: Per-agent enabled flag with config precedence
- **`/agents status`**: Runtime status (runnerMode, provider-call availability, counts, paths)
- **`/agents reload`**: Hot-reload config and agents from disk
- **`/agents history`**: Delegation history with filters (agent, status, mode, limit, query)
- **`/agents metrics`**: Delegation metrics (counts, avg duration, per-agent, per-runnerMode)
- **`/agents replay <id>`**: Re-run delegation with optional modifications
- **`/agents export-history`**: Export history as JSON with privacy stripping
- **`/agents templates`**: List available agent templates
- **`/agents create <template> <agent>`**: Create project-level agent from template
- **`/agents validate`**: Validate agents (frontmatter, required fields, aliases, tags)
- **Tags metadata**: Tags for search/filter, `/agents --tag`, validation (validity, duplicates, presence, count)
- **`--format json`**: Machine-readable JSON output for all commands
- **`--format text`**: Default text output (backward compatible)
- **`--regex <pattern>`**: Regex-based agent/template search
- **`--query <text>`**: Case-insensitive text search
- **`--readonly/--writable`**: Filter by read-only status
- **`--source builtin/user/project`**: Filter by agent source
- **Output templates**: XML-like structured output (`<summary>`, `<findings>`, `<evidence>`, etc.)
- **Persistent history**: Optional JSONL-based history with retention control
- **Agent metadata**: sourcePath, createdAt, lastModified, sizeBytes in JSON output
- **`examples/prompt-evals/`**: Lightweight eval cases for all agents and templates
- **`pnpm test:prompts`**: Static prompt eval checker
- **`pnpm release:check`**: Full release validation (typecheck, build, test, pack:dry)
- **`pnpm check:package`**: Package contents verification script
- **GitHub Actions CI**: Automated testing on push/PR

### Agent Templates

- `security-reviewer` — Security risk reviewer (input validation, auth, dependency risks)
- `test-writer` — Test planning and test case generation
- `doc-generator` — Documentation specialist (README, API docs, changelogs)
- `refactor-planner` — Cleanup plans and modernization guidance
- `bug-triager` — Bug triage specialist (narrowing down bug sources)
- `release-checker` — Pre-release checklist (version bumps, changelogs, dry-runs)
- `cpp-reviewer` — C/C++ specialist (memory safety, CMake, clangd diagnostics)

### Configuration

- `runnerMode`: "prompt-only" (default) or "provider-call"
- `outputTemplate`: true/false (default: true)
- `history.persistent`: Enable JSONL persistence
- `history.path`: Custom history file path
- `history.retention`: Max records (default: 200)
- `agents.<name>.temperature`: Agent-level temperature override
- `agents.<name>.model`: Agent-level model override
- `agents.<name>.enabled`: Agent-level enable/disable

### Documentation

- `docs/design.md` — Architecture and design decisions
- `docs/agent-authoring.md` — Agent creation and template authoring guide
- `docs/provider-call.md` — Provider-call investigation and roadmap
- `docs/prompt-tuning.md` — Prompt quality checklist and eval guide
- `docs/roadmap.md` — Feature roadmap with milestone tracking

### Limitations (v0.1.0)

- **Provider-call is architectural only**: Falls back to prompt-only due to pnpm module resolution
- **No real model calls**: Real provider-call integration pending pi-mono ExtensionAPI
- **No agent composition/pipelines**: Not in scope for v0.1.0
- **No child session delegation**: Pending pi-mono child session API
- **No token usage tracking**: Requires real provider-call
- **No worktree isolation**: Not in scope
- **No scheduler/cron**: Not in scope
- **No MCP integration**: Not in scope
- **No streaming**: Not in scope

### Notes

- Prompt-only delegation is the stable default
- No API keys or secrets in JSON output
- History is in-memory by default (optional JSONL persistence)
- All built-in agents have boundary constraints and role clarity
- pi manifest: `extensions` → `./dist/index.js`, `skills` → `./skills`

## Prior Milestones

See [docs/roadmap.md](docs/roadmap.md) for milestone history (M2–M12).