# Design Document — pi-slim-agents

## Philosophy

**pi-slim-agents** brings lightweight specialist agent roles to pi-mono, inspired by the multi-agent patterns in [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) but without the full orchestration framework.

### Key Principles

1. **Markdown-first**: Agents are defined as `.md` files with YAML frontmatter. No TypeScript required to create or customize agents.
2. **Zero runtime overhead**: No background processes, no scheduling, no multiplexing. Agents are invoked on-demand via the `delegate_agent` tool.
3. **Prompt-based delegation** (v1): The delegation prompt is returned to the main LLM, which adopts the specialist's role to complete the task. This is simple and effective.
4. **Extensible**: Users can add custom agents at project or user level without modifying the package.

## Architecture

```
┌─────────────────────────────────────────────┐
│                pi-mono session               │
│                                             │
│  ┌────────────────────────────────────────┐  │
│  │         slim-agents extension          │  │
│  │                                        │  │
│  │  ┌──────────┐  ┌───────────────────┐   │  │
│  │  │ /agents   │  │ delegate_agent    │   │  │
│  │  │ command   │  │ tool              │   │  │
│  │  └──────────┘  └────────┬──────────┘   │  │
│  │                         │              │  │
│  │  ┌──────────────────────▼──────────┐   │  │
│  │  │        Agent Loader             │   │  │
│  │  │  project > user > package       │   │  │
│  │  └──────────────────────┬──────────┘   │  │
│  │                         │              │  │
│  │  ┌──────────────────────▼──────────┐   │  │
│  │  │        Runner (v1)              │   │  │
│  │  │  builds delegation prompt       │   │  │
│  │  └─────────────────────────────────┘   │  │
│  └────────────────────────────────────────┘  │
│                                             │
│  agents/orchestrator.md                     │
│  agents/explorer.md                         │
│  agents/librarian.md                        │
│  agents/oracle.md                           │
│  agents/designer.md                         │
│  agents/fixer.md                            │
└─────────────────────────────────────────────┘
```

## Agent Loading Priority

Agents are discovered from three locations. For the same agent name, the highest-priority source wins:

1. **Project-level** — `.pi/slim-agents/agents/*.md` (team-shared customizations)
2. **User-level** — `~/.pi/agent/slim-agents/agents/*.md` (personal customizations)
3. **Package built-in** — `agents/*.md` (bundled with the npm package)

## Configuration

Configuration is loaded from two files, merged (project overrides user):

- `~/.pi/agent/slim-agents.json` — User-level defaults
- `.pi/slim-agents.json` — Project-level overrides

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

## Delegation Model

### v1: Prompt-Based Delegation

When `delegate_agent` is called:
1. The runner loads the target agent's prompt
2. Builds a structured delegation prompt with task, context, and files
3. Returns the prompt as a tool result
4. The main LLM reads the result and adopts the specialist role

This is simple, works within the pi extension API, and produces good results because the main LLM is already capable.

### v2 (planned): Child Session Delegation

When pi-mono exposes child session / provider call APIs:
1. The runner creates an independent model call with the specialist's system prompt
2. The specialist runs in its own context, not polluting the main session
3. Results are streamed back and integrated

## Relationship to oh-my-opencode-slim

pi-slim-agents is **inspired by** but does **not copy** oh-my-opencode-slim. Key differences:

| Aspect | oh-my-opencode-slim | pi-slim-agents |
|--------|-------------------|----------------|
| Platform | OpenCode plugin | pi-mono extension |
| Agents | TypeScript-defined | Markdown + frontmatter |
| Runtime | Full orchestration (scheduler, council, multiplexer) | Minimal prompt-based delegation |
| Custom agents | Config-based overrides | File-based (project/user/package) |
| Dependencies | OpenCode SDK | pi-coding-agent only |
