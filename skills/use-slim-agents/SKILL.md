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
| `@orchestrator` | Task coordinator | Decomposition and routing guidance |

## How to Use

### ⚠️  prompt-only mode (default)

In prompt-only mode (the default), **`/agent` and `delegate_agent` return a specialist delegation prompt — they do NOT execute tools, search the codebase, or start a child agent.**

- In prompt-only mode: use the generated prompt to guide the main agent, then ask it to perform the search manually with grep/read/bash.
- Do NOT assume a child agent ran or tools were executed unless provider-call or child-session runner actually executed.
- For real search results in dogfood, use the two-step pattern:

  **Step 1:** `/agent explorer find where X is implemented`
  **Step 2:** Ask the main agent: "Using the Explorer instructions above, actually search the repository for X. Use grep/read/bash and return path:line evidence."

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

Use the `delegate_agent` tool to hand off subtasks.

**Important:** In prompt-only mode, `delegate_agent` returns a specialist prompt — it does NOT execute tools, search the codebase, or start a child agent. After receiving the delegation prompt, the main agent should perform the actual work using its available tools (grep, read, bash, etc.).

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

## Agent Selection Guide

When unsure which agent to use, follow this decision tree:

### 1. Do you know the file location?
- **Yes** → Do you need implementation or design advice?
  - Implementation → Use `fixer`
  - Design review → Use `oracle`
- **No** → Use `explorer` first to find the code

### 2. Does the task involve external documentation or libraries?
- **Yes** → Use `librarian`
- **No** → Continue to step 3

### 3. Does the task involve UI/UX or visual design?
- **Yes** → Use `designer`
- **No** → Continue to step 4

### 4. Is it a complex multi-step task?
- **Yes** → Consider `orchestrator` for guidance on decomposition
- **No** → Handle directly or use the most specific agent

## Delegation Principles

### Don't Over-Delegate
Simple tasks you can handle directly should not be delegated. Delegation has overhead — only use specialists when they add clear value.

**Good**:
- "Find all usages of the auth module" → delegate to `explorer`
- "Review this architecture" → delegate to `oracle`
- "Add a null check" → delegate to `fixer`

**Bad**:
- "What does package.json do?" → delegate to `librarian` (trivial lookup)
- "Fix the typo in README" → delegate to `fixer` (you can do this directly)

### Choose the Right Agent
Each agent has a narrow specialization. Using the wrong agent leads to poor results.

| Task | Wrong Agent | Right Agent |
|------|-------------|-------------|
| Find a file | `oracle` | `explorer` |
| Write code | `oracle` | `fixer` |
| Review design | `fixer` | `oracle` or `designer` |
| Research a library | `explorer` | `librarian` |

### Provide Clear Delegation Tasks
Vague delegation tasks produce vague results. Be specific:

**Good**:
```
delegate_agent({
  agent: "explorer",
  task: "Find where UserService.getProfile() is defined in src/"
})
```

**Bad**:
```
delegate_agent({
  agent: "explorer",
  task: "Look at the user stuff"
})
```

### If Output Lacks Evidence
If an agent's output is too vague or lacks concrete evidence (paths, line numbers, sources), ask it to refocus:

- **explorer** → "Please provide specific file:line references"
- **librarian** → "Please cite the official documentation source"
- **oracle** → "Please be specific — which file/line has the issue?"
- **fixer** → "Please show the exact changes proposed"
- **designer** → "Please provide actionable layout suggestions, not abstract advice"

## When NOT to Delegate

- **Simple tasks** where you have full context — do them yourself
- **Tasks requiring user interaction** — handle directly
- **Quick file lookups** you can do with `read` or `grep` in a few calls
- **Delegation overhead > benefit** — just do it

## Creating Custom Agents

If you need a specialist role that doesn't exist, check templates first:

```
/agents templates
```

If a template fits your needs, create a project-level agent:

```
/agents create security-reviewer security
/agents reload
```

Then validate:

```
/agents validate
```

Keep custom agents narrow in scope:
- ✅ "SQL query optimization specialist"
- ❌ "General coding assistant"

Don't create an agent for every small task — use built-in agents or delegate directly.

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
/agents replay 5 --mode deep       # replay with deeper analysis
/agents replay 5 --agent oracle     # replay with different agent
```

## After Delegation

**In prompt-only mode:** After receiving the delegation prompt from `delegate_agent`, the main agent should:
1. Adopt the specialist's role (use the generated instructions)
2. Perform the actual work using grep/read/bash
3. Return path:line evidence for searches, or structured analysis for reviews

**In provider-call mode (when implemented):** The specialist model will return its own output.

If the delegated task involves code changes or architectural decisions:
- Use **pi-lsp** or the project's **test suite** to verify the results
- Don't blindly trust delegation output — validate before integrating