# Agent Authoring Guide

This guide explains how to create and customize agents for pi-slim-agents.

## Quick Start

### Using Templates (Recommended)

Templates provide ready-made specialist roles you can adapt for your project:

```text
/agents templates
/agents create security-reviewer security
/agents reload
```

Then use `/agents validate` to check for issues.

### Manual Creation

Create a markdown file in one of these locations:

- **Project-level**: `.pi/slim-agents/agents/my-agent.md`
- **User-level**: `~/.pi/agent/slim-agents/agents/my-agent.md`

The filename (without `.md`) becomes the agent name.

## File Format

Agent files use markdown with YAML frontmatter:

```markdown
---
name: my-agent
description: Short description of what this agent does
role: specialist
temperature: 0.2
readonly: true
tags:
  - custom
  - example
order: 50
---

You are My Agent — a specialist in [domain].

**Role**: [What this agent does]

**Behavior**:
- [How the agent should behave]
- [What tools to use]
- [Output format]

**Constraints**:
- [What the agent should NOT do]
```

## Frontmatter Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No* | Agent identifier. Defaults to filename. |
| `description` | string | Yes | Short description shown in `/agents` list. |
| `role` | string | No | Role hint for the orchestrator. |
| `temperature` | number | No | LLM temperature (0.0-1.0). Default: 0.2 |
| `readonly` | boolean | No | If true, agent cannot modify files. Default: false |
| `tags` | string[] | No | Tags for categorization. |
| `order` | number | No | Display order (lower = higher priority). Default: 100 |
| `aliases` | string[] | No | Alternative names for this agent. |
| `recommendedMode` | string | No | Recommended mode: quick, normal, or deep. |

*The filename takes precedence over the `name` field.

## Prompt Writing Guidelines

### Structure Your Prompt

1. **Identity**: "You are [Name] — [role description]."
2. **Role**: What the agent does and when to use it.
3. **Behavior**: How the agent should act, what tools to use.
4. **Output Format**: Expected response structure.
5. **Constraints**: What the agent should NOT do.

### Be Specific

Clear, detailed prompts produce better results:

```markdown
**Role**: Review code for security risks — input validation, auth bypass, sensitive data exposure.

**Behavior**:
- Focus on high-severity issues first
- Reference specific files/lines when found
- Do NOT run automated scanners unless asked
```

### Define Boundaries

Tell agents what NOT to do:

```markdown
**Constraints**:
- READ-ONLY: Review and advise only
- Do NOT modify files
- Do NOT claim to have made changes you didn't
```

### Example: Minimal Custom Agent

```markdown
---
name: my-reviewer
description: Code review specialist focusing on correctness and best practices
role: reviewer
temperature: 0.1
readonly: true
order: 35
tags:
  - review
aliases:
  - review-code
---

You are My Reviewer — a code quality specialist.

**Role**: Review code for correctness, readability, and maintainability.

**Behavior**:
- Focus on substantive issues, not style
- Provide specific feedback with file:line references
- Suggest improvements with examples

**Output Format**:
```
<issues>
- [severity] file.ts:42 — Description
</issues>

<summary>
Overall assessment
</summary>
```

**Constraints**:
- READ-ONLY: Review and advise only
- Be constructive, not critical
```

### Example: C++ Reviewer Agent

For C/C++ projects, pair with `pi-lsp` for clangd diagnostics:

```markdown
---
name: cpp-reviewer
description: C/C++ code reviewer for memory safety, CMake, and clangd diagnostics
role: cpp-reviewer
temperature: 0.1
readonly: true
order: 38
tags:
  - cpp
  - cmake
aliases:
  - cpp
---

You are C++ Reviewer — a specialist for C/C++ code review.

**Role**: Review C/C++ code for memory safety, correctness, and CMake configuration.

**Behavior**:
- Check for null pointers, buffer overflow, use-after-free patterns
- Review CMake/CONFIGURE lists usage
- When `lsp_diagnostics` is available, use it to supplement your review

**Output Format**:
```
<summary>
Overall assessment
</summary>

<issues>
- [severity] [file:line] — Issue and fix
</issues>
```

**Constraints**:
- READ-ONLY: Review and advise only
- Prioritize correctness over style
- Do NOT run compiler builds unless asked
```

## Alias Design Rules

Aliases let users call agents by alternative names:

```markdown
aliases:
  - search
  - find
  - locate
```

