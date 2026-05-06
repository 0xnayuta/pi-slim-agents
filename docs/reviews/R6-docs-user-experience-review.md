# R6 Documentation and User Experience Review

## Scope

Review documentation completeness, user onboarding flow, command help consistency, and UX for pi-slim-agents v0.1.0. Focus on README, docs/, examples/, skills/, and code help text.

## Files inspected

**Main docs:**
- `README.md` — 400+ lines, primary user-facing doc
- `CHANGELOG.md` — v0.1.0 entries, `[0.1.0] - Unreleased`
- `docs/design.md` — Architecture, JSON schema, design decisions
- `docs/roadmap.md` — Milestone history (M2–M11), planned features
- `docs/provider-call.md` — Full investigation, architectural status
- `docs/agent-authoring.md` — Agent creation guide with frontmatter reference
- `docs/prompt-tuning.md` — Prompt quality checklist

**Examples:**
- `examples/prompt-evals/README.md` — Eval structure and usage
- `examples/prompt-evals/*.eval.md` — 6 agent + template eval files

**Skills:**
- `skills/use-slim-agents/SKILL.md` — User-facing skill guide

**Agents/Templates (sample):**
- `agents/explorer.md`, `agents/oracle.md`, `agents/designer.md`, `agents/fixer.md`, `agents/librarian.md`, `agents/orchestrator.md`
- `templates/*.md` — 7 template files

**Code:**
- `src/commands.ts` — Help text generators (`buildAgentHelpText`)
- `src/index.ts` — Command registration, subcommand dispatch
- `package.json` — scripts, description, keywords, pi manifest

## Commands run

| Command | Result |
|---------|--------|
| `pnpm typecheck` | ✅ Passed |
| `pnpm test` | ✅ 362 tests passed |
| `pnpm check:package` | ✅ 13 passed |

## Summary

1. **Documentation is comprehensive and well-organized** — 6 doc files covering design, authoring, provider-call, prompt tuning, roadmap, and release process.

2. **User onboarding is well-structured** — README provides clear project positioning ("NOT a full subagent framework"), Quick Start is executable, Built-in Agents table is scannable, and Templates section guides new users.

3. **Help text is accurate and consistent** — `/agent` help text matches README examples (including `--format` flag added in R3-fix). All documented commands exist in code.

4. **One critical content issue found** — README Attribution section (line ~402) contains Chinese characters mixed with English text. This is a user-facing quality issue.

5. **Release status documentation is inconsistent** — README says "Release Ready (M13)" but CHANGELOG says "[0.1.0] - Unreleased" and mentions "npm publication is pending". Roadmap doesn't document M12/M13.

6. **JSON kind table in design.md is incomplete** — Missing `agentResult` and `error` kinds that are implemented and documented elsewhere.

7. **README is lengthy (400+ lines)** — Good depth but could benefit from a table of contents or "start here" guide for new users.

8. **Onboarding flow is mostly smooth** — New users can get from installation to first `/agent` command in minutes. Minor gaps: config file location not emphasized enough, `--source` filter not documented.

9. **Provider-call status is well-documented** — docs/provider-call.md is thorough and clearly marks the feature as architectural-only.

10. **docs/ lacks a navigation index** — No docs/README.md or top-level index. Users must navigate via README links or guess filenames.

---

## Blockers

### B1: README Attribution contains Chinese text

**Problem**: Line ~402 of README.md mixes Chinese characters with English in a user-facing document:
```
It only借鉴轻量专家角色设计思想，并重写为 pi-mono extension for the pi-coding-agent ecosystem.
```

**Impact**: User-facing quality issue. Looks like a translation artifact or AI tool output. Makes the project appear unprofessional.

**Location**: `README.md`, line ~402, Attribution section.

**Suggestion**: Replace with English equivalent:
```
It only draws on the lightweight expert role design philosophy and was rewritten as a pi-mono extension for the pi-coding-agent ecosystem.
```
Or simpler:
```
It only adopts the lightweight specialist role design philosophy and was rewritten for the pi-coding-agent ecosystem.
```

---

## Major Issues

### M1: Release status inconsistent between README and CHANGELOG

**Problem**: 
- README header says `**v0.1.0 — Release Ready (M13)**`
- CHANGELOG.md says `## [0.1.0] - Unreleased`
- README npm section says `> **Note**: npm publication is pending.`

