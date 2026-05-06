# R4 Runner / History / Metrics / JSON Output Review

## Scope

Review runner architecture, provider-call fallback, history/replay/metrics, and JSON output consistency for pi-slim-agents v0.1.0. Focus on:
- Runner prompt building and delegation prompt format
- Provider-call unavailable fallback behavior
- History persistent storage edge cases
- Metrics calculation accuracy
- JSON output completeness and schema validation
- Persistent history retention and cleanup
- Error sanitization and security
- Test coverage gaps

## Files inspected

**Core source:**
- `src/runner.ts` — Delegation runner, prompt-only and provider-call routing
- `src/provider-runner.ts` — Provider-call runner with pi-ai fallback
- `src/history.ts` — History store, filtering, metrics, persistent history
- `src/format.ts` — JSON output formatters for all commands
- `src/output-template.ts` — Structured output templates per agent
- `src/security.ts` — Error sanitization, safe display paths
- `src/status.ts` — Status report, history table, metrics formatting
- `src/index.ts` — Extension entry, command handlers, delegation logic
- `src/commands.ts` — Replay parsing and logic
- `src/types.ts` — Type definitions

**Documentation:**
- `docs/design.md` — Architecture and JSON output design
- `docs/provider-call.md` — Provider-call investigation and limitations
- `docs/agent-authoring.md` — Agent creation guide
- `README.md` — Quick start, JSON output, history/replay/metrics

**Tests:**
- `tests/agents.test.ts` (358 tests)

## Commands run

| Command | Result |
|---------|--------|
| `pnpm typecheck` | ✅ Passed |
| `pnpm test:agents` | ✅ 358 passed |

## Summary

1. **Runner architecture is well-designed** — Two-tier routing (prompt-only as stable default, provider-call as experimental fallback) is clearly implemented. Fallback behavior is correct and documented.

2. **Provider-call fallback is robust** — When pi-ai is not importable or model is unavailable, runner gracefully falls back to prompt-only with clear messaging. No crashes.

3. **History system is comprehensive** — In-memory store with optional persistent JSONL backing. All delegation records include complete metadata. Filtering and replay work correctly.

4. **Metrics calculation is accurate** — Uses resolvedAgent for per-agent stats. Handles empty state. tokenUsage correctly marked as unavailable.

5. **JSON output is mostly consistent** — All outputs have schemaVersion, kind. Error sanitization works. Tests cover most cases.

6. **outputTemplate system is per-agent** — Each agent has tailored XML-like output templates that are injected when outputTemplate !== false.

7. **One critical bug found** — `formatAgentResultJson` uses `requestedAgent` as `task.summary` instead of the actual task. This corrupts the JSON output.

8. **Security sanitization is thorough** — API keys, file paths, stack traces are sanitized. safeDisplayPath works correctly for privacy.

9. **Test coverage is extensive** — 358 tests cover runner modes, history, metrics, JSON formatters. High-value scenarios are covered.

10. **Documentation is accurate** — README, provider-call.md, and design.md correctly describe limitations and usage.

---

## Blockers

### B1: formatAgentResultJson task.summary uses wrong field

**Problem**: `formatAgentResultJson()` in `src/format.ts` sets `task.summary` to `params.requestedAgent` (the agent name) instead of the actual task text.

**Location**: `src/format.ts` — `formatAgentResultJson()` function, line ~177

**Current code**:
```typescript
task: {
  summary: truncateForJson(params.requestedAgent, 200),
},
```

**Impact**: `/agent --format json` output has `task.summary` showing the agent name (e.g., `"oracle"`) instead of the actual task description. This breaks JSON API consumers expecting a task summary.

**Fix**: Add a `taskSummary` parameter to `formatAgentResultJson()` and use it instead. Callers in `src/index.ts` should pass the actual task.

---

## Major Issues

### M1: Replay --files comma-split with spaces in filenames is ambiguous

**Problem**: `--files a.ts, b.ts` — if a filename contains a comma and a space, the behavior is ambiguous. Users might expect `a.ts, b.ts` to be two files with one containing a comma, but the current implementation splits on comma first.

**Location**: `src/commands.ts` — `parseReplayArgs()` function, line ~390

**Impact**: Users with files containing commas may get unexpected behavior. Not critical but worth noting.

**Fix**: Document this limitation clearly. Or consider space-separated as an alternative.

---

## Minor Issues

### m1: formatAgentResultJson task field is never passed by callers

**Problem**: Callers in `src/index.ts` never pass a `taskSummary` parameter to `formatAgentResultJson`. The `task.summary` field always shows the agent name.

**Location**: `src/index.ts` — all `formatAgentResultJson()` calls

