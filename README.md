# pi-slim-agents

Lightweight specialist agents for [pi-coding-agent](https://github.com/mariozechner/pi-coding-agent) — lean expert roles without heavy orchestration.

**Inspired by** [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim)'s multi-agent patterns, but this project does not copy the full framework. It ports only the lightweight specialist role concept as a pi-mono extension.

## What is this?

pi-slim-agents is a [pi-mono extension package](https://github.com/mariozechner/pi-coding-agent/blob/main/docs/packages.md) that adds specialist agent roles to your pi session:

| Agent | Role | Best For |
|-------|------|----------|
| **@orchestrator** | Task coordinator | Decomposing complex work, routing to specialists |
| **@explorer** | Codebase navigator | Finding files, locating code patterns, "where is X?" |
| **@librarian** | Doc researcher | Library docs, API references, best practices |
| **@oracle** | Strategic advisor | Architecture review, complex debugging, code review |
| **@designer** | UI/UX specialist | Styling, responsive design, component architecture, visual polish |
| **@fixer** | Implementation | Bounded code changes, test writing, bug fixes |

## Installation

```bash
# Install from npm (when published)
pi install npm:@0xnayuta/pi-slim-agents

# Install from local path (for development)
pi install /path/to/pi-slim-agents

# Install from git
pi install git:github.com/your-user/pi-slim-agents
```

## Usage

### List available agents

```
/agents
```

### Delegate to an agent

The LLM can call the `delegate_agent` tool:

```
delegate_agent({
  agent: "explorer",
  task: "Find all files that import the auth module",
  files: ["src/auth/"]
})
```

```
delegate_agent({
  agent: "oracle",
  task: "Review error handling in the API layer",
  context: "We've been seeing intermittent 500 errors",
  files: ["src/api/handler.ts"],
  mode: "review"
})
```

## Custom Agents

### Project-level (team-shared)

Create `.pi/slim-agents/agents/my-agent.md`:

```markdown
---
description: Custom project-specific agent
role: specialist
temperature: 0.2
tags:
  - custom
---

You are My Agent — a specialist in [domain].

**Role**: [What you do]

**Behavior**:
- [How to act]
- [What tools to use]

**Constraints**:
- [What not to do]
```

### User-level (personal)

Create `~/.pi/agent/slim-agents/agents/my-agent.md` with the same format.

### Priority

Agent loading priority (highest wins for same name):
1. Project-level `.pi/slim-agents/agents/*.md`
2. User-level `~/.pi/agent/slim-agents/agents/*.md`
3. Package built-in `agents/*.md`

## Configuration

Configuration files (project overrides user):

- `~/.pi/agent/slim-agents.json` — User defaults
- `.pi/slim-agents.json` — Project overrides

```json
{
  "agents": {
    "oracle": {
      "temperature": 0.3,
      "appendPrompt": "Focus on security concerns."
    },
    "fixer": {
      "disabled": true
    }
  },
  "disabled": ["council"],
  "extraAgentDirs": ["./custom-agents"]
}
```

See [docs/agent-authoring.md](docs/agent-authoring.md) for the full agent authoring guide.

## Design

See [docs/design.md](docs/design.md) for architecture details.

Key design decisions:
- **Markdown-first**: Agents are `.md` files with YAML frontmatter
- **Prompt-based delegation** (v1): Delegation returns a structured prompt for the main LLM
- **Zero runtime overhead**: No background processes, no scheduling
- **Extensible**: Custom agents at project or user level

## Roadmap

See [docs/roadmap.md](docs/roadmap.md) for the full roadmap.

- **v0.1.0** (current): Project skeleton, built-in agents, prompt-based delegation
- **v0.2.0**: Enhanced delegation, metrics, aliases
- **v0.3.0**: Child session delegation (when pi-mono API supports it)
- **v0.4.0**: Agent templates, composition, testing utilities

## Development

```bash
# Install dependencies
pnpm install

# Type-check
pnpm exec tsc --noEmit

# Test locally with pi
pi install /path/to/pi-slim-agents
```

## License

MIT — See [LICENSE](LICENSE)
