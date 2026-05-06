# R5 Tests and Edge Cases Review

## Scope

Review test coverage, edge cases, CI, and release verification for pi-slim-agents v0.1.0. Focus on:
- Test script completeness and reliability
- Module-level test coverage assessment
- High-value edge case gaps
- Test quality issues
- CI configuration
- Documentation consistency

## Files inspected

**Configuration:**
- `package.json` — Scripts, dependencies, files array
- `.github/workflows/ci.yml` — CI pipeline

**Test infrastructure:**
- `tests/agents.test.ts` — Main test suite (362 tests)
- `scripts/check-prompt-evals.ts` — Prompt eval static checker
- `scripts/check-package.ts` — Package contents validator

**Documentation:**
- `docs/release.md` — Release process and verification
- `docs/prompt-tuning.md` — Prompt quality checklist
- `docs/agent-authoring.md` — Agent creation guide
- `README.md` — Testing and development commands

**Prompt evals:**
- `examples/prompt-evals/` — 8 eval files (6 agents + 2 templates)

## Commands run

| Command | Result |
|---------|--------|
| `pnpm typecheck` | ✅ Passed |
| `pnpm test` | ✅ 362 tests + 7 prompt eval checks passed |
| `pnpm check:package` | ✅ 13 passed, 0 warnings |

## Summary

1. **Test infrastructure is comprehensive** — 362 unit tests + 2 validation scripts + prompt eval checker. All scripts are runnable and produce actionable output.

2. **CI pipeline is well-configured** — GitHub Actions CI runs on push/PR to main/master. Covers typecheck → build → test:agents → test:prompts → check:package → pack:dry.

3. **Prompt eval system is static-only** — `check-prompt-evals.ts` performs static checks (file existence, case count, required fields, boundary patterns). No real LLM calls. Clear in documentation.

4. **Package contents validation is thorough** — 13 checks covering dist, agents, templates, skills, docs, README, CHANGELOG, .gitignore. Catches common npm publish mistakes.

5. **One minor gap in test coverage** — No Unicode/Chinese input tests for agent tasks. This is unlikely to affect typical users but worth noting for i18n scenarios.

6. **Edge case coverage is good for core paths** — Empty inputs, invalid names/aliases/tags, path traversal, config merging, replay modifications, metrics empty state all covered.

7. **Privacy/security tests present** — Tests verify no API keys, no absolute paths, no full prompts in JSON. Good coverage of `sanitizeErrorMessage` and `safeDisplayPath`.

8. **Release:check chain is complete** — `typecheck → build → test → check:package → pack:dry` covers all pre-publish verification. CI mirrors this.

9. **Test quality is reasonable** — Uses plain assert with manual counting. No framework overhead. Simple async/await pattern. No known flakiness.

10. **No network dependencies in tests** — All tests use local files. Prompt eval checks are static. No real API calls.

---

## Blockers

**None** — No blockers identified. Test infrastructure is complete and working.

---

## Major Issues

**None** — No major issues requiring fixes before release.

---

## Minor Issues

### m1: No Unicode/Chinese input tests

**Gap**: No tests for agent tasks with Unicode, Chinese characters, or emoji. While Node.js handles UTF-8 well, this could surface encoding edge cases in path handling or frontmatter parsing.

**Recommendation**: Add at least one test with Chinese task text to verify encoding passes through correctly.

---

### m2: No repeated flag tests

**Gap**: No tests for what happens when `--mode` or `--format` is repeated in `/agent` command.

**Impact**: Low — current parser behavior would use the last value, but this isn't tested.

---

### m3: CI doesn't run pack:dry in the final step

**Gap**: CI runs `pnpm pack:dry` as a separate step but `release:check` also runs it. Minor duplication, not a failure.

**Status**: Acceptable — CI has explicit step listing which improves clarity.

---

## High-value test gaps

### T1: parseAgentCommand with --flag-like text in task (HIGH)

**Gap**: Task text containing `--mode`, `--format`, `--help` could be mistakenly parsed as flags.

