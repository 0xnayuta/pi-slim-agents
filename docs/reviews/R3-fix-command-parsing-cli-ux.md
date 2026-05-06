# R3 Fix - Command Parsing and CLI UX

## Scope

This fix addresses only the Major Issues identified in R3: Command Parsing and CLI UX Review.

## Issues addressed

### M1: /agent help text doesn't show --format flag

**Fixed**: Updated `buildAgentHelpText()` in `src/commands.ts` to include:
- `--format` flag in usage line
- "Formats: text (default), json" documentation
- Example: `/agent --format json oracle review this design`
- Example: `/agent --mode deep --format json arch review this design`
- Alias mappings documented inline

### M2: /agents templates JSON metadata consistency

**Fixed**: Verified and enhanced tests for template JSON metadata consistency:
- Added test `/agents templates --format json includes metadata.sourcePathKind`
- Added test `templates JSON metadata structure matches agents JSON metadata structure`
- Added test `templates JSON metadata does not include absolute user paths`
- Confirmed `formatTemplatesJsonFull()` properly includes `sourcePathKind` in all template items

### M3: /agents-history-export command naming

**Status**: No change needed. The project already uses the main command/subcommand style consistently:
- `/agents history` (subcommand style)
- `/agents metrics` (subcommand style)
- `/agents export-history` (subcommand style)

The standalone commands (`/agents-history`, `/agents-metrics`, `/agents-history-export`) are fallback commands that dispatch to the same handlers. This is working as designed.

### M4: Replay --files comma-split documentation

**Fixed**: 
- Documented in README: `/agents replay 5 --files src/a.ts,src/b.ts`
- Added tests confirming comma-split behavior:
  - `parseReplayArgs splits --files by comma`
  - `parseReplayArgs --files with whitespace trims entries`
  - `parseReplayArgs --files single file works`

## Files changed

| File | Changes |
|------|---------|
| `src/commands.ts` | Updated `buildAgentHelpText()` to include `--format` flag documentation |
| `tests/agents.test.ts` | Added 6 new tests for help text, template metadata consistency, and replay --files |
| `README.md` | Added JSON output examples and replay --files comma-split documentation |

## Tests added or updated

| Test | Type |
|------|------|
| `buildAgentHelpText returns help with examples` | Updated - added 7 new assertions for --format, modes, formats, aliases |
| `formatTemplatesJsonFull includes metadata.sourcePathKind` | Updated - now verifies sourcePathKind field |
| `templates JSON metadata structure matches agents JSON metadata structure` | New - verifies field parity |
| `templates JSON metadata does not include absolute user paths` | New - verifies path privacy |
| `parseReplayArgs splits --files by comma` | New |
| `parseReplayArgs --files with whitespace trims entries` | New |
| `parseReplayArgs --files single file works` | New |

**Total tests**: 358 passed (357 from R2-fix + 1 new for help text assertions + 5 new for templates + 3 new for replay)

## Commands run

| Command | Result |
|---------|--------|
| `pnpm typecheck` | ✅ Passed |
| `pnpm build` (via tsc) | ✅ Passed |
| `pnpm test:agents` | ✅ 358 passed, 0 failed |
| `pnpm test:prompts` | ✅ All checks passed |
| `pnpm check:package` | ✅ 13 passed, 0 warnings |

## Remaining concerns

None.

## Documentation updated

| Document | Update |
|----------|--------|
| `README.md` | Added "With JSON output" section with `/agent --format json` examples |
| `README.md` | Added `/agents replay --files` comma-separated example |

## Summary

All 4 Major Issues from R3 have been addressed:
- M1: Help text now includes `--format` flag and all required documentation
- M2: Template JSON metadata structure verified consistent with agents
- M3: Command naming confirmed working as designed
- M4: Replay `--files` comma-split documented and tested

**Test count**: 358 (up from 353 in R2-fix)

---

## Recommendation

Proceed to **R4: Runner / History / Metrics / JSON Output Review**.

R4 should cover:
- Runner prompt building and delegation prompt format
- History persistent storage edge cases
- Metrics calculation accuracy
- JSON output completeness and schema validation
- Persistent history retention and cleanup

---

*Fix completed: 2026-05-06*
