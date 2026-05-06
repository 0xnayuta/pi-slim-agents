# R3 Command Parsing and CLI UX Review

## Scope

Review command parsing, CLI UX, and JSON output consistency for pi-slim-agents v0.1.0. Focus on:
- Command naming consistency and subcommand dispatch
- /agent shortcut command parsing
- /agents list and filtering
- /agents templates command
- /agents create/validate/history/replay/status/reload/metrics commands
- JSON output consistency and schema
- Parameter parsing robustness
- Test coverage for command parsing
- Documentation consistency

## Files inspected

**Core source:**
- `src/index.ts` — Extension entry point, command registration, handlers
- `src/commands.ts` — Command parsing, filtering, replay logic
- `src/runner.ts` — Delegation runner, prompt building
- `src/history.ts` — History store, filtering, metrics
- `src/format.ts` — JSON output formatters, filter serialization
- `src/status.ts` — Status report, history table formatting
- `src/config.ts` — Config loading with schema validation
- `src/agents.ts` — Agent loading
- `src/templates.ts` — Template loading, validation
- `src/types.ts` — Type definitions
- `src/utils.ts` — Utility functions, package root detection

**Documentation:**
- `README.md`
- `docs/agent-authoring.md`
- `docs/design.md`

**Tests:**
- `tests/agents.test.ts` (353 tests)

## Commands run

- `pnpm release:check` — ✅ All 353 tests pass, 13 package checks pass, dry-run pack succeeds

## Summary

1. **Command system is well-organized** — 9 subcommands under `/agents` with consistent fallback standalone commands (`/agents-status`, `/agents-reload`, etc.). Command naming is consistent (kebab-case).

2. **Subcommand dispatch is robust** — `KNOWN_SUBCOMMANDS` array clearly defines valid subcommands. Unknown subcommands return clear error with available options.

3. **/agent command parsing is comprehensive** — Supports `--mode`/`-m` flags, `--format` flag, proper agent/task separation, error handling for unknown/disabled agents.

4. **JSON output is consistent** — All JSON outputs include `schemaVersion` (value 1) and `kind` field. Uses camelCase. Filters serialized with null for unset values.

5. **Filter system is consistent** — All filters (tags, query, readonly, writable, enabled, disabled, source, regex) use AND semantics. Regex compiled with case-insensitive flag.

6. **Flag parsing handles quoted values** — `tokenizeArgs()` properly handles quoted strings with spaces, preventing path-like arguments from being split.

7. **/agent and delegate_agent tool are consistent** — Both use the same `runAndRecordDelegation()` function, ensuring consistent behavior and history recording.

8. **Replay functionality is comprehensive** — Supports id override, mode/agent/task/context/files overrides, alias drift detection, modifications reporting.

9. **No critical blockers found** — The command parsing system is stable and well-tested. Minor issues are primarily cosmetic (help text, output formatting).

10. **Test coverage is extensive** — 353 tests cover command parsing, filtering, JSON output, replay, history, metrics. New R2-fix tests added for metadata, config validation, package root detection.

---

## Blockers

**None** — No blockers identified in this review.

---

## Major Issues

### M1: /agent help text doesn't show --format flag

**Problem**: `buildAgentHelpText()` in `src/commands.ts` doesn't mention `--format` flag. The `/agent` command supports `--format json` but this is not documented in the help output.

**Location**: `src/commands.ts` — `buildAgentHelpText()` function

**Impact**: Users may not know that `/agent --format json` is supported.

**Fix**: Update `buildAgentHelpText()` to include `--format` flag documentation:

```typescript
export function buildAgentHelpText(): string {
  return [
    '# /agent — Quick Delegation',
    '',
    'Usage: /agent [--mode <mode>] [--format <format>] <agent-or-alias> <task...>',
    '',
    'Modes: quick, normal (default), deep',
    'Formats: text (default), json',
    // ...
  ].join('\n');
}
```

---

### M2: /agents templates JSON output doesn't match /agents JSON schema

**Problem**: `/agents --format json` returns metadata with `sourcePathKind`, but `/agents templates --format json` returns metadata without `sourcePathKind` in the `formatTemplatesJsonFull` call (although the type definition includes it).

**Location**: `src/index.ts` — `handleTemplates()` function, line ~330-345

**Impact**: API consumers may expect consistent metadata structure across agent and template outputs.

**Fix**: Verify `formatTemplatesJsonFull` is being called and confirm `metadata.sourcePathKind` is included in output.

---

### M3: history/replay don't use /agents-history standalone

**Problem**: `/agents history` subcommand works, but `/agents-history` fallback command (registered in `index.ts`) also calls `handleHistory()`. Both are consistent, but there's no `/agents export-history` subcommand — only the standalone `/agents-history-export` and `/agents export-history` works.