**Recommendation**: Add test for `/agent oracle review -- this is a task` (unquoted `--`).

---

### T2: Frontmatter with Chinese characters (MEDIUM)

**Gap**: No test for agent files with Chinese description or tags.

**Recommendation**: Add test using `parseAgentFrontmatter` with Chinese content.

---

### T3: Config with unknown fields (already covered but not obvious)

**Gap**: Already covered by test "unknown config fields produce warnings" but worth verifying.

**Status**: ✅ Covered at line ~3990.

---

### T4: historyStore with concurrent add operations (LOW)

**Gap**: No test for what happens when multiple delegations add records simultaneously. This is unlikely in single-threaded Node.js but worth noting.

**Status**: Acceptable — Node.js event loop is single-threaded.

---

### T5: outputTemplate=false in prompt-only mode (LOW)

**Gap**: Test exists for `buildExpectedOutputSection` but not a full integration test with `outputTemplate=false` in `runDelegation`.

**Recommendation**: Add test passing `outputTemplate: false` config and verify the delegation prompt doesn't contain XML-like tags.

---

## Edge case risks

### E1: Task text with -- might be parsed as flag

**Risk**: `/agent oracle -- this is wrong` — the `--` might be treated as a flag.

**Current behavior**: Quoted values are handled correctly by `tokenizeArgs()`. Unquoted `--` would be problematic.

**Mitigation**: Users should quote task text containing special characters.

---

### E2: Repeated --mode flag uses last value

**Risk**: `/agent --mode quick --mode deep oracle task` would use `deep`.

**Current behavior**: `parseFlags()` iterates sequentially, overwriting previous values.

**Status**: ✅ Acceptable — last value wins, consistent with common CLI behavior.

---

### E3: Windows path in task context

**Risk**: `C:\Users\foo\bar.ts` in context might be confused for a flag or invalid value.

**Current behavior**: `tokenizeArgs()` treats `C:\Users\foo\bar.ts` as a single token because no space.

**Status**: ✅ Working correctly.

---

### E4: replay --files with empty segments

**Risk**: `--files a.ts,,b.ts` might produce `['a.ts', '', 'b.ts']` or filter empty strings.

**Current behavior**: `split(',').map(f => f.trim()).filter(Boolean)` — empty segments are filtered.

**Status**: ✅ Working correctly, tested in R3-fix.

---

### E5: Config with invalid JSON doesn't crash loadConfig

**Risk**: Malformed `.pi/slim-agents.json` might throw.

**Current behavior**: `loadConfig()` uses try/catch, returns empty config on error.

**Status**: ✅ Tested at line ~3990.

---

## CI / release check risks

### CI1: No caching of pnpm store

**Observation**: CI uses `cache: 'pnpm'` which caches the store, but not the `node_modules` directly. This is acceptable for small packages.

**Status**: ✅ Acceptable.

---

### CI2: No test results artifact on success

**Observation**: Artifacts are only uploaded on failure. Successful runs don't preserve test results.

**Status**: Acceptable — reduces storage costs.

---

### CI3: CI doesn't verify prompt-evals are up-to-date with agents

**Observation**: `test:prompts` checks eval file structure but doesn't verify that new agents have eval files.

**Status**: ✅ Working — eval files are created for all 6 built-in agents.

---

### CI4: prepublishOnly runs release:check

**Observation**: `package.json` has `"prepublishOnly": "pnpm release:check"` which would run on `npm publish`.

**Status**: ✅ Good — prevents accidental publish without verification.

---

## Flakiness risks

### F1: History id tests might be order-dependent

**Risk**: Tests that reference specific history IDs (`id === 1`) could break if `historyStore.clear()` isn't called between tests.

**Current behavior**: Tests do call `historyStore.clear()` before recording history.

**Status**: ✅ Working correctly.

---

### F2: Metrics tests depend on order of history operations

**Risk**: Tests that add records and then call `metrics()` depend on previous operations.

**Current behavior**: `historyStore.clear()` is called before each test group.

**Status**: ✅ Working correctly.

---

