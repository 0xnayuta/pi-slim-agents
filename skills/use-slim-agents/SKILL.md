---
name: use-slim-agents
description: Use pi-slim-agents to delegate tasks to specialist agents for focused expert work
---

# Use Slim Agents

Delegate subtasks to specialist agents for better quality, speed, and focus.

## Available Agents

| Agent | Role | Best For |
|-------|------|----------|
| `@explorer` | Codebase navigator | Finding files, locating code patterns, "where is X?" |
| `@librarian` | Doc researcher | Library docs, API references, best practices |
| `@oracle` | Strategic advisor | Architecture review, complex debugging, code review |
| `@designer` | UI/UX specialist | Styling, responsive design, component architecture, visual polish |
| `@fixer` | Implementation | Bounded code changes, test writing, bug fixes |

## How to Use

### Quick shortcut (user-facing)

Users can directly invoke an agent via the `/agent` command:

```
/agent explorer find playback speed implementation
/agent arch review the error handling strategy
/agent fixer add a null check in parseConfig
```

**With mode flag for different depth:**

```
/agent --mode deep oracle review the architecture
/agent -m quick explorer find playback code
/agent --mode normal designer review the UI flow
```

Modes:
- `quick` — Fast, brief answers for quick lookups
- `normal` — Balanced depth (default) for most tasks
- `deep` — Thorough analysis for architecture, risks, complex review

### Delegation tool (agent-facing)

Use the `delegate_agent` tool to hand off subtasks:

```
delegate_agent({
  agent: "explorer",
  task: "Find all files that import the authentication module",
  files: ["src/auth/"]
})
```

```
delegate_agent({
  agent: "oracle",
  task: "Review the error handling in src/api/ and suggest improvements",
  context: "We've been seeing intermittent 500 errors in production",
  files: ["src/api/handler.ts", "src/api/middleware.ts"],
  mode: "deep"
})
```

## When to Delegate

- **Codebase search** → `explorer` / `search` / `find`
- **Docs / library research** → `librarian` / `docs` / `research`
- **Architecture review / debugging strategy** → `oracle` / `arch` / `review` (use `--mode deep`)
- **UI/UX review** → `designer` / `ui` / `ux`
- **Small bounded implementation** → `fixer` / `fix` / `implement`

## Using History and Replay

### Check previous delegations

```
/agents history
/agents history --agent oracle
/agents history --status error
/agents history --query playback
```

### Replay a delegation

```
/agents replay 5                    # replay with original params
/agents replay 5 --mode deep        # replay with deeper analysis
/agents replay 5 --agent oracle     # replay with different agent
```

## When NOT to Delegate

- **Simple tasks** where you have full context — do them yourself
- **Tasks requiring user interaction** — handle directly
- **Quick file lookups** you can do with `read` or `grep` in a few calls
- **Delegation overhead > benefit** — just do it

## After Delegation

If the delegated task involves code changes or architectural decisions:
- Use **pi-lsp** or the project's **test suite** to verify the results
- Don't blindly trust delegation output — validate before integrating
