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

## v0.1.0 — M7: History / Replay Usability

**Enhanced history/replay with mode, filters, modifications, and persistence.**

- [x] `/agent --mode <mode>` and `/agent -m <mode>` flag support
- [x] Mode validation: quick, normal, deep
- [x] Invalid mode returns clear error with valid mode list
- [x] Mode flows through delegation, history, and metrics
- [x] `/agents history --agent <name>` filter
- [x] `/agents history --status <status>` filter
- [x] `/agents history --mode <mode>` filter
- [x] `/agents history --runner <mode>` filter
- [x] `/agents history --limit <n>` (default 10, max 100)
- [x] `/agents history --query <text>` case-insensitive search
- [x] Filters can be combined
- [x] Empty filter results show clear message
- [x] `/agents replay <id> --mode <mode>` override
- [x] `/agents replay <id> --agent <agent>` override (with alias resolution)
- [x] `/agents replay <id> --task <task>` override
- [x] `/agents replay <id> --context <context>` override
- [x] `/agents replay <id> --files <f1,f2>` override
- [x] Replay `replayOf` field in history records
- [x] Replay shows original agent, new agent, and modified fields
- [x] Replay with agent override checks enabled/disabled
- [x] `/agents export-history` — export filtered history as JSON
- [x] `/agents-history-export` — standalone fallback
- [x] Export strips full task/context/files for privacy
- [x] Optional persistent JSONL history (`history.persistent`)
- [x] Persistent history load on session start
- [x] Persistent history append on each delegation
- [x] Retention enforcement (configurable, default 200)
- [x] Write failures do not affect delegation
- [x] History table shows mode column and replayOf indicator
- [x] `storeFullContext` config for independent context storage
- [x] `parseFlags` utility for CLI-style argument parsing
- [x] Standalone commands support filter args
- [x] 200 tests covering all new functionality

## v0.1.0 — M8: Agent Templates / Presets + Authoring Polish

**Quick-start templates for common specialist roles, validation, and authoring docs.**

- [x] `/agents templates` — List available agent templates
- [x] `/agents create <template> <agent>` — Create project-level agent from template
- [x] `/agents validate` — Validate agent files across all locations
- [x] Standalone fallback commands: `/agents-templates`, `/agents-create`, `/agents-validate`
- [x] 7 agent templates (security-reviewer, test-writer, doc-generator, refactor-planner, bug-triager, release-checker, cpp-reviewer)
- [x] Template loading service with `loadTemplates`, `getTemplate`
- [x] Agent creation from template with alias conflict detection
- [x] Validation: frontmatter, required fields, alias safety/conflicts, empty body, readonly boundary
- [x] `recommendedMode` field in frontmatter for template guidance
- [x] Improved agent authoring documentation
- [x] Updated skill guide with templates section
- [x] Templates directory included in package distribution
- [x] 223 tests covering all new functionality

## v0.1.0 — M9: Agent Search / Filter + Tags Metadata

**Enhanced search, filtering, and tag metadata.**

- [x] Tags metadata — All built-in agents and templates have tags for categorization
- [x] `/agents --tag <tag>` — Filter agents by tag (AND semantics for multiple tags)
- [x] `/agents --query <text>` — Case-insensitive search across name, description, aliases, tags
- [x] `/agents --readonly | --writable` — Filter by read-only status
- [x] `/agents --enabled | --disabled` — Filter by enabled status
- [x] `/agents --source builtin | user | project` — Filter by source
- [x] `/agents templates --tag <tag>` — Filter templates by tag
- [x] `/agents templates --query <text>` — Search templates
- [x] `/agents validate` — Now checks tags (validity, duplicates, missing tags, count limits)
- [x] Tags validation in `/agents validate`
- [x] **M9 feedback candidates**: Provider-call real integration, pi-ai importability fix, token usage tracking, `/agents --regex`, tag autocomplete in `/agent`, `/agents --format json`

## v0.1.0 — M10: Machine-readable Output / Regex Search / Scriptability

**JSON output and regex search for scripting, CI, and external tool integration.**

- [x] `--format json` for all list/status/history/metrics/validate commands
- [x] `/agents --format json` — JSON list of agents with filters
- [x] `/agents templates --format json` — JSON list of templates with filters
- [x] `/agents status --format json` — JSON status report
- [x] `/agents history --format json` — JSON delegation history with filters
- [x] `/agents metrics --format json` — JSON delegation metrics
- [x] `/agents validate --format json` — JSON validation results
- [x] All JSON outputs include `schemaVersion: 1` and `kind` field
- [x] All JSON outputs use camelCase field names
- [x] `--format text` is the default (backward compatible)
- [x] Unsupported `--format` values return clear error with supported list
- [x] `/agents --regex <pattern>` — Regex search (matches name, description, aliases, tags)
- [x] `/agents templates --regex <pattern>` — Regex search for templates
- [x] Regex uses case-insensitive flag (`i`) by default
- [x] Invalid regex patterns return clear errors (no crashes)
- [x] Regex AND-combined with other filters (`--tag --regex --query`)
- [x] Text output unchanged (no Markdown in JSON)
- [x] JSON outputs exclude: API keys, full prompts, full results, full task/context
- [x] Unified formatter layer (`src/format.ts`)
- [x] Tag autocomplete design reservation documented
- [x] Token usage tracking reservation documented
- [x] 47 new M10 tests (302 total, 1 pre-existing Windows-specific `/proc` failure)
- [x] Updated `docs/design.md` with JSON output, regex, autocomplete, token usage design