**Impact**: Users and maintainers are confused about whether this is ready to publish. The "Release Ready (M13)" claim contradicts "Unreleased" status.

**Location**: 
- `README.md` line 7
- `CHANGELOG.md` line 5
- `README.md` line ~68

**Suggestion**: 
1. Change CHANGELOG.md from `[0.1.0] - Unreleased` to `[0.1.0] - 2026-05-06` before publish
2. Remove "npm publication is pending" note once published
3. Keep "Release Ready" in README since it's pre-release "ready" (code complete)

---

### M2: Roadmap missing M12 and M13 milestones

**Problem**: 
- CHANGELOG.md says "M2–M12" milestone history
- README mentions M13 as the release milestone
- docs/roadmap.md only documents M2–M11

**Impact**: Roadmap doesn't reflect current project state. Users reviewing roadmap won't see M12/M13 accomplishments.

**Location**: `docs/roadmap.md` — ends at M11. `README.md` line 7 references M13.

**Suggestion**: Add M12 and M13 sections to roadmap.md, or update CHANGELOG reference to say "M2–M11" and add a note about M12/M13 being minor refinements.

---

### M3: JSON kind table incomplete in design.md

**Problem**: The JSON kind table in docs/design.md (lines ~133-140) lists 6 kinds but is missing the two implemented kinds: `agentResult` and `error`.

**Impact**: Developers reading design.md for JSON schema reference will miss these kinds. The kinds are documented in the M11 section but not in the summary table.

**Location**: `docs/design.md`, JSON kind table (~lines 133-140)

**Suggestion**: Add to the table:
```
| `agentResult` | Delegation result from /agent command |
| `error` | Format/regex validation error response |
```

---

### M4: "Or install with pnpm" redundancy under npm section

**Problem**: Under "npm (after release)", the README says:
```
### npm (after release)

```bash
pi install npm:@0xnayuta/pi-slim-agents
```

Or install with pnpm:
```bash
pi install npm:@0xnayuta/pi-slim-agents
```
```

**Impact**: Confusing. pnpm IS the package manager being used. "Install with pnpm" makes it sound like a separate option.

**Location**: `README.md`, lines ~61-68

**Suggestion**: Remove the redundant section. The npm install command works regardless of which npm-compatible package manager is used.

---

## Minor Issues

### m1: README is long (400+ lines) without navigation

**Gap**: No table of contents or quick-jump links. New users reading linearly need to scroll through everything.

**Impact**: Low — the content is organized, but a TOC would help users find specific sections.

---

### m2: Roadmap section in README suggests M14-M17 but these are aspirational

**Gap**: The Roadmap section says "Potential future milestones: M14..." but doesn't clarify these are NOT committed.

**Impact**: Low — the "Potential" qualifier helps, but the roadmap.md is the authoritative source.

---

### m3: docs/ directory lacks a navigation index

**Gap**: No `docs/README.md` or index file. Users navigate via README links or guess.

**Impact**: Low — README links to all docs files directly.

---

### m4: `--source builtin|user|project` filter not documented in README

**Gap**: The `--source` filter for agents is documented in CHANGELOG and works in code, but README's filter documentation only shows `--tag`, `--query`, `--readonly/--writable`.

**Impact**: Low — power users may not discover this filter.

---

### m5: "slim" meaning not explained in README headline

**Gap**: "Lightweight specialist agents" is in the description but "slim" in the project name isn't directly explained.

**Impact**: Very low — the "What this is NOT" section and Status table make it clear enough.

---

## Onboarding Risks

### OR1: New user doesn't know where to put config

**Risk**: README shows config example but doesn't explicitly say "Create `.pi/slim-agents.json` in your project root."

**Current behavior**: The config section is in the middle of README. A user jumping straight to "How do I customize?" might not find it.

**Mitigation**: The `/agents create` flow (templates → create → validate → reload) is documented and works end-to-end.

---

### OR2: User confused about "slim" vs full subagent frameworks

**Risk**: "What this is NOT" section is clear but brief. Users expecting CrewAI/LangChain-style orchestration will be disappointed.

**Mitigation**: Status table with ✅/⚠️ indicators makes capabilities clear. Provider-call is clearly marked as architectural-only.

---

### OR3: User expects real model calls after seeing "Provider-call runner"

**Risk**: The Status table shows "Provider-call runner ⚠️ Architectural only". Some users might not read the warning.

**Mitigation**: README Current Limitations section is explicit. `/agents status` also shows availability.