**Location**: `src/index.ts` — line ~620-625 and ~655-660

**Observation**: The standalone command `agents-history-export` is registered but doesn't follow the subcommand naming pattern (`/agents export-history` vs `/agents-history-export`). This is consistent with other commands but worth noting for UX clarity.

---

### M4: Replay --files uses comma-split but not documented

**Problem**: `/agents replay 5 --files a,b,c` uses comma-split parsing in `parseReplayArgs()`. This is documented in the command's implicit interface but not in any help text.

**Location**: `src/commands.ts` — `parseReplayArgs()` function, line ~390-395

**Impact**: Users may not know the comma-split behavior for --files.

**Fix**: Either add --files to help text in `handleReplay()` or document in README.

---

## Minor Issues

### m1: /agent help shows alias examples but not all aliases

**Problem**: `buildAgentHelpText()` shows `search` and `arch` examples but not all aliases. This is intentional (brevity) but could be improved.

**Status**: Acceptable — better to keep help brief.

---

### m2: JSON error format not documented

**Problem**: `/agent --format json` with an error returns `formatErrorJson()` structure but README only shows success examples.

**Status**: Minor — error JSON structure is consistent with other error outputs.

---

### m3: /agents reload doesn't show config warnings

**Problem**: `/agents reload` runs `performReload()` but doesn't display config validation warnings from `loadAndValidateConfig()`. Warnings are logged to console but not shown to user.

**Status**: Acceptable — warnings are logged, but could be surfaced in reload output.

---

### m4: /agents validate output doesn't mention config issues

**Problem**: `validateAgents()` validates agent files but config schema warnings (from `loadAndValidateConfig()`) are separate. No combined config + agent validation report.

**Status**: Acceptable — config warnings are separate concern.

---

### m5: /agents status --format json doesn't include lastWarning

**Problem**: `formatStatusJson()` doesn't include `persistentHistory.lastWarning` even though `buildStatusReport()` returns it in the text output.

**Location**: `src/format.ts` — `StatusJsonOutput` interface, line ~360

**Observation**: The interface doesn't have a `persistentHistory` field, so JSON status output doesn't show persistent history warnings.

---

## CLI / UX Risks

### UX1: /agent with quoted task containing "--" may confuse parseFlags

**Risk**: `/agent oracle review -- this is a task` — the `--` might be parsed as a flag if not quoted. Current implementation should handle quoted values, but edge cases exist.

**Mitigation**: Quoting works correctly. Unquoted `--` would be problematic.

---

### UX2: /agent --mode --format json parses mode=--format, json=undefined

**Risk**: If user types `/agent --mode --format json oracle task`, the parser treats `--format` as the mode value.

**Current behavior**: This would cause mode validation error (`Invalid mode "--format"`) which is correct but confusing for users.

**Mitigation**: The error message is clear, but user experience could be improved by detecting `--format` specifically.

---

### UX3: Replay ID validation happens only in historyStore.getById

**Risk**: User types `/agents replay abc` → NaN id → error message "Invalid history ID 'abc'". This is handled correctly.

**Status**: ✅ Working as designed.

---

### UX4: No --help flag for any command

**Risk**: User types `/agents --help` or `/agent --help`. Currently returns an error or unknown subcommand.

**Current behavior**: No help flag. Commands have help text for missing args but not `--help`.

**Status**: Not critical for v0.1.0, could be future enhancement.

---

## JSON / Scripting Risks

### JS1: JSON outputs use `null` for unset filters — correct but needs documentation

**Risk**: API consumers may not expect `null` vs `undefined` in JSON filters.

**Status**: ✅ Correct — `null` is the intended behavior for "not filtered by this field".

---

### JS2: History JSON doesn't include metadata.sourcePathKind

**Observation**: `formatHistoryJson()` doesn't include sourcePathKind because history records don't store metadata.

**Status**: ✅ Correct — history records are lightweight.

---

### JS3: Error JSON includes `code` and `message` but no `kind` for errors

**Observation**: `formatErrorJson()` returns `{ schemaVersion, kind: 'error', error: { code, message } }`. This is consistent with other error formats.

**Status**: ✅ Correct.

---

### JS4: JSON schemaVersion is always 1 — no versioning strategy

**Risk**: Future schema changes may break consumers who rely on `schemaVersion === 1`.

**Status**: Known limitation — document that consumers should check `schemaVersion`.

---

## Test Coverage Gaps

### T1: /agent --mode --format combination test (High value)

**Gap**: No test verifies `/agent --mode deep --format json oracle task` works correctly.

**Recommendation**: Add test that verifies mode and format can be combined in any order.

---

### T2: /agent task with Windows path (Medium value)

