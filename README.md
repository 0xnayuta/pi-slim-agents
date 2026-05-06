# pi-slim-agents

Lightweight specialist agents for [pi-mono](https://github.com/mariozechner/pi-coding-agent) without heavy subagent orchestration.

## Status

**v0.1.0 — Release Candidate**

This is the first release of pi-slim-agents. The core delegation system is functional and ready for use. npm publication is pending.

| Feature | Status |
|---------|--------|
| Prompt-only delegation | ✅ Stable (default) |
| Provider-call runner | ⚠️ Architectural only (falls back to prompt-only) |
| Built-in agents | ✅ 6 agents ready |
| `/agent` shortcut | ✅ Supported |
| Templates | ✅ 7 templates available |
| JSON output | ✅ All commands |
| History / metrics | ✅ Supported |
| Replay | ✅ Supported |
| Tags / search / filter | ✅ Supported |

### What this is NOT

pi-slim-agents is NOT:
- A full subagent framework
- A tmux pane runner
- A worktree manager
- A scheduler
- A council/voting system
- An autonomous agent executor

It is a lightweight specialist delegation layer that helps the main agent call focused role prompts.

## Features

- **6 built-in specialist agents**: explorer, librarian, oracle, fixer, designer, orchestrator
- **Agent aliases**: `search` → `explorer`, `arch` → `oracle`, etc.
- **Tags and filtering**: `/agents --tag review --readonly`
- **7 templates**: security-reviewer, test-writer, doc-generator, refactor-planner, bug-triager, release-checker, cpp-reviewer
- **`/agent` shortcut**: `/agent explorer find playback code`
- **`--mode` flag**: quick, normal, deep
- **History**: `/agents history --agent oracle --limit 20`
- **Replay**: `/agents replay 5 --mode deep`
- **Metrics**: `/agents metrics`
- **JSON output**: `--format json` on all commands
- **Prompt eval examples**: `examples/prompt-evals/` with static checker

## Installation

### From npm (after release)

```bash
pi install npm:@0xnayuta/pi-slim-agents
```

> **Note**: npm publication is pending. After release, the command above will work.

### Local development

```bash
pnpm install
pnpm build
pi install /path/to/pi-slim-agents
```

### Verify installation

```bash
/agents
```

Should show 6 built-in agents.

## Quick Start

### List agents

```text
/agents
```

### Delegate a task

```text
/agent explorer find playback speed implementation
/agent oracle review this design
/agent fixer add null check to parseConfig
```

### With mode

```text
/agent --mode deep oracle review the architecture
/agent -m quick explorer find playback code
```

### With JSON output

```text
/agent --format json oracle review this design
/agent --mode deep --format json arch review the architecture
```

### Use templates

```text
/agents templates
/agents create security-reviewer security
/agents validate
/agents reload
```

### Check history and metrics

```text
/agents history
/agents metrics
/agents replay 5
```

### JSON output

```text
/agents --format json
/agent --format json oracle review this design
/agents history --format json
```

## Built-in Agents

| Agent | Role | Best For | Read-only |
|-------|------|----------|-----------|
| `explorer` | Codebase navigator | Finding files, locating code patterns | yes |
| `librarian` | Documentation researcher | Library docs, API references, best practices | yes |
| `oracle` | Strategic advisor | Architecture review, complex debugging, code review | yes |
| `fixer` | Implementation specialist | Bounded code changes, tests, bug fixes | no |
| `designer` | UI/UX specialist | Styling, responsive design, visual polish | no |
| `orchestrator` | Task coordinator | Decomposition and routing guidance | no |

### Agent Aliases

| Alias | Resolves To |
|-------|------------|
| `search`, `find`, `locate` | `explorer` |
| `docs`, `research`, `library` | `librarian` |
| `arch`, `review`, `judge` | `oracle` |
| `fix`, `implement`, `patch` | `fixer` |
| `ui`, `ux`, `design` | `designer` |
| `route`, `router` | `orchestrator` |

## Templates

Templates are starting points for creating project-level agents. They are **not enabled by default**.

| Template | Best For |
|----------|----------|
| `security-reviewer` | Input validation, auth, dependency risks |
| `test-writer` | Test plans, test cases, coverage gaps |
| `doc-generator` | README, API docs, changelogs |
| `refactor-planner` | Cleanup plans, modernization guidance |
| `bug-triager` | Narrowing down bug sources |
| `release-checker` | Version bumps, changelogs, dry-runs |
| `cpp-reviewer` | Memory safety, CMake, clangd diagnostics |

### Using templates

```text
/agents templates                                    # List all templates
/agents create security-reviewer my-security         # Create from template
/agents validate                                    # Validate created agents
/agents reload                                      # Activate new agents
```

## Configuration

Create `.pi/slim-agents.json` in your project root:

```json
{
  "runnerMode": "prompt-only",
  "outputTemplate": true,
  "agents": {
    "designer": {
      "enabled": true
    }
  }
}
```

### Configuration options

| Option | Default | Description |
|--------|---------|-------------|
| `runnerMode` | `"prompt-only"` | Delegation mode |
| `outputTemplate` | `true` | Use structured output templates |
| `agents.<name>.enabled` | `true` | Enable/disable specific agents |
| `agents.<name>.temperature` | `0.2` | Temperature for provider-call |
| `history.persistent` | `false` | Store history in JSONL file |
| `history.retention` | `200` | Max history records |

### Persistent history

```json
{
  "history": {
    "persistent": true,
    "path": ".pi/slim-agents/history.jsonl",
    "retention": 200
  }
}
```

Add to `.gitignore`:
```
.pi/slim-agents/history.jsonl
```

## JSON Output

All commands support `--format json`:

```text
/agents --format json
/agent --format json oracle review this design
/agents status --format json
/agents history --format json
/agents metrics --format json
/agents templates --format json
/agents validate --format json
```

### JSON envelope

```json
{
  "schemaVersion": 1,
  "kind": "agents",
  "filters": {},
  "count": 6,
  "items": [...]
}
```

### Example: delegation result

```json
{
  "schemaVersion": 1,
  "kind": "agentResult",
  "requestedAgent": "oracle",
  "resolvedAgent": "oracle",
  "aliasUsed": false,
  "mode": "deep",
  "runnerMode": "prompt-only",
  "status": "success",
  "durationMs": 123,
  "historyId": 12,
  "replayOf": null,
  "providerCall": {
    "available": false,
    "fallback": false,
    "reason": "Provider-call not available in this environment"
  },
  "task": {
    "summary": "review this design"
  },
  "output": {
    "text": "Delegated to @oracle...",
    "format": "text"
  }
}
```

### Privacy

No API keys, no full prompts, no full task text in JSON output.

## History and Replay

```text
/agents history                              # Recent delegations
/agents history --agent oracle              # Filter by agent
/agents history --status error              # Filter by status
/agents history --limit 20                  # More results
/agents history --query playback            # Search

/agents replay 5                             # Replay delegation
/agents replay 5 --mode deep                 # Replay with deeper analysis
/agents replay 5 --agent oracle              # Replay with different agent
/agents replay 5 --files src/a.ts,src/b.ts   # Replay with comma-separated file list

/agents export-history                       # Export as JSON
/agents metrics                              # Delegation statistics
```

## Prompt Eval Examples

Lightweight eval cases for all built-in agents and templates are in `examples/prompt-evals/`.

### Run static checks

```bash
pnpm test:prompts
```

This checks:
- All eval files exist
- Each agent has 3+ eval cases
- Required fields present
- Agent prompts have boundary constraints

See [examples/prompt-evals/README.md](examples/prompt-evals/README.md) for details.

## Development

```bash
# Install dependencies
pnpm install

# Type check
pnpm typecheck

# Build
pnpm build

# Run all tests
pnpm test

# Run agent tests only
pnpm test:agents

# Run prompt eval checks only
pnpm test:prompts

# Check package contents
pnpm check:package

# Dry-run pack
pnpm pack:dry

# Full release check
pnpm release:check
```

## Current Limitations

This version intentionally does NOT support:

- **Real model calls via provider-call** — falls back to prompt-only
- **Agent-to-agent delegation** — not in scope
- **Agent composition or pipelines** — not in scope
- **Provider-call streaming** — not in scope
- **Spawning pi subprocesses** — not in scope
- **Worktree isolation** — not in scope
- **Scheduler / cron orchestration** — not in scope
- **Council / voting flows** — not in scope
- **Child session delegation** — pending pi-mono API
- **Token usage tracking** — requires real provider-call
- **MCP integration** — not in scope

### Provider-call status

The provider-call runner is architecturally complete but cannot make real model calls due to pnpm strict module resolution preventing import of `@mariozechner/pi-ai`. When provider-call is unavailable, the runner gracefully falls back to prompt-only.

Use `/agents status` to check provider-call availability.

See [docs/provider-call.md](docs/provider-call.md) for the full investigation.

## Roadmap

See [docs/roadmap.md](docs/roadmap.md) for milestone history and future plans.

Potential future milestones:
- M14: Provider-call real integration (pending pi-mono ExtensionAPI)
- M15: Token usage tracking
- M16: Tag autocomplete in `/agent`
- M17: Child session delegation (pending pi-mono API)

## Documentation

- [docs/design.md](docs/design.md) — Architecture and design
- [docs/agent-authoring.md](docs/agent-authoring.md) — Agent creation guide
- [docs/provider-call.md](docs/provider-call.md) — Provider-call investigation
- [docs/prompt-tuning.md](docs/prompt-tuning.md) — Prompt quality checklist
- [docs/roadmap.md](docs/roadmap.md) — Feature roadmap
- [examples/prompt-evals/README.md](examples/prompt-evals/README.md) — Eval examples guide

## License

MIT — see [LICENSE](LICENSE).

## Attribution

Inspired by [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim).

**Important**: This project is NOT an OpenCode plugin and does not port the full oh-my-opencode-slim runtime. It only adapts the lightweight specialist-agent design idea and rewrites it as a pi-mono extension.