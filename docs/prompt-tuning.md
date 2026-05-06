# Prompt Tuning Guide

This document covers the principles and process for fine-tuning built-in agent prompts based on real-world usage feedback.

## Prompt Quality Checklist

Use this checklist when creating or updating agent prompts:

- [ ] **Does the agent have a narrow role?**
  - Can you describe the agent's purpose in one sentence?
  - Is the scope clearly bounded (e.g., "find code", "review security", "implement small fixes")?
  - Does it avoid generic helpfulness (e.g., "can do anything")?

- [ ] **Does it clearly say what NOT to do?**
  - Is there a Constraints or Boundaries section?
  - Does it explicitly state read-only vs. writable behavior?
  - Does it warn against common failure modes for this agent?

- [ ] **Does it avoid claiming tool actions it cannot perform?**
  - Does a read-only agent explicitly say it won't modify files?
  - Does a writable agent clarify when modification is authorized?
  - Does it avoid phrases like "I will fix this" in prompt-only mode?

- [ ] **Does it prefer evidence over speculation?**
  - Does it require `path:line` references for findings?
  - Does it ask for sources when citing documentation?
  - Does it warn when evidence is thin?

- [ ] **Does it produce bounded output?**
  - Is there a max output size or line count constraint?
  - Does the output format specify what to include and exclude?
  - Does it avoid open-ended analysis?

- [ ] **Does it avoid duplicating another agent's role?**
  - Is the boundary with similar agents clear?
  - Does it explain when to use this agent vs. another?
  - Does it avoid scope creep into other agents' domains?

- [ ] **Does it work with quick / normal / deep modes?**
  - Is the behavior appropriate for all three modes?
  - Does quick mode stay brief?
  - Does deep mode add analysis without becoming verbose?

- [ ] **Does it remain short enough to avoid context bloat?**
  - Is it under 500 words?
  - Are there redundant phrases that can be cut?
  - Is the output format concise?

## Common Failure Modes by Agent

### explorer
- Finds no results but invents file paths instead of saying "no matches found"
- Becomes an architecture reviewer — suggests design changes instead of finding code
- Returns too many files (50+) without filtering or prioritizing
- Omits line numbers and relies on descriptions instead of evidence
- Makes architectural judgments beyond code location

### librarian
- Fabricates documentation sources or APIs that don't exist
- Doesn't distinguish between official documentation and community tutorials
- Provides outdated recommendations without noting uncertainty
- Gives full tutorials when user only needed a quick reference
- Suggests libraries without checking if they're in the project's dependencies

### oracle
- Over-engineers — proposes complex abstractions for simple problems
- Fails to give a clear verdict — says "it depends" without recommendation
- Provides abstract advice that can't be executed (e.g., "improve the architecture")
- Outputs too much content (>500 words) for quick questions
- Cites specific files/lines incorrectly — critiques code it didn't read

### fixer
- Expands scope beyond the requested fix
- Claims to have modified files in prompt-only mode (should propose changes only)
- Introduces new dependencies without authorization
- Rewrites entire functions instead of making minimal targeted changes
- Fails to read existing code before making edits

### designer
- Provides abstract advice like "make it more beautiful" without specifics
- Gives implementation details (React components, CSS) when only design review was requested
- Ignores the project's existing design system or style
- Proposes complete redesigns instead of targeted improvements
- Doesn't provide actionable guidance on layout, hierarchy, or interaction

### orchestrator
- Over-delegates — sends simple tasks to specialists when main agent can handle them
- Delegates to the wrong agent (e.g., oracle for file search)
- Provides vague delegation tasks that won't get useful results
- Attempts to solve all problems itself instead of routing to specialists
- Misses opportunities for parallel delegation of independent tasks

## Agent Roles and Expected Behavior

### explorer

**Role**: Fast codebase search and pattern matching specialist.

**Expected strengths**:
- Returns precise `path:line` references
- Parallel searches for efficiency
- Quick turnaround on "where is X?" queries

**What to watch**:
- Are file paths and line numbers stable across runs?
- Is the agent returning too many false positives on broad searches?
- Is the agent skipping relevant files (e.g., hidden dirs, non-standard extensions)?
- Is the agent making architectural judgments beyond code location?

### librarian

**Role**: Documentation and library research specialist.

