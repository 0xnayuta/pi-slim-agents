# R2 Agent / Template Loading and Config Review

## Scope

Review agent loading, template loading, and configuration management for pi-slim-agents v0.1.0. Focus on:
- Agent discovery and source priority
- Template loading and creation
- Frontmatter field validation
- Name/alias/tag security
- Config loading and merge
- Enable/disable behavior
- Validation system
- Metadata and source tracking
- Test coverage gaps
- Documentation consistency

## Files inspected

**Core source:**
- `src/agents.ts` — Agent loading, resolution, alias validation
- `src/templates.ts` — Template loading, creation, validation
- `src/config.ts` — Config loading and merge
- `src/types.ts` — Type definitions (FileMetadata, AgentDefinition, etc.)
- `src/utils.ts` — Utilities (isSafeAgentName, parseAgentFrontmatter)
- `src/metadata.ts` — File metadata collection
- `src/format.ts` — JSON output formatters
- `src/index.ts` — Extension entry point and handlers
- `src/runner.ts` — Delegation runner
- `src/commands.ts` — Command handlers and filtering

**Agent/template files:**
- `agents/explorer.md`, `agents/librarian.md`, `agents/oracle.md`
- `agents/fixer.md`, `agents/designer.md`, `agents/orchestrator.md`
- `templates/security-reviewer.md`, `templates/cpp-reviewer.md`, `templates/test-writer.md`
- All 7 template files

**Documentation:**
- `README.md`
- `docs/agent-authoring.md`
- `docs/design.md`
- `skills/use-slim-agents/SKILL.md`

**Tests:**
- `tests/agents.test.ts` (334 tests)

## Commands run

- `pnpm release:check` — ✅ All 334 tests pass, 13 package checks pass, dry-run pack succeeds

## Summary

1. **Agent loading works correctly** — Built-in agents load stably from package; project/user override works via priority chain (project > user > package). All 6 built-in agents and 7 templates verified present.

2. **Config merge is correct** — Project config overrides user config; disabled/agents configs merge as documented.

3. **Enable/disable behavior is correct** — Disabled agents excluded from routing hints, blocked from delegation, shown separately in `/agents` output. Aliases to disabled agents are also rejected.

4. **Name/alias/tag validation is comprehensive** — `isSafeAgentName()` and `isValidTag()` functions provide consistent security checks. Alias conflicts detected and logged.

5. **Validation system is thorough** — Checks description, body, readonly boundary, tags, alias conflicts, invalid names. Covers built-in, templates, user, and project agents.

6. **Metadata collection is non-fatal** — stat failures return null fields without crashing the extension.

7. **Critical type inconsistency found** — `src/types.ts` defines `FileMetadata` without `sourcePathKind`, but `src/metadata.ts` exports the updated version with `sourcePathKind`. This is a blocking issue that needs immediate fix.

8. **sourcePath sanitization incomplete** — Agent loading uses `collectFileMetadata()` without context, so `sourcePath` remains an absolute path. Only the `metadata` field benefits from proper sanitization via `collectFileMetadataWithContext()`.

9. **Some field validation gaps** — `temperature` has no range check (0-2), `recommendedMode` accepts any string, `role` field is not validated.

10. **Test coverage is comprehensive but some gaps** — High-value missing tests: user-level agent loading, config reference validation, package root detection edge cases.

---

## Blockers

### B1: FileMetadata Type Inconsistency

**Problem**: `src/types.ts` defines `FileMetadata` without `sourcePathKind` field, while `src/metadata.ts` exports the updated interface with `sourcePathKind: 'builtin' | 'project' | 'user' | 'external'`. The types are out of sync.

**Impact**: 
- TypeScript compiles without error (no compile-time catch)
- `AgentDefinition.metadata` uses `FileMetadata` from `types.ts`, not the updated one from `metadata.ts`
- JSON output won't include `sourcePathKind` even though `collectFileMetadataWithContext()` returns it
- Potential runtime type mismatches

**Location**: 
- `src/types.ts:10-21` — `FileMetadata` interface missing `sourcePathKind`
- `src/metadata.ts:11-17` — Updated interface with `sourcePathKind`
- `src/format.ts` — `formatAgentsJson` doesn't include `sourcePathKind` in metadata output

**Fix**: Update `FileMetadata` interface in `src/types.ts` to include `sourcePathKind` field and sync with `metadata.ts`. Update `formatAgentsJson` to include `sourcePathKind` in metadata output.

