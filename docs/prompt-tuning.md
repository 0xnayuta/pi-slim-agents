# Prompt Tuning Guide

This document covers the principles and process for fine-tuning built-in agent prompts based on real-world usage feedback.

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

**Common fixes**:
- Tighten search scope if agent is too broad
- Add exclusion hints for generated/test files if noise is high

---

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

**Common fixes**:
- Add version-specific hints if the codebase uses pinned dependencies
- Encourage citation of source file comments as primary evidence

---

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
- Is it citing specific files/lines when reviewing code?

**Common fixes**:
- If responses are too long: add a "be concise" constraint
- If over-engineering: add a "prefer simple solutions" note
- If citing wrong files: verify the agent is reading the files it's critiquing

---

### fixer

**Role**: Fast, focused implementation specialist for bounded code changes.

**Expected strengths**:
- Executes within the provided scope
- Reads files before editing
- Reports changes clearly

**What to watch**:
- Does the agent擅自 expand the scope beyond what was requested?
- Does it claim to have modified files it didn't actually touch?
- Is it failing to read existing code before making changes?

**Common fixes**:
- If scope creep: add explicit scope boundary language
- If false modification claims: add a constraint that the agent must verify files were actually changed

---

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

**Common fixes**:
- If guidance is too generic: encourage referencing specific project components
- If aesthetic is misaligned: specify the project's existing color system or framework

---

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

**Common fixes**:
- If delegation is too frequent: add a "delegate only when specialist clearly adds value" note
- If results aren't integrated well: strengthen the integration step in the workflow

---

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

---

## Future: eval framework

Eventually, we recommend adding `examples/prompt-evals/` with:

- Input/expected-output pairs for each agent
- A script that runs each agent (in prompt-only mode) against inputs and checks outputs
- A scoring rubric per agent (e.g., oracle: has tradeoffs, has specific file refs, concise)

This is **not implemented in this version**. The above is a guide for future iteration.

---

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