---

## Command UX Issues

### UX1: Help text consistency — /agent vs /agents

**Status**: ✅ `/agent` help text is accurate and matches README:
- Lists `--mode` and `--format` flags (added in R3-fix)
- Shows alias mappings
- Lists 6 example commands
- Lists supported modes and formats

**Check**: `/agents` help text (shown via `ctx.ui.notify`) describes subcommands. Standalone fallbacks exist and are registered.

---

### UX2: JSON output examples are accurate

**Status**: ✅ README JSON examples match actual implementation:
- `agentResult` kind with `task.summary`, `providerCall`, `output` fields — matches R4-fix implementation
- `schemaVersion: 1` used throughout
- Privacy note accurate: "No API keys, no full prompts, no full task text in JSON output"

---

### UX3: Error messages are clear and actionable

**Status**: ✅ Sample errors checked:
- `UNKNOWN_AGENT`: Shows available agents list
- `INVALID_MODE`: Lists valid modes (quick, normal, deep)
- `INVALID_FORMAT`: Lists valid formats (text, json)
- `ALIAS_CONFLICT`: Shows conflicting agents
- No absolute paths in errors (privacy)
- No stack traces in errors

---

### UX4: `/agents validate` documented consistently

**Status**: ✅ Appears in:
- README Quick Start section
- README Templates section
- docs/agent-authoring.md (dedicated section)
- skills/use-slim-agents/SKILL.md
- docs/agent-authoring.md "Common Errors" section

---

### UX5: Output template tags documented

**Status**: ✅ docs/agent-authoring.md shows `<summary>`, `<issues>`, `<analysis>`, `<results>` tags. Skills guide shows XML-like structured output format.

---

## Documentation Mismatches

### DM1: JSON kinds table missing `agentResult` and `error`

**Document**: docs/design.md, JSON kind table (~lines 133-140)
**Code**: `src/format.ts` implements `agentResult` (line 115) and `error` (line 579)

---

### DM2: CHANGELOG references M2-M12 but M13 exists

**Document**: CHANGELOG.md line 90: "See docs/roadmap.md for milestone history (M2–M12)"
**Reality**: README references M13; roadmap.md ends at M11

---

### DM3: Roadmap shows v0.3.0, v0.4.0, v0.5.0 under "Planned"

**Document**: docs/roadmap.md
**Status**: ✅ Correctly marked as "Planned" with pending items noted

---

### DM4: Attribution section has Chinese text

**Document**: README.md line ~402
**Status**: ❌ Should be English only (see B1)

---

## Example / Tutorial Gaps

### TG1: No "from zero to first delegation" tutorial

**Gap**: README Quick Start is good but a step-by-step tutorial for first-time users (in docs/ or README) would help.

**Impact**: Low — Quick Start covers the essentials.

---

### TG2: No JSON scripting example

**Gap**: README mentions `--format json` but doesn't show a concrete scripting example (e.g., `jq` usage, CI integration).

**Impact**: Low — the JSON schema is documented and `schemaVersion` is present.

---

### TG3: No pi-lsp integration example

**Gap**: docs/agent-authoring.md mentions "Integration with pi-lsp" but doesn't show a concrete example.

**Impact**: Very low — the mention is brief but accurate. Real integration depends on user's pi-lsp setup.

---

## Release Documentation Risks

### RR1: docs/release.md smoke test commands are accurate

**Status**: ✅ `/agents`, `/agent oracle review this design`, `/agents validate` all work.

---

### RR2: prepublishOnly runs release:check

**Status**: ✅ `package.json` has `"prepublishOnly": "pnpm release:check"` which prevents accidental publish.

---

### RR3: CI badge not in README

**Status**: ✅ CI exists but README doesn't show a badge. Acceptable — badge is optional.

---

### RR4: npm package name consistent

**Status**: ✅ `@0xnayuta/pi-slim-agents` used consistently in README, package.json, docs.

---

## R5 Carry-over Recommendations

| Issue | Category | Recommendation |
|-------|----------|----------------|
| m1: No Unicode/Chinese input tests | Minor | Defer to R5-fix |
| m2: No repeated flag tests | Minor | Defer to R5-fix |
| m3: CI doesn't run pack:dry explicitly | Minor | Already runs in CI step list |
| T1: `--flag-like` text in task | Minor | Document in docs/agent-authoring.md: "Quote task text containing `--`" |
| T2: Chinese frontmatter | Minor | Document limitation if needed |
| T4: Concurrent history adds | Minor | Defer |
| T5: outputTemplate=false | Minor | Defer |