Rules:
- Only lowercase letters, numbers, hyphens, underscores
- Must be unique across ALL agents (built-in + custom)
- Cannot match another agent's name
- Shorter is better: `fix` beats `fix-it-now`

Common patterns:
- `search`, `find`, `locate` → explorer
- `docs`, `research`, `library` → librarian
- `arch`, `review`, `judge` → oracle
- `fix`, `implement`, `patch` → fixer

## readonly=false Guidelines

Agents with `readonly: false` can modify files. Write prompts that:

1. **Clearly state when modification is authorized**

```markdown
**Constraints**:
- ONLY modify files when explicitly authorized by the user
- Do NOT claim to have modified files if you only proposed changes
```

2. **Define the scope of changes**

```markdown
**Scope**:
- Small, bounded changes (null checks, typo fixes, simple refactors)
- Test files when explicitly authorized
- Do NOT make architectural changes without user confirmation
```

## Validation

Run `/agents validate` to check your agents for issues:

```text
/agents validate
```

Checks:
- Frontmatter parsing errors
- Missing required fields (description)
- Empty prompt body
- Invalid alias names
- Alias conflicts with other agents
- readonly=false without modification boundaries

## Common Errors

### Alias Conflict

```
❌ Alias "arch" of agent "my-agent" conflicts with alias of agent "oracle"
```

**Fix**: Choose a different alias or remove the conflicting one.

### Invalid Agent Name

Agent names must be lowercase letters, numbers, hyphens, and underscores only.

**Fix**: Rename the file from `My Agent.md` to `my-agent.md`.

### Empty Prompt Body

**Fix**: Add content after the frontmatter `---`:

```markdown
---
name: my-agent
description: My agent
---

You are My Agent — a specialist in [domain].
```

### readonly=false Without Boundary

Agents that can modify files should clearly state when modification is authorized.

**Fix**: Add constraint text like:
```markdown
**Constraints**:
- ONLY modify files when explicitly authorized by the user
- Do NOT claim to have modified files if you only proposed changes
```

### Role Too Vague

"Your agent should be good at everything" doesn't help the delegation prompt.

**Fix**: Focus on a narrow domain:
- ✅ "Code reviewer specializing in security vulnerabilities"
- ❌ "General helpful assistant"

## Overriding Built-in Agents

To customize a built-in agent, create a file with the same name in a higher-priority location:

```bash
# Override the oracle agent for this project
cat > .pi/slim-agents/agents/oracle.md << 'EOF'
---
description: Security-focused architecture advisor
temperature: 0.3
---
You are Oracle — a security-focused architecture advisor.

**Role**: Provide architectural guidance with security as the first priority.
...
EOF
```

You can also use config overrides:

```json
// .pi/slim-agents.json
{
  "agents": {
    "oracle": {
      "description": "Security-focused advisor",
      "temperature": 0.3,
      "appendPrompt": "Always consider security implications first."
    }
  }
}
```

## Disabling Agents

Disable agents via config:

```json
{
  "agents": {
    "fixer": {
      "disabled": true
    }
  }
}
```

Or globally:

```json
{
  "disabled": ["fixer", "designer"]
}
```

## Best Practices

1. **Be specific**: Clear, detailed prompts produce better results.
2. **Define constraints**: Tell agents what NOT to do, not just what to do.
3. **Set temperature**: Lower (0.1) for consistent tasks, higher (0.3) for creative ones.
4. **Use readonly**: Mark advisory agents as readonly to prevent accidental modifications.
5. **Keep prompts short**: Agents receive delegation context; detailed instructions belong in the prompt.
6. **Narrow职责**: A specialist in "SQL query optimization" beats a "database expert".

## Integration with pi-lsp

For C/C++ projects, the `cpp-reviewer` template mentions using `lsp_diagnostics` from pi-lsp:

```markdown
**Behavior**:
- When `lsp_diagnostics` is available, use it to supplement your review
- Reference clangd diagnostics alongside your analysis
```

This lets the agent combine static analysis (your review) with real-time compiler diagnostics.

## Templates Reference

| Template | readonly | Best For |
|----------|----------|----------|
| security-reviewer | yes | Input validation, auth, dependency risks |
| test-writer | no | Test plans, test cases |
| doc-generator | no | README, API docs, changelogs |
| refactor-planner | yes | Cleanup plans |
| bug-triager | yes | Bug source narrowing |
| release-checker | yes | Version bumps, dry-runs |
| cpp-reviewer | yes | C/C++ memory safety, CMake |

See `/agents templates` for the full list with descriptions.