## v0.1.0 — M11: Agent Command JSON / Metadata / JSON Polish

**JSON output for /agent command, source metadata enhancement, and JSON polish.**

- [x] `/agent --format json` — JSON output for delegation results (success/error)
- [x] `/agent --mode <mode> --format json` — Combined mode and format flags
- [x] `kind: agentResult` — New JSON response kind for /agent delegation
- [x] `kind: error` — Structured error JSON for format/regex failures
- [x] Filters use `null` for unset fields (consistent serialization)
- [x] `/agents --format json` includes `metadata` — sourcePath, createdAt, lastModified, sizeBytes
- [x] `/agents templates --format json` includes `metadata`
- [x] File metadata collection via `fs.statSync` (non-fatal, graceful null on failure)
- [x] `collectFileMetadata()` utility in `src/metadata.ts`
- [x] `serializeAgentFilters()` / `serializeTemplateFilters()` — Reusable filter utilities
- [x] API key sanitization in `formatAgentResultJson` (`sanitizeJsonText()`)
- [x] `FileMetadata` type added to `types.ts`
- [x] `AgentDefinition.metadata` and `TemplateInfo.metadata` fields
- [x] Standalone fallback JSON commands not implemented (flags support is reliable)
- [x] Provider-call roadmap updated with blocking points and candidate solutions
- [x] 31 new M11 tests (333 total, 1 pre-existing Windows-specific `/proc` failure)
- [x] Updated `docs/design.md` with M11 design notes
- [x] Updated `docs/provider-call.md` with M11 roadmap
- [x] Updated README with /agent --format json, metadata, privacy notes, standalone JSON commands

## v0.1.0 — M12: Prompt Tuning / Lightweight Eval Examples

**Improving agent prompts and establishing a lightweight eval system.**

- [x] `examples/prompt-evals/` directory with human-readable eval cases for all built-in agents
- [x] `examples/prompt-evals/template-evals.md` covering all 7 templates
- [x] `docs/prompt-tuning.md` with prompt quality checklist and per-agent failure modes
- [x] Static prompt eval checker (`scripts/check-prompt-evals.ts`):
  - Eval file existence check (6 agent + template evals)
  - Minimum 3 cases per agent
  - Required fields: Agent, Task, Expected behavior
  - Agent files non-empty and have boundary constraints
  - prompt-tuning.md checklist presence
- [x] Built-in agent prompt tightening:
  - explorer: Reduced scope creep, clearer output format, file:line evidence requirement
  - oracle: Verdict-first output, bounded length, no abstract advice without recommendation
  - fixer: Scope enforcement, no claim of modifications in prompt-only mode
  - librarian: Source citation requirement, distinction between official docs and tutorials
  - designer: Actionable guidance, project design system awareness
  - orchestrator: Delegation restraint, routing precision
- [x] `pnpm test:prompts` integrated into CI and `pnpm test`
- [x] M9 feedback incorporated into prompt refinements

## v0.1.0 — M13: Release Hardening / v0.1.0 Readiness

**Completing the release package and hardening for v0.1.0 publication.**

- [x] Package hardening:
  - `.npmignore` to exclude dev-only files
  - `.gitignore` with node_modules, dist, history.jsonl, Python temp files
  - `scripts/check-package.ts` validating all package contents
  - 13-point package check covering dist, agents, templates, skills, docs, examples, README, CHANGELOG, LICENSE, .gitignore
- [x] README / CHANGELOG / release docs:
  - `docs/release.md` with complete pre-release checklist, publishing, rollback
  - `docs/provider-call.md` with full investigation and architectural status
  - Status table with ✅/⚠️ indicators for feature clarity
  - "What this is NOT" section clarifying non-scope
  - Current Limitations section explicitly listing v0.1.0 exclusions
- [x] GitHub Actions CI pipeline:
  - Runs on push and pull_request to main/master
  - Covers: typecheck → build → test:agents → test:prompts → check:package → pack:dry
  - Uses pnpm v9 with corepack
  - Caches pnpm store
- [x] `pnpm release:check` chain: typecheck + build + test + check:package + pack:dry
- [x] `prepublishOnly` hook preventing accidental publish without verification
- [x] Multi-round code review completed (R0–R6) covering package, extension integration, agent/template loading, command parsing, runner/history/metrics, tests/edge cases, documentation/UX
- [x] 362+ tests covering all core functionality
- [x] Provider-call remains "architectural only" — prompt-only is the stable default for v0.1.0

## v0.3.0 — Planned

**Enhanced delegation and agent capabilities.**

- [ ] Agent dependency resolution (agent A can call agent B)
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
