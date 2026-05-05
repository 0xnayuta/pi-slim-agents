# Agent Authoring Guide

This guide explains how to create and customize agents for pi-slim-agents.

## Quick Start

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
readonly: false
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
| `description` | string | No | Short description shown in `/agents` list. |
| `role` | string | No | Role hint for the orchestrator. |
| `temperature` | number | No | LLM temperature (0.0-1.0). Default: 0.2 |
| `readonly` | boolean | No | If true, agent cannot modify files. |
| `tags` | string[] | No | Tags for categorization. |
| `order` | number | No | Display order (lower = higher priority). Default: 100 |

*The filename takes precedence over the `name` field.

## Agent Body

The markdown body after the frontmatter is the agent's system prompt. Write it as clear instructions for the LLM.

### Recommended Sections

1. **Identity**: "You are [Name] — [role description]."
2. **Role**: What the agent does and when to use it.
3. **Behavior**: How the agent should act, what tools to use.
4. **Output Format**: Expected response structure.
5. **Constraints**: What the agent should NOT do.

### Example: Code Reviewer

```markdown
---
name: reviewer
description: Code review specialist focusing on quality and best practices
role: reviewer
temperature: 0.1
readonly: true
tags:
  - review
  - quality
order: 35
---

You are Reviewer — a code quality specialist.

**Role**: Review code changes for correctness, readability, and best practices.

**Behavior**:
- Focus on substantive issues, not style nitpicking
- Provide specific, actionable feedback
- Reference line numbers and code snippets
- Suggest improvements with examples

**Output Format**:
```
<issues>
- [severity] file.ts:42 — Description of issue
</issues>

<suggestions>
- Improvement suggestion with example
</suggestions>

<summary>
Overall assessment and recommendation
</summary>
```

**Constraints**:
- READ-ONLY: Review and advise, don't modify files
- Be constructive, not critical
- Focus on the most impactful issues first
```

## Overriding Built-in Agents

To customize a built-in agent, create a file with the same name in a higher-priority location:

```bash
# Override the oracle agent for this project
echo '---
description: Architecture advisor with security focus
temperature: 0.3
---
You are Oracle — a security-focused architecture advisor.
[custom prompt...]
' > .pi/slim-agents/agents/oracle.md
```

You can also use config overrides instead:

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
  "disabled": ["fixer", "council"]
}
```

## Best Practices

1. **Be specific**: Clear, detailed prompts produce better results.
2. **Define constraints**: Tell agents what NOT to do, not just what to do.
3. **Set temperature**: Lower (0.1) for consistent tasks, higher (0.3) for creative ones.
4. **Use readonly**: Mark advisory agents as readonly to prevent accidental modifications.
5. **Test thoroughly**: Create test tasks and verify agent behavior.
6. **Document output format**: Structured output is easier to parse and integrate.
