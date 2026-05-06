# Prompt Evals

This directory contains lightweight, human-readable evaluation cases for built-in agents and templates.

## Purpose

These evals are NOT automatic benchmarks. They are:
- **Human-readable spec sheets** — define what good output looks like
- **Semi-automated checks** — static checks verify structure, not quality
- **Prompt tuning references** — guide small, targeted prompt changes
- **Failure mode documentation** — document common anti-patterns

## Structure

```
examples/prompt-evals/
  README.md                    # This file
  explorer.eval.md             # 3+ cases for explorer
  librarian.eval.md            # 3+ cases for librarian
  oracle.eval.md               # 3+ cases for oracle
  fixer.eval.md                # 3+ cases for fixer
  designer.eval.md             # 3+ cases for designer
  orchestrator.eval.md         # 3+ cases for orchestrator
  template-evals.md            # Cases for all templates
```

## Eval Case Format

Each eval case follows this structure:

```markdown
## Case: <name>

Agent:
<agent-name>

Mode:
quick | normal | deep

Task:
<what to ask the agent>

Context:
<additional context if needed>

Expected behavior:
- Should do X
- Should do Y
- Should NOT do Z
- Output should include field A
- Output should NOT exceed N lines

Good output characteristics:
- Short and focused
- Evidence-based
- No fake tool claims
- Bounded scope

Bad output examples / failure modes:
- Vague descriptions without paths
- Over-engineered solutions
- Claims to have modified files (read-only agent)
- Output too long (>500 words)
- Scope creep beyond the task
```

## Running Static Checks

```bash
pnpm test:prompts
```

This runs `scripts/check-prompt-evals.ts` which performs:
1. All eval files exist
2. Each agent has at least 3 eval cases
3. Each eval case has required fields (Agent, Task, Expected behavior)
4. Built-in agent files are non-empty
5. Agent prompts contain boundary constraints
6. `docs/prompt-tuning.md` exists and contains checklist

## Adding Eval Cases

When adding a new eval case:

1. Add it to the appropriate `.eval.md` file
2. Follow the format above
3. Include both **good** and **bad** output characteristics
4. Keep cases focused on one specific scenario
5. Update `scripts/check-prompt-evals.ts` if adding new validation rules

## Not Included (by design)

- LLM-based scoring
- Automatic execution against real codebases
- Token cost tracking
- Side-by-side prompt comparison
- Continuous integration benchmarks

These are lightweight human-in-the-loop evals for prompt tuning, not automated performance tests.