**Impact**: Low — this is a consequence of B1.

---

### m2: formatHistoryJson includes errorReason but not fullTask/fullContext

**Problem**: `formatHistoryJson()` correctly omits `fullTask` and `fullContext` for privacy, but `errorReason` is still included. If the error contains sensitive context, it could leak.

**Location**: `src/history.ts` — `exportJson()` method, line ~162

**Impact**: Low — errorReason should be sanitized, but `sanitizeErrorForHistory()` truncates to 100 chars which should be sufficient.

---

### m3: Metrics providerCallAvailable/Unavailable counts per session

**Problem**: README doesn't clarify that metrics counts are for the current session only, not persistent history data.

**Location**: `README.md` — History and Replay section

**Impact**: Low — users might expect combined stats from persistent history.

---

## Runner / provider-call risks

### UX1: Provider-call "fallback" message format is consistent but verbose

**Risk**: When provider-call falls back, the output includes a multi-line message with "Fallback Prompt:" section. This is correct but verbose.

**Status**: ✅ Working as designed. The verbose format helps users understand what happened.

---

### UX2: Provider-call output doesn't include actual model response in fallback

**Risk**: In fallback mode, `providerOutput` includes the fallback prompt but not the actual model response (because there is none). This is consistent with the design.

**Status**: ✅ Working as designed.

---

### UX3: Provider-call runner uses hardcoded reason codes

**Risk**: `getProviderUnavailableReason()` uses string matching on error types. If error messages change, reason codes might become incorrect.

**Status**: Acceptable — uses discrete error type flags rather than string parsing.

---

## History / replay / metrics risks

### HR1: Persistent history retention enforced only on rewriteDisk

**Risk**: Retention is only enforced when a new record causes the array to exceed the limit. If the process crashes after adding a record but before the rewrite, extra records might exist.

**Status**: ✅ Acceptable — worst case is one extra record above retention.

---

### HR2: Metrics uses resolvedAgent, not requestedAgent

**Risk**: If users want to track which alias was used (not just resolved agent), the per-agent metrics don't capture this.

**Status**: ✅ Correct — resolvedAgent is what actually handled the task.

---

### HR3: History export doesn't include full task even if storeFullTask is true

**Risk**: `exportJson()` always uses `taskSummary` (truncated to 80 chars), never the full task even when `storeFullTask` is configured.

**Location**: `src/history.ts` — `exportJson()` method

**Impact**: Low — privacy by design.

---

### HR4: History filter --query includes fullContext

**Risk**: History filtering with `--query` includes `fullContext` in the search. If `fullContext` contains sensitive data and history is exported, it could be searchable.

**Status**: ✅ Acceptable — `fullContext` is only included when `storeFullContext` is true, and only in memory/export, not in JSONL persistence format.

---

## JSON / scripting risks

### JS1: JSON schemaVersion is always 1 — no migration path

**Risk**: Future schema changes will break consumers relying on `schemaVersion === 1`.

**Status**: Known limitation — documented in design.md.

---

### JS2: JSON outputs use null for unset filters, not undefined

**Risk**: API consumers may not expect `null` vs `undefined`.

**Status**: ✅ Correct — documented in format.ts header comment.

---

### JS3: Error JSON kind is 'error', not 'errorResult'

**Risk**: Error output uses `kind: 'error'`, which is consistent but different from `kind: 'agentResult'` for success/error delegation results.

**Status**: ✅ Correct — separate concerns.

---

## Security / privacy concerns

### SP1: safeDisplayPath logic for project vs package paths

**Problem**: `safeDisplayPath()` tries to make paths relative to package root or cwd, but doesn't always succeed for project-level agents in non-standard locations.

**Location**: `src/security.ts` — `safeDisplayPath()` function

**Status**: ✅ Acceptable — Falls back to basename when relative path resolution fails.

---

### SP2: sanitizeErrorMessage truncates to 200 chars

**Risk**: Very long error messages are truncated, which might lose important context.

**Status**: ✅ Acceptable — 200 chars is sufficient for most error messages.

---

### SP3: JSONL persistent history stores full records

**Risk**: Persistent history (`.pi/slim-agents/history.jsonl`) stores full records including `fullTask`, `fullContext`, `fullFiles` if `storeFullTask`/`storeFullContext` are true.

**Location**: `src/history.ts` — `appendToDisk()` method

**Status**: ⚠️ Note — README warns to add history file to .gitignore, which is correct.

---

## Test coverage gaps

### T1: formatAgentResultJson with actual task summary (HIGH)

**Gap**: No test verifies that `formatAgentResultJson` correctly outputs the task summary.

**Recommendation**: Add test passing a task and verifying `task.summary` contains the task text.

