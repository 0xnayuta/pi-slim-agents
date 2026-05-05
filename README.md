# pi-slim-agents

Lightweight specialist agents for [pi-coding-agent](https://github.com/mariozechner/pi-coding-agent). This package adds a small set of expert role prompts and a `delegate_agent` tool with configurable runner modes.

## Current status

**v0.3.0 supports two runner modes:**

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

### Provider-call status

The provider-call runner attempts to call the model via `@mariozechner/pi-ai`'s `complete()` function using the current session model and API key. Currently, `@mariozechner/pi-ai` is not directly importable from the extension's module context due to pnpm strict module resolution. When the import fails, the runner gracefully falls back to prompt-only mode with a clear message.

When the pi-mono Extension API adds a direct model calling method (or pi-ai becomes importable), the provider-call runner will make real model calls automatically.

## Built-in agents

| Agent | Role | Best For | Read-only |
|-------|------|----------|-----------|
| `orchestrator` | Task coordinator | Decomposition and routing guidance | no |
| `explorer` | Codebase navigator | Finding files, locating code patterns, "where is X?" | yes |
| `librarian` | Documentation researcher | Library docs, API references, best practices | yes |
| `oracle` | Strategic advisor | Architecture review, debugging strategy, code review | yes |
| `designer` | UI/UX specialist | UI/UX, styling, responsive design, interaction review | no |
| `fixer` | Implementation specialist | Small bounded code changes, tests, bug fixes | no |

## Installation for local development

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm pack --dry-run
pi install /path/to/pi-slim-agents
```

The package manifest points pi at `./dist/index.js`, so run `pnpm build` before installing from a local path.

## Usage

### List available agents

```text
/agents
```

Expected shape:

```text
# Available Agents

- @orchestrator — AI task orchestrator that decomposes work and delegates to specialist agents — readonly: no
  aliases: route, router
- @explorer — Fast codebase search and pattern matching specialist — readonly: yes
  aliases: search, find, locate
- @librarian — Documentation and library research specialist — readonly: yes
  aliases: docs, research, library
- @oracle — Strategic technical advisor, code reviewer, and architecture consultant — readonly: yes
  aliases: arch, review, judge
- @designer — Frontend UI/UX specialist for intentional, polished visual experiences — readonly: no
  aliases: ui, ux, design
- @fixer — Fast, focused implementation specialist for bounded code changes — readonly: no
  aliases: fix, implement, patch
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
|-------|-------------|
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

## Custom agents

Project-level agents:

```text
.pi/pi-slim-agents/agents/my-agent.md
```

User-level agents:

```text
~/.pi/agent/pi-slim-agents/agents/my-agent.md
```

Agent names must use only lowercase letters, numbers, hyphens, and underscores.

Example:

```markdown
---
name: my-agent
description: Custom project-specific agent
role: specialist
temperature: 0.2
readonly: true
tags:
  - custom
aliases:
  - mine
  - custom
---

You are My Agent — a specialist in a narrow domain.
```

Loading priority for the same name:

1. Project-level `.pi/pi-slim-agents/agents/*.md`
2. User-level `~/.pi/agent/pi-slim-agents/agents/*.md`
3. Package built-in `agents/*.md`

## Current limitations

This version intentionally does **not** support:

- Spawning pi subprocesses or child processes
- True background agents or parallel execution
- Worktree isolation or environment sandboxing
- Scheduler or cron-style orchestration
- Council / voting flows
- Session resume for delegated agents
- MCP integration
- Automatic code modification by delegated agents

## Development

```bash
pnpm install
pnpm typecheck
pnpm build
pnpm test
pnpm pack --dry-run
```

The test suite uses `tsx` (no test framework). It covers:
- All 6 built-in agents load correctly
- Frontmatter parsing (name, description, readonly, temperature, aliases, enabled)
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

## License

MIT — see [LICENSE](LICENSE).