---

## Major Issues

### M1: sourcePath Not Sanitized in Agent Loading

**Problem**: `src/agents.ts` sets `sourcePath: entry.filePath` (line 161) with raw absolute path. The `collectFileMetadata()` function without context defaults to basename-only, but this is later overwritten by the raw path. Even worse, `AgentDefinition.sourcePath` is a separate field from `metadata.sourcePath`.

**Impact**: 
- `agent.sourcePath` (not `metadata.sourcePath`) leaks absolute paths in JSON output
- `formatAgentsJson` includes `metadata.sourcePath` but the separate `agent.sourcePath` field in `AgentJsonItem` comes from the unsanitized value

**Location**: 
- `src/agents.ts:161` — `sourcePath: entry.filePath` (raw absolute path)
- `src/format.ts:280` — `formatAgentsJson` doesn't include `agent.sourcePath` in output but `metadata` comes from `a.metadata` which IS sanitized

**Fix**: The metadata field IS properly sanitized via `collectFileMetadataWithContext()` (though it uses default context without packageRoot). The issue is that `AgentDefinition.sourcePath` is separate and unsanitized. Should either sanitize it or remove it from output. Check if `agent.sourcePath` is used in JSON output.

---

### M2: Template Name Stripping Not Documented

**Problem**: `src/templates.ts` line 92: `const cleanName = templateName.replace(/-template$/, '');`. Templates with `name: security-reviewer-template` become `security-reviewer`. This stripping behavior is not documented.

**Impact**: User confusion when template name doesn't match expected format. README shows template names without `-template` suffix.

**Location**: `src/templates.ts:92-93`

**Fix**: Document this behavior in `docs/agent-authoring.md` Templates Reference section and in `/agents templates` output.

---

### M3: recommendedMode Not Validated

**Problem**: No validation that `recommendedMode` field is one of `quick`, `normal`, or `deep`. Any string value is accepted without warning.

**Impact**: Invalid `recommendedMode` values silently accepted. No user feedback.

**Location**: `src/templates.ts` loadTemplates — accepts any string; `src/agents.ts` resolveAgents — accepts any string

**Fix**: Add validation in `validateAgents()` for `recommendedMode` field, warn on invalid values.

---

### M4: temperature Range Not Validated

**Problem**: `temperature` field accepts any number without checking if it's within reasonable range (e.g., 0-2). No validation in `validateAgents()`.

**Impact**: Invalid temperature values silently accepted. Could cause unexpected behavior.

**Location**: `src/templates.ts` — no range check; `src/agents.ts` — no range check

**Fix**: Add validation in `validateAgents()`: if temperature exists and is not a number in range 0-2, add a warning.

---

### M5: JSON Output Missing sourcePathKind

**Problem**: `formatAgentsJson()` includes `metadata.sourcePath` but not `metadata.sourcePathKind`. The field is added to `metadata.ts` but not propagated to JSON output.

**Impact**: API consumers cannot reliably understand the path's origin category. `sourcePathKind` helps determine if the path is relative, user-home-relative, etc.

**Location**: `src/format.ts:275-282` — `AgentJsonItem.metadata` interface missing `sourcePathKind`

**Fix**: Add `sourcePathKind` to the metadata object in `formatAgentsJson` and `formatTemplatesJsonFull`.

---

### M6: Package Root Detection Fragile

**Problem**: `getPackageAgentsDir()` in `src/agents.ts` assumes `import.meta.url` points to compiled `.js` in `dist/` and navigates up one level to find `agents/`. This works in the published package but could break if the package structure changes.

**Impact**: Inconsistent behavior if package structure changes or if imported from a different context.

**Location**: `src/agents.ts:233-238`

**Fix**: Consider using a more robust method, or document that this is intentional and stable.

---

### M7: Config Schema Not Validated

**Problem**: Unknown config fields are silently ignored. If user adds `unknownField: value` to config, it's silently dropped.

**Impact**: No feedback when config contains typos or unsupported fields. User may not realize their config override isn't working.

**Location**: `src/config.ts` — no schema validation

**Fix**: Add basic schema validation that warns about unknown fields. Could use a simple allowlist check.

---

## Minor Issues

### m1: Role Field Not Validated

**Problem**: `role` field in frontmatter is accepted as any string. No validation.

**Fix**: Consider adding validation if role has expected format.

---

