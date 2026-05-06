# pi-slim-agents

Lightweight specialist agents for [pi-coding-agent](https://github.com/mariozechner/pi-coding-agent). This package adds a small set of expert role prompts and a `delegate_agent` tool with configurable runner modes.

## Current status

**v0.1.0 (M10) — Machine-readable Output / Regex Search / Scriptability.**

This release adds:
- **`--format json`** — JSON output for all data commands (agents, templates, status, history, metrics, validate)
- **`/agents --format json`** — JSON list of agents with applied filters
- **`/agents templates --format json`** — JSON list of templates
- **`/agents status --format json`** — JSON runtime status
- **`/agents history --format json`** — JSON delegation history
- **`/agents metrics --format json`** — JSON delegation metrics
- **`/agents validate --format json`** — JSON validation results
- **`/agents --regex <pattern>`** — Regex search (matches name, description, aliases, tags; case-insensitive)
- **`/agents templates --regex <pattern>`** — Regex search for templates
- All JSON outputs include `schemaVersion` and `kind` fields for forward compatibility
- JSON outputs exclude API keys, full prompts, full results, and full task/context
- Unified formatter layer (`src/format.ts`) separates text and JSON output

### M10 does not add (see roadmap)
- Real provider-call integration (still falls back to prompt-only)
- Token usage tracking (still unavailable)
- Tag autocomplete (future, requires pi-mono completion API)

| Mode | Behavior |
|------|----------|
| `prompt-only` | Returns a structured delegation prompt for the main agent (default) |
| `provider-call` | Attempts to call the model directly; falls back to prompt-only when unavailable |

`delegate_agent` still does **not**:

- Spawn a real subagent or child pi process
- Start a background subprocess or scheduler
- Create worktrees or isolate environments
- Run council/voting flows
- Support parallel agent execution
- Support agent composition or pipelines
- Track real token usage (still unavailable — requires real provider-call)

### Provider-call status

The provider-call runner attempts to call the model via `@mariozechner/pi-ai`'s `complete()` function using the current session model and API key. Currently, `@mariozechner/pi-ai` is not directly importable from the extension's module context due to pnpm strict module resolution. When the import fails, the runner gracefully falls back to prompt-only mode with a clear message.

When the pi-mono Extension API adds a direct model calling method (or pi-ai becomes importable), the provider-call runner will make real model calls automatically.

## JSON Output

All data commands support `--format json` for scriptable, machine-readable output. Default is `--format text` (backward compatible).

**Commands supporting `--format json`**:

```text
/agents --format json
/agents templates --format json
/agents status --format json
/agents history --format json
/agents metrics --format json
/agents validate --format json
```

All JSON outputs use a consistent envelope:

```json
{
  "schemaVersion": 1,
  "kind": "agents",
  "filters": {},
  "count": 6,
  "items": [...]
}
```

### JSON Schema

| kind | Description |
|------|-------------|
| `agents` | Agent list with applied filters |
| `templates` | Template list with applied filters |
| `status` | Runtime status (runnerMode, provider-call, agent counts, config paths) |
| `history` | Delegation history records (id, timestamp, agent, status, duration, alias, replayOf) |
| `metrics` | Delegation metrics (total, success/fallback/error counts, avg duration, per-agent, per-runnerMode) |
| `validation` | Validation results (issues by type, checked counts, tags stats) |

### JSON Privacy

- No API keys or secrets
- No full prompt bodies (`body` field excluded)
- No full results from provider-call mode
- History JSON only includes `taskSummary` (truncated to 80 chars), not full task text
- Full task/context stored in-memory only (not in JSON output)

### Example: /agents --format json

```json
{
  "schemaVersion": 1,
  "kind": "agents",
  "filters": {},
  "count": 6,
  "items": [
    {
      "name": "oracle",
      "description": "Strategic advisor and architecture reviewer",
      "enabled": true,
      "readonly": true,
      "aliases": ["arch", "review", "judge"],
      "tags": ["architecture", "review", "readonly"],
      "source": "package",
      "recommendedMode": "deep"
    }
  ]
}
```

### Example: /agents metrics --format json

```json
{
  "schemaVersion": 1,
  "kind": "metrics",
  "totalDelegations": 12,
  "successCount": 10,
  "fallbackCount": 2,
  "errorCount": 0,
  "averageDurationMs": 100,
  "perAgent": { "oracle": 5, "explorer": 4, "fixer": 3 },
  "perRunnerMode": { "prompt-only": 12 },
  "tokenUsage": {
    "available": false,
    "reason": "provider-call usage data unavailable"
  }
}
```

### Script Examples

Filter agents by tag and output JSON:
```text
/agents --tag review --format json
```

Filter history by agent and status:
```text
/agents history --agent oracle --status error --format json
```

Parse with jq:
```bash
# Get all agent names
/agents --format json | jq '.items[].name'

# Get enabled agents with 'security' tag
/agents --format json | jq '.items[] | select(.tags | contains(["security"]))'

# Get metrics summary
/agents metrics --format json | jq '.totalDelegations'
```

## Regex Search

For power users, `--regex` provides pattern-based filtering:

```text
/agents --regex "^cpp"               # agents whose searchable text starts with "cpp"
/agents --regex "review"             # agents matching "review" anywhere
/agents --regex "oracle|explorer"    # agents matching either pattern
/agents templates --regex "writer|reviewer"
```

Regex is **AND-combined** with other filters:

```text
/agents --tag review --regex "oracle" # must have 'review' tag AND match 'oracle'
/agents --source builtin --regex "fix" # builtin agents matching 'fix'
```

Features:
- Case-insensitive (`i` flag) by default
- Matches against: name, description, aliases, tags (joined)
- Invalid patterns return a clear error (no crash)

**Tip**: For simple text search, prefer `--query` (plain text, always works). Reserve `--regex` for complex patterns.

## Built-in agents

| Agent | Role | Best For | Read-only |
|-------|------|----------|-----------|
| `orchestrator` | Task coordinator | Decomposition and routing guidance | no |
| `explorer` | Codebase navigator | Finding files, locating code patterns, "where is X?" | yes |
| `librarian` | Documentation researcher | Library docs, API references, best practices | yes |
| `oracle` | Strategic advisor | Architecture review, debugging strategy, code review | yes |
| `designer` | UI/UX specialist | UI/UX, styling, responsive design, interaction review | no |
| `fixer` | Implementation specialist | Small bounded code changes, tests, bug fixes | no |

Each agent has **tags** for search and filtering (e.g., `codebase`, `search`, `readonly`, `writable`). Use `/agents --tag <tag>` to filter.

## Agent Templates

Templates are **not enabled by default**. They provide a starting point for creating project-level agents.

| Template | Role | Best For | Read-only |
|---------|------|----------|-----------|
| `security-reviewer` | Security specialist | Input validation, auth, dependency risks | yes |
| `test-writer` | Test planner | Test plans, test cases, coverage gaps | no |
| `doc-generator` | Documentation specialist | README, API docs, changelogs | no |
| `refactor-planner` | Refactoring planner | Cleanup plans, modernization guidance | yes |
| `bug-triager` | Bug triage specialist | Narrowing down bug sources | yes |
| `release-checker` | Pre-release checklist | Version bumps, changelogs, dry-runs | yes |
| `cpp-reviewer` | C/C++ specialist | Memory safety, CMake, clangd diagnostics | yes |

### List templates

```text
/agents templates
```

Output:

```
# Agent Templates

7 templates available. Templates are not enabled by default.

  Name                 Description                                          RO   Mode    Tags
  ──────────────────────────────────────────────────────────────────────────────────────────────────────
  security-reviewer    Security risk reviewer for input validation...     yes  normal  security, review, readonly
  test-writer          Test planning and test case generation...           no   normal  test, qa, writable
  ...

Usage: /agents create <template> <agent-name>
Example: /agents create security-reviewer security
```

**Filter templates:**

```text
/agents templates --tag security       # templates tagged with "security"
/agents templates --query docs         # match name, description, aliases, or tags
/agents templates --readonly           # only read-only templates
/agents templates --writable           # only writable templates
```

### Create from template

```text
/agents create <template-name> <agent-name>
```

Examples:

```text
/agents create security-reviewer security
/agents create cpp-reviewer cpp-reviewer
/agents create test-writer test-writer
/agents create bug-triager bug-triage
```

This creates a project-level agent at `.pi/slim-agents/agents/<agent-name>.md`. Run `/agents reload` to activate it.

### Validate agents

```text
/agents validate
```

Validates agent files across all locations (built-in, templates, user-level, project-level). Checks:
- Frontmatter parsing
- Required fields (name, description, readonly)
- Alias safety and conflicts
- **Tags validity** — each tag must be lowercase alphanumeric with hyphens/underscores
- **Tags duplicates** — duplicate tags produce a warning
- **Tags presence** — agents/templates without any tags produce a warning
- **Tags count** — more than 8 tags produces a warning
- Empty body prompts
- readonly=false boundary warnings

## Installation for local development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm pack --dry-run
pi install /path/to/pi-slim-agents
```

The package manifest points pi at `./dist/index.js`, so run `pnpm build` before installing from a local path.

## Usage

### Quick delegation shortcut

The `/agent` command lets users directly call a specialist agent:

```text
/agent explorer find playback speed implementation
/agent search find where .devpiano files are saved
/agent oracle review the playback speed design
/agent arch check whether this approach is over-engineered
/agent designer review the controls panel UX
/agent fixer implement a small null check
```

**With mode flag:**

```text
/agent --mode deep oracle review the architecture
/agent -m quick explorer find playback code
/agent --mode normal designer review the UI flow
```

Modes:
- `quick` — Fast, brief answers
- `normal` — Balanced depth (default)
- `deep` — Thorough analysis with edge cases

- Supports agent names and aliases
- Task is required; empty task shows help
- Unknown agent shows available agents list
- Disabled agent returns a clear error
- Delegations are recorded in history and metrics

### List available agents

```text
/agents
```

Expected shape:

```text
# Available Agents

- @orchestrator — AI task orchestrator that decomposes work and delegates to specialist agents — readonly: no
  aliases: route, router
  tags: routing, meta, readonly
- @explorer — Fast codebase search and pattern matching specialist — readonly: yes
  aliases: search, find, locate
  tags: codebase, search, readonly
...
```

**Filter agents by tag:**

```text
/agents --tag review        # agents tagged with "review"
/agents --tag readonly     # read-only agents only
/agents --tag security --tag review  # agents with BOTH tags (AND semantics)
```

**Search agents:**

```text
/agents --query cpp         # match name, description, aliases, or tags (case-insensitive)
/agents --query "code search"
```

**Filter by read-only status:**

```text
/agents --readonly          # only read-only agents
/agents --writable          # only writable (non-readonly) agents
```

**Filter by enabled status:**

```text
/agents --enabled
/agents --disabled
```

**Filter by source:**

```text
/agents --source builtin    # built-in package agents
/agents --source project    # project-level agents
/agents --source user       # user-level agents
```

Filters can be combined:

```text
/agents --tag review --readonly
/agents --tag cpp --source builtin
/agents --query docs --writable
```

### Delegate to explorer (or use alias)

```json
{
  "agent": "explorer",
  "task": "Find where package resources are loaded",
  "files": ["src/"],
  "mode": "normal"
}
```

Or use an alias:

```json
{
  "agent": "search",
  "task": "Find where package resources are loaded",
  "files": ["src/"]
}
```

### Delegate to oracle

```json
{
  "agent": "oracle",
  "task": "Review whether prompt-only delegation is the right v1 architecture",
  "context": "Do not spawn child processes in this milestone.",
  "files": ["src/index.ts", "src/runner.ts"],
  "mode": "deep"
}
```

### Delegate to designer (via alias)

```json
{
  "agent": "ui",
  "task": "Review the command output format for readability in a terminal UI",
  "context": "The output is shown through ctx.ui.notify.",
  "mode": "quick"
}
```

`delegate_agent` parameters:

- `agent: string`
- `task: string`
- `context?: string`
- `files?: string[]`
- `mode?: "quick" | "normal" | "deep"`

The tool returns a structured output. In prompt-only mode:

```text
Agent
Role
Task
Context
Files
Mode
Instructions
Expected Output
```

In provider-call mode (when available):

```text
Agent: @oracle
Mode: provider-call
Task: Review the architecture
Result:
<actual model response>

Metadata:
- resolvedAgent: oracle
- requestedAgent: arch
- model: current
- temperature: 0.1
- runnerMode: provider-call
```

If provider-call fails or is unavailable, it falls back to prompt-only with a clear message.

If the agent name is invalid or not found, the tool returns a clear error and lists available agents.

## Management Commands

### Status

```text
/agents status
```

Shows runtime status: runner mode, provider-call availability, agent counts, config paths, and last reload time.

Subcommand dispatch via `/agents status`. Standalone fallback: `/agents-status`

### Reload

```text
/agents reload
```

Hot-reloads configuration and agents from disk. Re-reads:
- Built-in agents
- User-level agents (`~/.pi/agent/slim-agents/agents/*.md`)
- Project-level agents (`.pi/slim-agents/agents/*.md`)
- User-level config (`~/.pi/agent/slim-agents.json`)
- Project-level config (`.pi/slim-agents.json`)

If reload fails, the previous agent registry is preserved.

Standalone fallback: `/agents-reload`

### History

```text
/agents history
```

Shows the 10 most recent delegation records (newest first). Each record includes: id, timestamp, agent, task summary, mode, status, duration, and whether an alias was used.

**Filter history:**

```text
/agents history --agent oracle
/agents history --status error
/agents history --mode deep
/agents history --runner provider-call
/agents history --limit 20
/agents history --query playback
```

Filters can be combined:

```text
/agents history --agent oracle --status error --mode deep
```

Filter options:
- `--agent <name>` — filter by agent (matches requested or resolved agent)
- `--status <status>` — filter by status: success, fallback, error
- `--mode <mode>` — filter by delegation mode: quick, normal, deep
- `--runner <mode>` — filter by runner mode: prompt-only, provider-call
- `--limit <n>` — max results (default 10, max 100)
- `--query <text>` — case-insensitive search in task, agent names, and context

**History is in-memory by default** — cleared when the pi session restarts. See [Persistent History](#persistent-history) for optional file-based persistence.

Full prompts and results are not recorded. API keys are never stored.

Standalone fallback: `/agents-history`

### Replay

```text
/agents replay <id>
```

Re-runs a delegation from history using the original parameters. Creates a new history record.

**Replay with modifications:**

```text
/agents replay 5 --mode deep
/agents replay 5 --agent oracle
/agents replay 5 --task "review this again with focus on error handling"
/agents replay 5 --context "new context"
/agents replay 5 --files src/a.ts,src/b.ts
```

Modifications can be combined:

```text
/agents replay 5 --mode deep --agent oracle --task "focused review"
```

Replay behavior:
- Original parameters are used unless overridden
- Original `resolvedAgent` is preferred (avoids alias drift)
- If overriding agent: alias resolution and enabled/disabled checks apply
- New history record is created with `replayOf` referencing the original
- Output shows original agent, new agent, and modified fields
- If the original agent is disabled or removed, replay is refused

Standalone fallback: `/agents-replay <id> [--mode <mode>] [--agent <agent>] [--task <task>]`

### Metrics

```text
/agents metrics
```

Shows delegation metrics: total count, success/fallback/error breakdown, average duration, per-agent call counts, per-runnerMode counts, and provider-call availability.

**Metrics are in-memory only** — cleared on restart. Token usage is shown as "unavailable".

Standalone fallback: `/agents-metrics`

### Export History

```text
/agents export-history
```

Exports delegation history as JSON. Supports the same filters as `/agents history`:

```text
/agents export-history --agent oracle
/agents export-history --status error
/agents export-history --mode deep
```

The export:
- Strips full task, context, and files for privacy
- Includes task summaries, agent names, status, mode, duration
- Supports `replayOf` field for replayed records

Standalone fallback: `/agents-history-export`

## Persistent History

By default, history is in-memory only. To persist history across sessions:

```json
{
  "history": {
    "persistent": true,
    "path": ".pi/slim-agents/history.jsonl",
    "retention": 200,
    "storeFullTask": true,
    "storeFullContext": false
  }
}
```

Configuration options:
- `persistent` — Enable file-based JSONL history (default: `false`)
- `path` — Path for the JSONL file, relative to project root (default: `.pi/slim-agents/history.jsonl`)
- `retention` — Maximum records to keep (default: 200)
- `storeFullTask` — Store full task text for replay (default: `true`)
- `storeFullContext` — Store full context text (default: `true`)

**Privacy notes:**
- Full agent results are never stored
- API keys are never stored
- Full prompts are not stored
- `storeFullContext` controls whether context is persisted
- Write failures do not affect delegation — only a warning is logged

**Gitignore recommendation:**

Add to `.gitignore`:
```
# pi-slim-agents persistent history
.pi/slim-agents/history.jsonl
```

## Output Templates

When `outputTemplate` is enabled (default), delegation prompts include structured output templates using XML-like tags. These are **output conventions**, not strict parsers — they guide the specialist agent to produce structured, easy-to-parse results.

```text
<summary>
One-line conclusion
</summary>

<findings>
- Key findings
</findings>

<evidence>
- File paths, line numbers, config items, documentation references
</evidence>

<risks>
- Risks or uncertainties
</risks>

<next_actions>
- Suggested next steps
</next_actions>
```

### Per-agent variations

| Agent | Emphasis |
|-------|----------|
| explorer | `evidence`: precise `path:line` references |
| librarian | `evidence`: sources, citations; no file modification |
| oracle | `risks`: tradeoffs, recommendations |
| fixer | `changes` + `verification`; warns not to claim file modification in prompt-only mode |
| designer | `findings`: UX observations, visual consistency, interaction risks |
| orchestrator | `summary` + `next_actions`: routing decisions and plans |

### Disable output templates

```json
{
  "outputTemplate": false
}
```

When disabled, agents receive simple output instructions instead of structured templates.

## Runner Modes

Two runner modes control how delegation is executed.

### prompt-only (default)

Returns a structured delegation prompt that tells the main agent to adopt the specialist's role and complete the task. This is the safest mode — no additional model calls are made.

### provider-call

Attempts to call the model directly with the specialist's system prompt. Uses the current session model and API key. Returns the model's actual response.

When provider-call is unavailable (e.g., pi-ai not importable), it falls back to prompt-only with a clear message.

## Agent Aliases

Agents can be referenced by alias names in `delegate_agent`:

| Alias | Resolves To |
|-------|------------|
| `search`, `find`, `locate` | `explorer` |
| `docs`, `research`, `library` | `librarian` |
| `arch`, `review`, `judge` | `oracle` |
| `fix`, `implement`, `patch` | `fixer` |
| `ui`, `ux`, `design` | `designer` |
| `route`, `router` | `orchestrator` |

Aliases are defined in agent markdown frontmatter. Custom agents can also define aliases.

Alias rules:
- Only lowercase letters, numbers, hyphens, underscores
- Cannot conflict with another agent's name or alias
- Conflicting aliases are skipped with a warning at load time

## Configuration

All configuration goes in a config file:

Project-level: `.pi/slim-agents.json`

User-level: `~/.pi/agent/slim-agents.json`

Priority: **project-level > user-level > defaults**.

### Runner mode

```json
{
  "runnerMode": "prompt-only"
}
```

Or:

```json
{
  "runnerMode": "provider-call"
}
```

Default: `prompt-only`.

### Default model

```json
{
  "runnerMode": "provider-call",
  "defaultModel": "current"
}
```

`"current"` means use the current pi session model. You can also specify a model id, though this is informational in the current version.

### Agent-level model and temperature

```json
{
  "runnerMode": "provider-call",
  "defaultModel": "current",
  "agents": {
    "oracle": {
      "model": "current",
      "temperature": 0.2
    },
    "fixer": {
      "model": "current",
      "temperature": 0.2
    }
  }
}
```

**Temperature priority** (highest wins):
1. Config file `agents.<name>.temperature`
2. Agent frontmatter `temperature`
3. Default `0.2`

**Model priority** (highest wins):
1. Config file `agents.<name>.model`
2. Config file `defaultModel`
3. Default `"current"`

Note: Temperature configuration is stored and resolved correctly, but only takes effect when provider-call mode can actually call the model. In prompt-only mode, temperature is informational.

### Disable agents

```json
{
  "agents": {
    "designer": {
      "enabled": false
    }
  }
}
```

Disabled agents:
- Are not shown in `/agents` main list (shown separately as "Disabled Agents")
- Cannot be called via `delegate_agent`
- Aliases pointing to disabled agents are also rejected
- Error messages explain how to re-enable

You can also use the legacy `disabled: true` format:

```json
{
  "agents": {
    "designer": {
      "disabled": true
    }
  }
}
```

Or the top-level `disabled` array:

```json
{
  "disabled": ["designer"]
}
```

If both `enabled` and `disabled` are set, `enabled` takes precedence.

### Full configuration example

```json
{
  "runnerMode": "provider-call",
  "defaultModel": "current",
  "outputTemplate": true,
  "history": {
    "storeFullTask": true,
    "storeFullContext": false,
    "persistent": false,
    "path": ".pi/slim-agents/history.jsonl",
    "retention": 200
  },
  "agents": {
    "oracle": {
      "temperature": 0.2
    },
    "fixer": {
      "temperature": 0.2
    },
    "designer": {
      "enabled": false
    }
  }
}
```

## Custom Agents

Project-level agents:

```text
.pi/slim-agents/agents/my-agent.md
```

User-level agents:

```text
~/.pi/agent/pi-slim-agents/agents/my-agent.md
```

Agent names must use only lowercase letters, numbers, hyphens, and underscores.

Example:

```markdown
---
name: security-reviewer
description: Security-focused review agent.
readonly: true
aliases:
  - security
tags:
  - security
  - review
  - readonly
---

You are Security Reviewer — a specialist in focused risk review.
...
```

Loading priority for the same name:

1. Project-level `.pi/slim-agents/agents/*.md`
2. User-level `~/.pi/agent/pi-slim-agents/agents/*.md`
3. Package built-in `agents/*.md`

### Using Templates

Templates provide starting points for common specialist roles:

```text
/agents templates
/agents create security-reviewer security
/agents reload
```

See [docs/agent-authoring.md](docs/agent-authoring.md) for full authoring guide.

## Provider-Call Status

The provider-call runner is architecturally complete but cannot make real model calls in most environments due to pnpm strict module resolution preventing import of `@mariozechner/pi-ai`. When provider-call is unavailable, the runner gracefully falls back to prompt-only.

Use `/agents status` to check whether provider-call is available in your environment.

See [docs/provider-call.md](docs/provider-call.md) for the full investigation and candidate solutions.

## Current limitations

This version intentionally does **not** support:

- Real model calls via provider-call (falls back to prompt-only)
- Agent-to-agent delegation
- Agent composition or pipelines
- Provider-call streaming
- Spawning pi subprocesses or child processes
- True background agents or parallel execution
- Worktree isolation or environment sandboxing
- Scheduler or cron-style orchestration
- Council / voting flows
- Session resume for delegated agents
- MCP integration
- Automatic code modification by delegated agents (in prompt-only mode)
- Persistent delegation history (in-memory by default; optional JSONL persistence)
- Real token usage statistics (still unavailable — requires real provider-call)
- pi-ai importability fixes for provider-call
- Tag autocomplete (future feature, requires pi-mono completion API)

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm pack --dry-run
```

The test suite uses `tsx` (no test framework). It covers 302 tests:
- All 6 built-in agents load correctly
- Frontmatter parsing (name, description, readonly, temperature, aliases, enabled, recommendedMode)
- Invalid agent name rejection (spaces, slashes, path traversal, uppercase)
- Unknown agent error messages with available agents list
- Alias resolution for all default aliases
- Disabled agent rejection via `enabled: false`, `disabled: true`, and top-level `disabled` array
- Alias pointing to disabled agent is rejected
- `runnerMode: "prompt-only"` backward compatibility
- `runnerMode: "provider-call"` fallback when pi-ai unavailable
- Disabled agent blocks provider-call
- Unknown agent blocks provider-call
- Alias resolution in provider-call mode
- Temperature priority (config > frontmatter > default)
- Model resolution (agent > defaultModel > "current")
- Prompt assembly (task, context, files, mode)
- Config merge (runnerMode, agent overrides)
- History store (add, recent, count, clear, max cap, id generation, getById)
- Metrics computation (counts, per-agent, per-runnerMode)
- determineDelegationStatus (success, fallback, error)
- Status report (runnerMode, provider-call reason, agent list, secret sanitization)
- History table and metrics formatting (with ID column, mode column, replayOf indicator)
- Reload with project-level fixtures, config overrides, error preservation)
- Agent source field (package, project)
- `/agent` command parsing (agent, alias, empty, whitespace, help text)
- `runAndRecordDelegation` (history recording, full task storage, storeFullTask/storeFullContext config)
- Replay (success, new record, non-existent id, disabled agent, alias drift, resolvedAgent priority)
- Output templates (per-agent templates, XML tags, enable/disable, default behavior)
- Output template integration in runner prompt
- `/agent` mode parsing (--mode, -m, invalid mode, alias+mode, quoted task)
- History filter (by agent, status, runnerMode, mode, query, limit, combined criteria)
- Replay with modifications (mode, agent, task, context, files overrides; replayOf; disabled agent)
- Export history (JSON output, privacy stripping, filter support, replayOf included)
- Persistent history (JSONL load, append, retention, nextId, no-op when disabled, write failure resilience)
- **Templates** (load all 7 templates, required fields, getTemplate, unknown template)
- **Create from template** (valid agent file, invalid name, path traversal, unknown template, no-overwrite, force-overwrite, correct name, loadable)
- **Validate** (builtin agents, missing description, empty body, alias conflict, invalid alias, readonly boundary)

## License

MIT — see [LICENSE](LICENSE).