---

### T2: formatAgentResultJson error case task field (MEDIUM)

**Gap**: No test verifies error case JSON has proper error.code and error.message.

**Recommendation**: Add test for error delegation result JSON format.

---

### T3: Persistent history warning message retrieval (MEDIUM)

**Gap**: No test verifies `getLastWarning()` and `getPersistentStatus()` work correctly.

**Recommendation**: Add test for persistent history warning tracking.

---

### T4: History filter with multiple criteria (LOW-MEDIUM)

**Gap**: Tests exist for individual filters but not combined filters.

**Recommendation**: Add test for history filtering with agent + status + mode + query.

---

### T5: Metrics with provider-call counts (LOW)

**Gap**: No test verifies providerCallAvailable/providerCallUnavailable counts in metrics.

**Recommendation**: Add test for metrics provider-call counts.

---

## Documentation mismatches

### D1: README doesn't mention that metrics are session-only

**Document**: README shows `/agents metrics` but doesn't clarify it only counts the current session.

**Code**: `historyStore.metrics()` computes from in-memory records.

**Fix**: Add note: "Metrics are for the current session only."

---

### D2: README provider-call status description

**Document**: README shows "Provider-call runner" as "⚠️ Architectural only (falls back to prompt-only)" which is accurate.

**Code**: ✅ Consistent.

---

### D3: docs/provider-call.md mentions potential solution #3 (pnpm hoisting)

**Document**: docs/provider-call.md describes `pnpm public-hoist-pattern` as a candidate solution but it's not implemented.

**Status**: ✅ Acceptable — document is about investigation, not implementation.

---

### D4: docs/design.md doesn't mention JSON error output format

**Document**: docs/design.md lists `kind` values but doesn't include `error`.

**Code**: `formatErrorJson()` produces `kind: 'error'`.

**Fix**: Add `error` to the JSON kind table in design.md.

---

## Deferred / Not in scope

The following topics are not in scope for this review phase:

1. **provider-call real integration** — Pending pi-mono ExtensionAPI
2. **Token usage tracking** — Requires real provider-call
3. **Agent composition / pipelines** — Not in scope for v0.1.0
4. **Child session delegation** — Pending pi-mono API
5. **Tag autocomplete** — Future enhancement (M16 in roadmap)
6. **Command parser review** — Covered in R3
7. **Prompt tuning** — Covered by prompt eval checker

---

## Positive findings

1. ✅ **Runner mode routing is clean** — `runDelegation()` routes correctly between prompt-only and provider-call
2. ✅ **Provider-call fallback is graceful** — No crashes when pi-ai is not importable
3. ✅ **Error sanitization is thorough** — `sanitizeErrorMessage()` and `getProviderUnavailableReason()` work correctly
4. ✅ **History filtering is flexible** — Supports agent, status, runnerMode, mode, query, limit
5. ✅ **Metrics are accurate** — Uses resolvedAgent, handles empty state, tokenUsage marked unavailable
6. ✅ **JSON outputs are consistent** — schemaVersion, kind, null for unset filters
7. ✅ **outputTemplate is per-agent** — Each agent has tailored XML-like output expectations
8. ✅ **safeDisplayPath works** — Built-in, project, and user paths are correctly sanitized
9. ✅ **Persistent history is safe** — .gitignore covers history.jsonl, write failures don't crash
10. ✅ **Tests cover high-value scenarios** — 358 tests with good coverage of runner, history, metrics, JSON

---

## Recommended next actions

1. **Fix B1** (priority: HIGH) — Add taskSummary parameter to formatAgentResultJson
2. **Add T1** (priority: HIGH) — Test formatAgentResultJson with actual task summary
3. **Fix D1** (priority: MEDIUM) — Add "session-only" note to README metrics section
4. **Fix D4** (priority: LOW) — Add `error` to JSON kind table in design.md
5. **Add T3** (priority: LOW) — Test persistent history warning retrieval

---

## Suggested next review

**R4-fix: Runner / History / Metrics / JSON Output 修复**

After fixing B1, proceed to:

**R5: Tests and Edge Cases Review**

R5 should cover:
- Missing test coverage for formatAgentResultJson
- Edge cases for history/replay
- Error handling edge cases
- Persistent history integration tests
- Security/privacy edge cases

---

**Report file**: `docs/reviews/R4-runner-history-metrics-json-review.md`

**Summary**:
- Blockers: 1 (formatAgentResultJson task.summary bug)
- Major issues: 1 (replay --files comma ambiguity)
- Minor issues: 3
- Test coverage gaps: 5

**Recommendation**: Proceed to R4-fix to resolve B1 before R5.

---

*Review completed: 2026-05-06*