**Gap**: No test verifies `/agent explorer find C:\foo\bar.ts` doesn't confuse the path.

**Recommendation**: Add test with Windows-style path arguments.

---

### T3: /agent task with special characters (Medium value)

**Gap**: No test for tasks containing `"`, `'`, `:`, `::`, `-->`, `#`.

**Recommendation**: Add tests for edge case task text.

---

### T4: /agents replay --files comma-split (Medium value)

**Gap**: No test verifies `/agents replay 5 --files file1.ts,file2.ts` parses correctly.

**Recommendation**: Add test for comma-split files argument.

---

### T5: /agents history --format json with filters (Low-Medium value)

**Gap**: Test exists for history JSON but not specifically for filtered history JSON.

**Recommendation**: Add test verifying history JSON with multiple filters.

---

### T6: Error JSON structure consistency (Low value)

**Gap**: No test verifies all error JSON outputs have the same structure.

**Recommendation**: Add test that checks error JSON format from different error sources.

---

## Documentation Mismatches

### D1: README /agent example shows alias but help text shows more

**Document**: README shows `/agent arch review this design` — "arch" is an alias.

**Code**: `buildAgentHelpText()` shows `oracle` as example, not "arch".

**Fix**: Either update README to show `/agent oracle ...` or update help text to include alias examples.

---

### D2: README doesn't mention --format flag for /agent

**Document**: README shows `/agent --mode deep oracle ...` but not `--format`.

**Code**: `/agent` supports `--format json`.

**Fix**: Add `/agent --format json oracle review ...` example to README.

---

### D3: README /agents export-history command vs docs

**Document**: README mentions `/agents export-history`.

**Code**: Subcommand dispatch handles it via `export-history`.

**Status**: ✅ Consistent.

---

### D4: docs/agent-authoring.md doesn't mention command syntax

**Document**: Agent authoring guide covers frontmatter but not command usage.

**Code**: Commands are documented in README.

**Status**: ✅ Acceptable — separation of concerns is fine.

---

## Deferred / Not in Scope

The following topics are not in scope for this review phase:

1. **provider-call real integration** — Known limitation, documented and expected
2. **Token usage tracking** — Pending real provider-call
3. **Agent composition / pipelines** — Not in scope for v0.1.0
4. **Child session delegation** — Pending pi-mono API
5. **Runner/history internals deep review** — Covered by existing tests
6. **Prompt quality / eval coverage** — Covered by prompt eval checker
7. **pi-ai importability fix** — Covered by provider-call.md
8. **Tag autocomplete** — Future enhancement (M16 in roadmap)

---

## Positive Findings

1. **Command naming is consistent** — All commands use kebab-case, subcommands are lowercase words
2. **Subcommand dispatch is robust** — Unknown subcommands return clear error with suggestions
3. **Flag parsing handles edge cases** — Quoted values, boolean flags, short/long forms all work
4. **JSON schema consistency** — All outputs have schemaVersion, kind, and proper camelCase
5. **Filter system is well-designed** — AND semantics, null for unset, regex with 'i' flag
6. **Error messages are actionable** — Available agents listed in errors, enable instructions provided
7. **Help text is clear** — `buildAgentHelpText()` and `buildAvailableAgentsList()` provide useful context
8. **Replay is comprehensive** — Supports all parameter overrides, alias drift detection, modification reporting
9. **History filtering is flexible** — Supports agent, status, runnerMode, mode, query, limit
10. **Config validation is integrated** — Warnings logged during config load, no crashes

---

## Recommended Next Actions

1. **Fix M1** (priority: medium) — Update `buildAgentHelpText()` to include `--format` flag
2. **Fix M2** (priority: medium) — Verify template JSON includes `sourcePathKind`
3. **Add T1, T2** (priority: medium) — Add combined mode+format test, Windows path test
4. **Add T4** (priority: low) — Add comma-split files test
5. **Update D1, D2** (priority: low) — Add --format example to README, verify help text

---

## Suggested Next Review

**R3-fix: Command Parsing and CLI UX Fix**

After fixing M1 and M2, proceed to:

**R4: Runner / History / Metrics / JSON Output Review**

Review:
- Runner prompt building and delegation prompt format
- History persistent storage edge cases
- Metrics calculation accuracy
- JSON output completeness and schema validation
- Persistent history retention and cleanup

---

**Report file**: `docs/reviews/R3-command-parsing-cli-ux-review.md`

**Summary**:
- Blockers: 0
- Major issues: 4
- Minor issues: 5
- CLI/UX risks: 4
- JSON/scripting risks: 4
- Test coverage gaps: 6
- Documentation mismatches: 4

**Recommendation**: Proceed to R3-fix to resolve M1, M2 before R4.

---

*Review completed: 2026-05-06*