### m2: Extra Fields Silently Ignored

**Problem**: Frontmatter fields not in `AgentFrontmatter` interface are silently ignored.

**Impact**: No feedback when user misspells a field name.

**Fix**: Could add warnings for unknown fields (but might be too noisy).

---

### m3: Template Validation Missing Some Checks

**Problem**: `validateAgents()` checks templates for description, tags, but not for:
- Empty body
- Temperature range
- recommendedMode validation

**Location**: `src/templates.ts` — template validation section

**Fix**: Add remaining template checks.

---

### m4: Built-in agents excluded from routing hint if disabled

**Observation**: Current implementation excludes ALL disabled agents from routing hint. This is correct. The hint only includes enabled agents.

**Status**: ✅ Working as intended.

---

### m5: createAgentFromTemplate doesn't auto-reload

**Problem**: Creating a new agent from template requires manual `/agents reload`. Some users might expect auto-reload.

**Impact**: Minor usability issue.

**Location**: `src/index.ts` handleCreate

**Fix**: Could add optional auto-reload or at least mention reload in success message (already present).

---

## Loading / Config Risks

### CR1: No test for user-level agent loading

**Risk**: User-level agents (`~/.pi/agent/slim-agents/agents/*.md`) are not tested. Path is constructed using `os.homedir()` which may behave differently in CI environments.

**Recommendation**: Add integration test that creates a fixture in temp user directory and verifies loading.

---

### CR2: No test for config reference to non-existent agent

**Risk**: `validateAgents()` has code that should warn about config enabling a non-existent agent, but the logic is commented out. If an agent is enabled in config but not found, no warning is generated.

**Location**: `src/templates.ts:500-505` — commented out logic

**Recommendation**: Implement or remove the commented code.

---

### CR3: Source priority cascade not testable without file system manipulation

**Risk**: Testing that project > user > package priority works correctly requires creating real files in multiple locations.

**Current state**: Only tested with built-in package agents and single project fixture.

---

### CR4: Alias collision detection order-dependent

**Observation**: `validateAndSanitizeAliases()` processes agents in load order. If two agents define the same alias, the first one wins. This is reasonable but not documented.

---

## Security / Privacy Concerns

### SP1: agent.sourcePath separate from metadata.sourcePath

**Concern**: `AgentDefinition.sourcePath` (line 161 in agents.ts) stores raw `entry.filePath`. While `metadata.sourcePath` is sanitized, the separate `sourcePath` field is also included in some outputs.

**Current behavior**: `formatAgentsJson` only includes `metadata.sourcePath`, not the top-level `sourcePath`. Check if other outputs leak it.

---

### SP2: Frontmatter regex pattern is lenient

**Observation**: `parseAgentFrontmatter()` uses `/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/` which is relatively lenient. Malformed frontmatter is handled gracefully (returns empty frontmatter).

**Status**: ✅ Acceptable behavior.

---

### SP3: path.join used for target path in createAgentFromTemplate

**Observation**: `path.join(cwd, PROJECT_AGENTS_DIR, `${agentName}.md`)` is used. The `agentName` is validated via `isSafeAgentName()` before this, so path traversal is blocked.

**Status**: ✅ Safe.

---

## Test Coverage Gaps

### T1: User-level agent loading test (High value)

**Gap**: No test verifies that agents in `~/.pi/agent/slim-agents/agents/` load correctly with source='user'.

**Recommendation**: Add test that creates a temp user agents directory, writes an agent file, and verifies it loads with correct source.

---

### T2: Config reference validation test (Medium value)

**Gap**: `validateAgents()` has commented-out code for checking if enabled config references a non-existent agent. No test exists.

**Recommendation**: Either implement the check or remove the commented code.

---

### T3: Package root detection edge cases (Medium value)

**Gap**: `getPackageAgentsDir()` assumes specific directory structure. No test for alternative import contexts.

**Recommendation**: Add test that verifies agents load when the extension is installed in different scenarios.

---

### T4: Alias collision priority test (Low-Medium value)

**Gap**: No test verifies that when two agents define the same alias, the higher-priority source wins.

**Recommendation**: Add test that creates fixture with conflicting aliases in project and user levels.

---

### T5: temperature range validation test (Low value)

**Gap**: No test verifies that out-of-range temperature values trigger a validation warning.

**Recommendation**: Add test agent with `temperature: 5.0` and verify validation catches it.

---

### T6: recommendedMode validation test (Low value)

