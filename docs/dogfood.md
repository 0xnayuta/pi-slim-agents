# Dogfooding Guide — pi-slim-agents

This guide helps you test pi-slim-agents in your own development workflow during the dogfood phase.

## Important: prompt-only behavior

**This is the most important thing to understand before dogfooding.**

### What `/agent` does NOT do

In prompt-only mode (the default), `/agent` and `delegate_agent`:

- ❌ Do NOT execute grep, read, bash, or any other tools
- ❌ Do NOT search the codebase
- ❌ Do NOT start a background child agent
- ❌ Do NOT automatically continue running

### What `/agent` DOES do

In prompt-only mode, `/agent`:

- ✅ Returns a structured specialist delegation prompt
- ✅ Shows the agent's role, task, instructions, and expected output format
- ✅ Records the delegation in history

### Example: what you see vs. what you expect

**You type:**
```
/agent explorer find where playback scheduling is implemented
```

**What pi returns:**
```
⚠️  Prompt-only delegation — no tools were executed
   This is a specialist prompt only. No child agent was started.
   Use this prompt to guide the main agent, or ask it to perform
   the search manually with grep/read/bash.

📋 Delegated to @explorer (Codebase navigator)
...

--- Delegation Prompt ---
Agent
@explorer

Role
Codebase navigator

Task
find where playback scheduling is implemented

Instructions
...
--- End ---
```

**You expected:** actual search results with `path:line` evidence

**What you got:** a delegation prompt for the explorer agent

This is **correct behavior** for prompt-only mode — but it may not match your expectations.

---

## How to dogfood correctly

Since prompt-only mode does not execute tools, there are two patterns for effective dogfooding.

### Pattern 1: Two-step (recommended for /agent testing)

**Step 1:** Run `/agent` to generate a delegation prompt:
```
/agent explorer find where playback scheduling is implemented
```

**Step 2:** Ask the main pi session to actually perform the search using the generated prompt:
```
Using the Explorer instructions above, actually search the repository for
playback scheduling. Use grep/read/bash and return path:line evidence.
```

This way you:
1. See the specialist agent's instructions (via `/agent`)
2. Get the actual search results (via the main pi session)

### Pattern 2: Direct search (for real work)

If you need actual search results and don't need to test `/agent` itself:

```
Search the repository for playback scheduling implementation.
Use grep/read/bash. Return path:line evidence.
```

This bypasses `/agent` entirely and gives you direct results.

### Pattern 3: Compare both patterns

For the most useful dogfood feedback, try both patterns and compare:

1. Run `/agent explorer find where X is implemented`
2. Run the direct search for "where X is implemented"
3. Compare the quality of results

Report any differences in quality, completeness, or format.

---

## Dogfooding tasks

### Basic delegation tests

Test each built-in agent to confirm the delegation prompt is well-formed:

```
/agent explorer find where playback scheduling is implemented
/agent oracle review the error handling strategy
/agent fixer add a null check to parseConfig
/agent designer review the button component styles
/agent librarian research the best practices for TypeScript discriminated unions
/agent orchestrator break down adding WebSocket support
```

### Mode variants

```
/agent --mode quick explorer find the main entry point
/agent --mode deep oracle review the overall architecture
/agent -m normal explorer locate the auth middleware
```

### JSON output

```
/agent --format json oracle review this design
```

Verify the JSON includes:
- `runnerMode: "prompt-only"`
- `executed: false`
- `toolsExecuted: false`
- `childSessionStarted: false`
- `note: "Prompt-only delegation..."`

### History and replay

```
/agents history
/agents replay 1 --mode deep
```

### Agent templates

```
/agents templates
/agents create security-reviewer my-security
/agents validate
```

---

## What to look for

### Prompt quality

- Does the delegation prompt clearly explain what the specialist agent should do?
- Is the task, context, and files clearly passed through?
- Does the expected output format make sense?

### Runner behavior

- Does the output clearly indicate it's prompt-only mode?
- Is the ⚠️ banner visible and helpful?
- Are the JSON fields (`executed`, `toolsExecuted`, `childSessionStarted`) correct?

### Documentation clarity

- Does `/agent` without args show helpful guidance?
- Does the README clarify what prompt-only means?
- Is the "Current Limitations" section clear?

### Edge cases

- What happens with invalid agent names?
- What happens with disabled agents?
- What happens with very long task text?

---

## Reporting issues

When reporting dogfood issues, include:

1. **What you typed:** the exact `/agent` command
2. **What you expected:** what you thought would happen
3. **What you got:** the actual output (or a summary)
4. **runnerMode:** check with `/agents status` to confirm the mode
5. **pi version:** run `pi --version` if available

### Where to report

- Bug reports: open an issue on the pi-slim-agents GitHub repo
- Questions: use the pi-mono community channels

---

## Current status

| Feature | Dogfood status | Notes |
|---------|---------------|-------|
| `/agent` shortcut | ✅ Working | Returns delegation prompt in prompt-only mode |
| `delegate_agent` tool | ✅ Working | Returns delegation prompt in prompt-only mode |
| Provider-call runner | ⚠️ Not working | Falls back to prompt-only; pi-ai not importable |
| Child session runner | ❌ Not implemented | Pending pi-mono API |
| Real tool execution | ❌ Not implemented | Requires provider-call or child-session |

---

## Future improvements tracked

See [docs/roadmap.md](roadmap.md) for planned improvements including:
- M14: Provider-call real integration (pending pi-mono ExtensionAPI)
- M15: Token usage tracking
- M17: Child session delegation (pending pi-mono API)
