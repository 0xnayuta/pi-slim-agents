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
  mode: "review"
})
```

## When to Delegate

- **Parallel work**: Multiple independent searches or implementations
- **Specialist expertise**: Architecture decisions → oracle, docs → librarian
- **Context isolation**: Keep main context clean by delegating focused tasks
- **Bounded implementation**: Well-defined code changes → fixer

## When NOT to Delegate

- Simple tasks where you have full context
- Tasks that require back-and-forth with the user
- When delegation overhead exceeds doing it yourself
