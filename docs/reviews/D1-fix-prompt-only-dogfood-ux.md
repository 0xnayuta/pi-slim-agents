# D1 Fix - Prompt-only Dogfood UX

## Problem

During dogfood testing, running:
```
/agent explorer find where playback scheduling is implemented
```

produced only the delegation prompt text:
```
📋 Delegated to @explorer (Codebase navigator)
...

--- Delegation Prompt ---
Agent
@explorer

Role
Codebase navigator

Task
find where playback scheduling is implemented
...
--- End ---
```

The user expected actual search results with `path:line` evidence. The output did not clearly indicate that:
1. No tools were executed
2. No child agent was started
3. The command only returned a specialist prompt

This caused user expectation mismatch during the devpiano dogfood phase.

## Root Cause

- **`runnerMode = "prompt-only"`** is the stable default (not a bug)
- **No UX banner** in `formatDelegationResult` output to indicate prompt-only behavior
- **`DelegationResult`** lacked explicit `executed`, `toolsExecuted`, `childSessionStarted` fields
- **Help text** (`/agent` without args) did not explain prompt-only limitations
- **README** lacked clear prompt-only behavior documentation
- **No dogfood guide** existed for users to understand correct testing patterns

The behavior was technically correct — it's a prompt-only runner. The problem was insufficient UX clarity.

## Changes Made

### Core Types (`src/types.ts`)
Extended `DelegationResult` interface with execution metadata fields:
```typescript
runnerMode: RunnerMode;
executed: boolean;           // false in prompt-only
toolsExecuted: boolean;     // false in prompt-only
childSessionStarted: boolean; // false in prompt-only
note?: string;               // human-readable explanation
```

### Runner (`src/runner.ts`)
- Added execution metadata to all `runDelegation` return paths (prompt-only success, prompt-only error, provider-call fallback)
- Added UX banner to `formatDelegationResult` when `runnerMode === 'prompt-only'`:
  ```
  ⚠️  Prompt-only delegation — no tools were executed
     This is a specialist prompt only. No child agent was started.
     Use this prompt to guide the main agent, or ask it to perform
     the search manually with grep/read/bash.
  ```

### Provider Runner (`src/provider-runner.ts`)
- Added execution metadata (`executed: false`, `toolsExecuted: false`, `childSessionStarted: false`) to all fallback paths in `runProviderDelegation`:
  - "no model configured" fallback
  - "no API key" fallback
  - "empty model response" fallback
  - "model call failed" catch block
  - `buildFallbackResult` helper
- Added `runnerMode: 'prompt-only'` and `note` to all fallback returns
- For the "success" case, added `executed: true` (model was called)

### Format Layer (`src/format.ts`)
Extended `AgentResultJsonOutput` and `formatAgentResultJson` with:
```typescript
executed: boolean;
toolsExecuted: boolean;
childSessionStarted: boolean;
note?: string;
```

### Extension Entry Point (`src/index.ts`)
- Updated all `formatAgentResultJson` calls in `/agent` command handler to pass execution metadata
- Updated `delegate_agent` tool `details` object to include execution metadata
- Error cases get `executed: false, toolsExecuted: false, childSessionStarted: false`

### Help Text (`src/commands.ts`)
Updated `buildAgentHelpText` to include:
- ⚠️  prompt-only warning explaining `/agent` returns a delegation prompt only
- Explicit statement that it does NOT execute tools or start child agents
- Two-step dogfood pattern example (Step 1: `/agent`, Step 2: ask main agent)
- Direct search example (bypass `/agent`)

### README.md
- Added prominent "⚠️  prompt-only is the stable default" section in "Current Limitations"
- Added explanation of what `/agent` does NOT do in prompt-only mode
- Added two-step dogfood pattern and direct search examples
- Updated "What this is NOT" to include "tool-executing subagent runner"
- Added note to "Delegate a task" section

### Dogfood Guide (`docs/dogfood.md`)
New file containing:
- Important: prompt-only behavior section
- What `/agent` does NOT do vs. what it DOES do
- Three dogfood patterns (two-step, direct search, compare)
- Dogfood task examples for all built-in agents
- What to look for (prompt quality, runner behavior, documentation clarity)
- Reporting issues guide
- Current status table
- Future improvements reference

