# R4 Fix - Runner / History / Metrics / JSON Output

## Scope

This fix addresses only the issues identified in R4: Runner / History / Metrics / JSON Output Review.

## Issues addressed

### B1: formatAgentResultJson task.summary uses wrong field

**Fixed**: Added `taskSummary` optional parameter to `formatAgentResultJson()` in `src/format.ts`.

**Changes**:
1. `src/format.ts`: Added `taskSummary?: string` parameter to function signature. When provided, uses taskSummary for `task.summary`. Falls back to `requestedAgent` for backward compatibility.
2. `src/index.ts`: Updated the success case call to pass `taskSummary: task` so the actual task text is included in JSON output.
3. Updated README.md example to show correct JSON structure with `task.summary` containing the actual task.

### M1: Replay --files comma-split behavior documented

**Status**: No code change needed. The behavior is already documented in README:
- `/agents replay 5 --files src/a.ts,src/b.ts` — Replay with comma-separated file list
- Added test confirming comma-split parsing works correctly (from R3-fix).

The current implementation:
- Splits `--files` value by comma
- Trims whitespace from each entry
- Filters empty entries

Paths containing commas are not supported (this is a known limitation that users should be aware of). The README example `src/a.ts,src/b.ts` demonstrates the expected comma-separated format.

## Files changed

| File | Changes |
|------|---------|
| `src/format.ts` | Added `taskSummary?: string` parameter to `formatAgentResultJson()` |
| `src/index.ts` | Updated success case to pass `taskSummary: task` |
| `tests/agents.test.ts` | Added 4 new tests for taskSummary behavior |
| `README.md` | Updated JSON example to show correct `task.summary` field |

## Tests added or updated

| Test | Type |
|------|------|
| `formatAgentsJson task field in agentResult` | Updated - now passes taskSummary and verifies it appears in output |
| `formatAgentResultJson taskSummary is used, not requestedAgent` | New - verifies alias scenario with taskSummary |
| `formatAgentResultJson taskSummary defaults to requestedAgent for backward compat` | New - verifies fallback behavior |
| `formatAgentResultJson long taskSummary is truncated` | New - verifies truncation to 200 chars |

**Total tests**: 362 passed (up from 358)

## Commands run

| Command | Result |
|---------|--------|
| `pnpm typecheck` | ✅ Passed |
| `pnpm test:agents` | ✅ 362 passed, 0 failed |
| `pnpm test:prompts` | ✅ All checks passed |
| `pnpm test` | ✅ All checks passed |

## Remaining concerns

None.

## Documentation updated

| Document | Update |
|----------|--------|
| `README.md` | Updated JSON example to show correct `task.summary` field with actual task text |

## Summary

Both issues from R4 have been addressed:
- **B1**: Fixed `formatAgentResultJson` to include actual task text in `task.summary` field via new `taskSummary` parameter
- **M1**: Confirmed replay `--files` comma-separated behavior is documented in README

**Test count**: 362 (up from 358)

---

## Recommendation

Proceed to **R5: Tests and Edge Cases Review**.

R5 should cover:
- Missing test coverage for formatAgentResultJson (now added)
- Edge cases for history/replay
- Error handling edge cases
- Persistent history integration tests
- Security/privacy edge cases

---

*Fix completed: 2026-05-06*