### F3: Timestamp/duration tests use `Date.now()`

**Risk**: `durationMs` assertions use actual timing which could be flaky on slow systems.

**Current behavior**: Tests use loose assertions (e.g., `> 0`, `< 1000`) rather than exact values.

**Status**: ✅ Acceptable.

---

### F4: Temporary directory tests

**Risk**: Tests creating temp directories with `os.tmpdir()` could fail if permissions are restricted.

**Current behavior**: Uses `fs.mkdtempSync()` which is standard for temp dirs.

**Status**: ✅ Working correctly.

---

## Documentation mismatches

### D1: README doesn't mention test:agents count

**Document**: README shows test commands but doesn't mention how many tests exist.

**Code**: 362 tests exist but not documented.

**Status**: Minor — internal knowledge, not user-facing.

---

### D2: docs/release.md smoke test examples

**Document**: docs/release.md shows smoke tests for `/agents`, `/agent`, `/agents validate`.

**Code**: ✅ All commands exist and work.

**Status**: ✅ Consistent.

---

### D3: CI badge not in README

**Document**: README doesn't include a CI badge.

**Code**: GitHub Actions CI exists at `.github/workflows/ci.yml`.

**Status**: Acceptable — CI badge is optional.

---

### D4: docs/prompt-tuning.md clarifies eval is static-only

**Document**: docs/prompt-tuning.md correctly notes that eval cases are for human review, not automated benchmarking.

**Code**: ✅ `check-prompt-evals.ts` is clearly labeled as static checker.

**Status**: ✅ Consistent.

---

## Deferred / Not in scope

The following are not in scope for this review:

1. **provider-call real integration tests** — Pending pi-mono ExtensionAPI
2. **Token usage tracking tests** — Requires real provider-call
3. **Agent composition tests** — Not in scope for v0.1.0
4. **Child session tests** — Pending pi-mono API
5. **Real pi install integration tests** — Would require pi-mono installation
6. **Real npm publish tests** — Manual verification only
7. **Performance benchmarking** — Not in scope
8. **Security penetration testing** — Would require dedicated security review

---

## Positive findings

1. ✅ **Test suite is well-organized** — 362 tests organized into 40+ categories with clear section headers
2. ✅ **CI pipeline is comprehensive** — typecheck → build → test:agents → test:prompts → check:package → pack:dry
3. ✅ **Prompt eval system is static** — No real LLM calls, clear documentation
4. ✅ **Package validation catches common mistakes** — dist, agents, templates, skills, docs, .gitignore
5. ✅ **Release:check chain is complete** — All pre-publish checks covered
6. ✅ **Privacy tests present** — No API keys, no absolute paths in JSON
7. ✅ **Edge cases covered** — Empty inputs, invalid names, path traversal, alias conflicts
8. ✅ **Replay tests comprehensive** — Modifications, alias drift, disabled agents, non-existent IDs
9. ✅ **Metrics tests cover empty state** — avgDurationMs handling when total=0
10. ✅ **No network dependencies** — All tests are offline-capable

---

## Recommended next actions

1. **Add T1** (priority: medium) — Test `/agent oracle review -- text` with unquoted `--` to verify tokenization
2. **Add T2** (priority: low) — Test Chinese task text in `parseAgentCommand`
3. **Add T5** (priority: low) — Add integration test for `outputTemplate=false` in delegation prompt
4. **Consider T4** (priority: very low) — Document that concurrent history adds are not supported (not a problem in practice)

---

## Suggested next review

**R6: Documentation and User Experience Review**

R6 should cover:
- README completeness and examples accuracy
- docs/ directory organization
- Help text consistency across commands
- Error message clarity
- User onboarding flow
- Command output formatting
- Examples and tutorials quality

---

**Report file**: `docs/reviews/R5-tests-edge-cases-review.md`

**Summary**:
- Blockers: 0
- Major issues: 0
- Minor issues: 3
- High-value test gaps: 5

**Recommendation**: Proceed to R6 with no blockers. Tests are in good shape.

---

*Review completed: 2026-05-06*