**Expected strengths**:
- Cites authoritative sources (official docs, RFCs, source code)
- Distinguishes official vs community patterns
- Provides evidence-based recommendations

**What to watch**:
- Is the agent distinguishing between official documentation and community experience?
- Are citations pointing to the correct library version?
- Is the agent surfacing outdated docs without a warning?
- Is the agent fabricating APIs or documentation?

### oracle

**Role**: Strategic technical advisor, code reviewer, and architecture consultant.

**Expected strengths**:
- Concise, actionable recommendations
- Trade-off analysis with clear reasoning
- Identifies over-engineering (YAGNI violations)

**What to watch**:
- Is the oracle too verbose or overly formal?
- Is it proposing complex abstractions without clear benefit?
- Does it acknowledge uncertainty when evidence is thin?
- Does it cite specific files/lines when reviewing code?
- Is it giving a clear verdict or hedging without recommendation?

### fixer

**Role**: Fast, focused implementation specialist for bounded code changes.

**Expected strengths**:
- Executes within the provided scope
- Reads files before editing
- Reports changes clearly

**What to watch**:
- Does the agent expand scope beyond what was requested?
- Does it claim to have modified files it didn't actually touch?
- Is it failing to read existing code before making changes?
- Is it introducing new dependencies without authorization?

### designer

**Role**: Frontend UI/UX specialist for intentional, polished visual experiences.

**Expected strengths**:
- Distinctive, characterful design suggestions
- Specific implementation guidance (class names, properties)
- Matches aesthetic to the project's existing style

**What to watch**:
- Are the design suggestions actually executable (not just aspirational)?
- Does the agent respect the project's existing design system when present?
- Is it giving Tailwind utility guidance that actually exists in the project?
- Does it provide actionable guidance, or just abstract advice?

### orchestrator

**Role**: AI task orchestrator that decomposes work and delegates to specialist agents.

**Expected strengths**:
- Correct routing of subtasks to appropriate specialists
- Parallel delegation when appropriate
- Clean integration of results

**What to watch**:
- Is it delegating too much (overhead) or too little (missed specialist value)?
- Is it sequencing dependent tasks correctly?
- Is it acknowledging uncertainty in routing decisions?
- Is it handling simple tasks directly instead of delegating?

## Prompt Tuning Principles

### 1. Make Small, Targeted Changes

Don't rewrite entire prompts. Change one thing at a time:

- ✅ Add one constraint phrase
- ✅ Adjust the output format
- ✅ Add one example

Bad:
- ❌ Rewrite the entire prompt because it "feels off"

### 2. One Agent at a Time

Only change one agent's prompt per iteration. This makes it clear which change caused which behavioral difference.

### 3. Define "Good" Before Changing

Establish a concrete example of good output before editing the prompt:

```text
Good output from @oracle for "is this over-engineered?":
- Specific architectural concern identified
- Simple alternative proposed
- Trade-off acknowledged
```

Then test whether the prompt produces outputs like this.

### 4. Avoid Prompt Bloat

Every sentence you add is a sentence the model may follow literally. Add constraints sparingly:

- ✅ "Be concise — prefer 3 bullet points over 10"
- ❌ "Be concise but thorough but also specific but also brief"

### 5. Keep Examples Short

If using examples, use 1-2 well-chosen examples, not a full conversation.

### 6. Use the Eval Cases

Reference `examples/prompt-evals/` when tuning prompts:

- Each eval case defines expected output characteristics
- Good and bad output examples guide constraint language
- Failure modes inform boundary warnings

## Prompt Eval Examples

The `examples/prompt-evals/` directory contains human-readable eval cases for each agent and template. These are:

- **Not automated benchmarks** — they're spec sheets for human review
- **Reference for prompt tuning** — use them to verify behavior after changes
- **Documentation of failure modes** — common anti-patterns to avoid

Run static checks:

```bash
pnpm test:prompts
```

## How to Override Built-in Prompts

See [agent-authoring.md](agent-authoring.md) for the full guide. Quick version:

**Via project-level agent file** (overrides built-in by same name):

```bash
cat > .pi/slim-agents/agents/oracle.md << 'EOF'
---
description: Your customized oracle description
---
You are Oracle — your custom role description here.
...
EOF
```

**Via config override** (partial customization):

```json
// .pi/slim-agents.json
{
  "agents": {
    "oracle": {
      "appendPrompt": "Your additional constraint here."
    }
  }
}
```