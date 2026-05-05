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
- **Architecture review / debugging strategy** → `oracle` / `arch` / `review`
- **UI/UX review** → `designer` / `ui` / `ux`
- **Small bounded implementation** → `fixer` / `fix` / `implement`

## When NOT to Delegate

- **Simple tasks** where you have full context — do them yourself
- **Tasks requiring user interaction** — handle directly
- **Quick file lookups** you can do with `read` or `grep` in a few calls
- **Delegation overhead > benefit** — just do it

## After Delegation

If the delegated task involves code changes or architectural decisions:
- Use **pi-lsp** or the project's **test suite** to verify the results
- Don't blindly trust delegation output — validate before integrating