**B1 (Chinese text in README) should be fixed before release** — it's a user-facing content quality issue, not a test gap.

---

## Deferred / Not in Scope

- Real provider-call integration docs (pending pi-mono ExtensionAPI)
- Token usage tracking docs (requires real provider-call)
- Agent composition docs (not in scope for v0.1.0)
- Child session delegation docs (pending pi-mono API)
- pi-lsp deep integration examples (depends on user's pi-lsp setup)
- CI badge in README (optional)

---

## Positive Findings

1. ✅ **Project positioning is clear and accurate** — "What this is NOT" section is explicit. Status table with ✅/⚠️ indicators makes capabilities unambiguous.

2. ✅ **Quick Start is executable** — 5 commands that work end-to-end. `/agents`, `/agent oracle`, `/agents templates`, `/agents create`, `/agents validate` all work.

3. ✅ **Provider-call status is thoroughly documented** — docs/provider-call.md is 200+ lines of investigation, root cause analysis, candidate solutions, and decision log. No ambiguity.

4. ✅ **Help text is accurate and complete** — `/agent` help text matches README examples including `--format` flag (R3-fix verified).

5. ✅ **Error messages are actionable** — Unknown agent shows available list. Invalid mode lists valid modes. Alias conflict shows conflicting agents.

6. ✅ **Prompt eval system is clearly labeled as static** — examples/prompt-evals/README.md explicitly says "NOT automatic benchmarks" and lists what's not included.

7. ✅ **docs/agent-authoring.md is comprehensive** — 500+ lines covering frontmatter, prompts, tags, aliases, validation, common errors, overriding, disabling.

8. ✅ **docs/prompt-tuning.md is detailed** — 250+ lines with per-agent failure modes, checklist, role definitions. Useful for agent authors.

9. ✅ **Release process is well-documented** — docs/release.md covers pre-flight checklist, version update, publishing, post-release verification, rollback.

10. ✅ **docs/roadmap.md is detailed** — M2–M11 milestones with feature lists, test counts, and clear "Planned" sections for future versions.

11. ✅ **Skills guide is user-friendly** — skills/use-slim-agents/SKILL.md provides decision tree for agent selection, delegation principles, and "when NOT to delegate".

12. ✅ **JSON schema uses `schemaVersion`** — Forward compatibility consideration is documented in design.md.

13. ✅ **Privacy is documented** — README and design.md both explain what's NOT included in JSON output.

14. ✅ **Package description is accurate** — "Lightweight specialist agents for pi-coding-agent — lean expert roles without heavy orchestration" matches implementation.

15. ✅ **README includes npm/pnpm/local install options** — Clear distinction between local dev and future npm usage.

---

## Recommended Next Actions

### Must fix before release (Blockers):
1. **B1**: Fix Chinese text in README Attribution section

### Should fix before release (Major):
2. **M1**: Align release status — change CHANGELOG to "2026-05-06" and update README npm note
3. **M2**: Add M12/M13 to roadmap.md or update CHANGELOG reference
4. **M3**: Add `agentResult` and `error` to JSON kind table in design.md
5. **M4**: Remove redundant "Or install with pnpm" section

### Can fix after release (Minor):
6. Add table of contents to README (400+ lines is dense)
7. Add docs/README.md navigation index
8. Document `--source` filter in README
9. Consider a "From Zero to First Delegation" tutorial in docs/

---

## Suggested Next Review

**R7: Final Release Blockers and v0.1.0 Readiness Review**

R7 should verify:
- B1 (Chinese text) is fixed
- M1-M4 (release status, roadmap, JSON table, pnpm section) are addressed
- CHANGELOG date is set
- README "npm publication pending" note is removed
- All review fix reports are complete (R0-fix through R5-fix status)
- Final smoke test: `pnpm release:check` passes end-to-end
- Package is ready for npm publish

---

**Report file**: `docs/reviews/R6-docs-user-experience-review.md`

**Summary**:
- Blockers: 1 (B1: Chinese text in README Attribution)
- Major issues: 4 (M1-M4: release status, roadmap, JSON table, pnpm redundancy)
- Minor issues: 5

**Recommendation**: Fix B1 and M1-M4 before release, then proceed to R7.

---

*Review completed: 2026-05-06*