### Skill Guide (`skills/use-slim-agents/SKILL.md`)
- Added ⚠️  prompt-only mode section at the top of "How to Use"
- Added clarification to `delegate_agent` tool section
- Added two-step pattern guidance
- Updated "After Delegation" section with guidance for prompt-only mode

### Roadmap (`docs/roadmap.md`)
Added new "D1: prompt-only UX Clarification" section documenting:
- Problem statement
- Complete list of changes
- Not implemented items (out of scope)
- Future integration points

### Tests (`tests/agents.test.ts`)
Added 9 new tests:
1. `prompt-only mode sets executed=false, toolsExecuted=false, childSessionStarted=false`
2. `prompt-only mode result has note with guidance`
3. `formatDelegationResult shows prompt-only banner for prompt-only result`
4. `formatDelegationResult does NOT show banner for provider-call output`
5. `provider-call fallback result has executed=false and fallback note`
6. `buildAgentHelpText includes prompt-only warning`
7. `/agent --format json includes executed=false for prompt-only`
8. `/agent --format json includes note field when provided`
9. `/agent --format json does not imply toolsExecuted=true in prompt-only`

Also updated all 16 existing `formatAgentResultJson` test calls to include the new required fields.

## User-Facing Behavior After Fix

**Before:**
```
/agent explorer find where playback scheduling is implemented
```
Output: delegation prompt (unlabeled, no warning)

**After:**
```
/agent explorer find where playback scheduling is implemented
```
Output:
```
⚠️  Prompt-only delegation — no tools were executed
   This is a specialist prompt only. No child agent was started.
   Use this prompt to guide the main agent, or ask it to perform
   the search manually with grep/read/bash.

📋 Delegated to @explorer (Codebase navigator)
...

--- Delegation Prompt ---
...
--- End ---
```

**JSON mode (`/agent --format json`):**
```json
{
  "kind": "agentResult",
  "runnerMode": "prompt-only",
  "executed": false,
  "toolsExecuted": false,
  "childSessionStarted": false,
  "note": "Prompt-only delegation: this returns a specialist prompt. No tools were executed. ...",
  ...
}
```

## How to Dogfood Correctly

### Two-step pattern (recommended for testing `/agent` itself)
```
Step 1: /agent explorer find where playback scheduling is implemented
Step 2: Ask pi: "Using the Explorer instructions above, actually search the
        repository for playback scheduling. Use grep/read/bash and return
        path:line evidence."
```

### Direct search (for real work, bypass `/agent`)
```
Search the repository for playback scheduling implementation.
Use grep/read/bash. Return path:line evidence.
```

### Compare both patterns
For the most useful dogfood feedback, try both and compare results.

## Tests Updated

| Test | Result |
|------|--------|
| 16 existing `formatAgentResultJson` calls updated | ✅ Pass |
| 9 new tests added | ✅ Pass |
| All 378 tests pass | ✅ Pass |
| TypeScript compilation | ✅ Pass |
| Package check (13 items) | ✅ Pass |
| Pack dry-run | ✅ Pass |

## Remaining Limitations

### What was NOT implemented (out of scope for D1)

- **Real provider-call integration**: Currently falls back to prompt-only. The runner architecture is complete but `@mariozechner/pi-ai` is not importable via pnpm strict module resolution. Blocking: pi-mono ExtensionAPI changes or direct API exposure.

- **Child session runner**: Would allow independent model calls via pi-mono child session API. `childSessionStarted` would be `true` when implemented. Pending: pi-mono API support.

- **Tool-executing delegation**: In provider-call mode, the model may run tools. `toolsExecuted` would be `true` when the model actually runs tools. Currently always `false` since no real model call is made.

- **Real search results**: In prompt-only mode, the `/agent` command will never return `path:line` search results. Users must use the two-step pattern or direct search.

### What still needs work

- Provider-call real integration feasibility spike
- Child session runner API investigation
- Token usage tracking (requires real provider-call)
- Tag autocomplete in `/agent` (requires pi-mono completion API)

## Recommendation

Continue dogfooding using the two-step pattern. The UX is now clear that:
1. `/agent` returns a prompt, not results
2. The main pi session must be asked to perform the actual search
3. The generated prompt is useful guidance for the main agent

**Next steps:**
1. Dogfood the two-step pattern with real development tasks
2. Monitor pi-mono ExtensionAPI releases for provider-call opportunity
3. Consider a child-session runner feasibility spike after more dogfood data
4. Iterate on prompt quality based on two-step pattern feedback