**Gap**: No test verifies that invalid `recommendedMode` values are caught by validation.

**Recommendation**: Add test template with `recommendedMode: invalid` and verify validation warns.

---

## Documentation Mismatches

### D1: docs/design.md FileMetadata interface outdated

**Document**: `docs/design.md` line 317-326 shows `FileMetadata` interface without `sourcePathKind` field.

**Code**: `src/metadata.ts` has `sourcePathKind` field.

**Fix**: Update design.md to reflect current interface.

---

### D2: docs/design.md sourcePath description inaccurate

**Document**: `docs/design.md` line 318 says `sourcePath: string; // Absolute path` — this is not accurate. sourcePath is sanitized to relative paths.

**Fix**: Update comment to reflect privacy-first design.

---

### D3: README Temperature range not specified

**Document**: `README.md` doesn't specify the valid range for `temperature` field.

**Code**: Accepts any number, but documentation says "LLM temperature (0.0-1.0)" in agent-authoring.md but "0.2" default elsewhere.

**Fix**: Clarify the temperature range and whether it's validated.

---

### D4: Template name stripping not documented

**Document**: `docs/agent-authoring.md` Templates Reference table shows template names without `-template` suffix.

**Code**: `src/templates.ts` strips `-template` suffix automatically.

**Fix**: Add note explaining that template name in frontmatter may include `-template` suffix which will be stripped.

---

## Deferred / Not in Scope

The following topics are not in scope for this review phase:

1. **provider-call real integration** — Known limitation, documented and expected
2. **Token usage tracking** — Pending real provider-call
3. **Agent composition / pipelines** — Not in scope for v0.1.0
4. **Child session delegation** — Pending pi-mono API
5. **Command parser review** — Covered in R3 scope
6. **Runner/history review** — Covered in separate review phases
7. **MCP integration** — Not in scope
8. **Prompt quality / eval coverage** — Covered by prompt eval checker

---

## Positive Findings

1. **Source priority is correctly implemented** — project > user > package order is enforced
2. **Enable/disable works correctly** — disabled agents blocked from delegation, routing hints, and /agent command
3. **Alias validation is comprehensive** — checks for conflicts with agent names, other aliases, invalid names
4. **Config merge is correct** — project overrides user with proper array merge for `disabled`
5. **Template creation is secure** — agent name validated before path creation, --force flag required for overwrite
6. **Validation is thorough** — covers all agent sources and templates, distinguishes errors from warnings
7. **Non-fatal metadata collection** — stat failures don't crash the extension
8. **Routing hint filters correctly** — only enabled agents included
9. **Test coverage is extensive** — 334 tests cover all major functionality
10. **Documentation is comprehensive** — README, design doc, agent authoring guide all present and mostly accurate

---

## Recommended Next Actions

1. **Fix B1 (priority: critical)** — Sync `FileMetadata` interface in `src/types.ts` with `src/metadata.ts`. Add `sourcePathKind` field. Update JSON output to include `sourcePathKind`.

2. **Fix M1 (priority: high)** — Investigate `agent.sourcePath` usage in JSON output. Ensure no raw paths leak. Consider removing or sanitizing `AgentDefinition.sourcePath`.

3. **Fix M5 (priority: medium)** — Add `sourcePathKind` to JSON metadata output.

4. **Add T1 (priority: medium)** — Add user-level agent loading test for coverage.

5. **Fix CR2 (priority: medium)** — Either implement config reference validation or remove commented code.

6. **Add D1, D2 fixes (priority: low)** — Update docs/design.md to reflect current interface.

---

## Suggested Next Review

**R2-fix: Agent / Template Loading and Config Fix**

After fixing B1, M1, M5, and the doc mismatches, proceed to:

**R3: Command Parsing and CLI UX Review**

Review:
- `/agent` command parsing
- `/agents` subcommand parsing
- Flag handling (--format, --regex, --mode, etc.)
- Help text accuracy
- Error message consistency
- Output format consistency (text vs JSON)

---

**Report file**: `docs/reviews/R2-agent-template-loading-config-review.md`

**Summary**:
- Blockers: 1
- Major issues: 7
- Minor issues: 5
- Loading/config risks: 4
- Security/privacy concerns: 3
- Test coverage gaps: 6
- Documentation mismatches: 4

**Recommendation**: Proceed to R2-fix to resolve B1 before R3.

---

*Review completed: 2026-05-06*