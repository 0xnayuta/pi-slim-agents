# Release 0.1.0 Prep

**Date**: 2026-05-06
**Status**: Release-ready

## Scope

This document records the final release preparation for v0.1.0. This phase **does NOT** include:

- `npm publish`
- `git tag`
- `git push` to remote
- New features or functionality changes
- Fixes to R7 Minor issues (deferred to post-0.1.0)

This phase prepares the project to the state where **manual publish** can proceed.

---

## Version Status

| Item | Status |
|------|--------|
| `package.json` version | ✅ `0.1.0` |
| `package.json` name | ✅ `@0xnayuta/pi-slim-agents` |
| pi manifest | ✅ Correct (`extensions` + `skills`) |
| files array | ✅ Complete (dist, agents, templates, skills, docs, examples, scripts) |
| CHANGELOG.md | ✅ `[0.1.0] - 2026-05-06` (updated from Unreleased) |
| README.md Status | ✅ "Release-ready" (updated from "Release Candidate") |
| README.md Install | ✅ Clear pending-notice for npm install |

---

## Files Changed

| File | Change |
|------|--------|
| `CHANGELOG.md` | Changed `## [0.1.0] - Unreleased` → `## [0.1.0] - 2026-05-06` |
| `README.md` | Updated Status section: "Release Candidate" → "Release-ready" |
| `README.md` | Updated Installation note for clarity |
| `docs/release.md` | Added npm whoami step, enhanced smoke test commands, added GitHub Release section |
| `docs/roadmap.md` | Added "Post-0.1.0 Follow-ups" section with R7 Minor items |

---

## Commands Run

| Command | Result |
|---------|--------|
| `pnpm typecheck` | ✅ Passed |
| `pnpm build` | ✅ Passed |
| `pnpm test:agents` | ✅ 362 passed, 0 failed |
| `pnpm test:prompts` | ✅ All 7 checks passed |
| `pnpm check:package` | ✅ 13 passed, 0 warnings |
| `pnpm pack:dry` | ✅ Correct contents |
| `pnpm release:check` | ✅ Full chain passed |

---

## Pack Dry-run Summary

### Included ✅

| Content | Status |
|---------|--------|
| `dist/` | ✅ Yes (all .js and .d.ts) |
| `agents/` | ✅ Yes (6 files: explorer, librarian, oracle, fixer, designer, orchestrator) |
| `templates/` | ✅ Yes (7 files: security-reviewer, test-writer, doc-generator, refactor-planner, bug-triager, release-checker, cpp-reviewer) |
| `skills/` | ✅ Yes (`use-slim-agents/SKILL.md`) |
| `docs/` | ✅ Yes (all docs including reviews) |
| `examples/prompt-evals/` | ✅ Yes (8 eval files) |
| `scripts/check-prompt-evals.ts` | ✅ Yes |
| `README.md` | ✅ Yes |
| `LICENSE` | ✅ Yes |
| `CHANGELOG.md` | ✅ Yes |
| `package.json` | ✅ Yes |

### Excluded ✅

| Content | Status |
|---------|--------|
| `tests/` | ✅ Excluded |
| `src/` | ✅ Excluded |
| `.github/` | ✅ Excluded |
| `.pi/` | ✅ Excluded |
| `history.jsonl` | ✅ Excluded |
| `.env` | ✅ Excluded |
| `tmp/` | ✅ Excluded |
| `coverage/` | ✅ Excluded |
| `node_modules/` | ✅ Excluded |

---

## Release Notes Draft

```markdown
## v0.1.0

**Lightweight specialist agents for pi-coding-agent**

### What's New

- **6 built-in slim agents**: explorer, librarian, oracle, fixer, designer, orchestrator
- **`/agent` shortcut**: `/agent explorer find playback code` with `--mode` flag (quick, normal, deep)
- **Agent aliases**: `search`→explorer, `arch`→oracle, `fix`→fixer, `ui`→designer, `route`→orchestrator
- **7 templates**: security-reviewer, test-writer, doc-generator, refactor-planner, bug-triager, release-checker, cpp-reviewer
- **Tags & filtering**: `/agents --tag review --readonly`
- **JSON output**: `--format json` on all commands
- **History & metrics**: `/agents history`, `/agents metrics`, `/agents replay 5`
- **Agent validation**: `/agents validate`
- **Enable/disable config**: Per-agent enabled flag
- **Persistent history**: Optional JSONL-based storage

### Prompt Eval Examples

- `examples/prompt-evals/` with 4+ eval cases per agent
- `pnpm test:prompts` for static prompt quality checks

### Installation

```bash
pi install npm:@0xnayuta/pi-slim-agents
```

### ⚠️ Known Limitations

- **Provider-call is architectural only** — falls back to prompt-only mode
- Real model calls pending pi-mono ExtensionAPI stability
- No token usage tracking (requires real provider-call)

### Full Changelog

See [CHANGELOG.md](CHANGELOG.md) for complete feature list.
```

---

## Manual Publish Checklist

The following commands should be executed **manually** to complete the release:

### 1. Verify clean state

```bash
git status
```

### 2. Stage and commit prep changes

```bash
git add CHANGELOG.md README.md docs/release.md docs/roadmap.md
git commit -m "chore: prepare v0.1.0 release"
```

### 3. Run final release check

```bash
pnpm release:check
```

Must pass before proceeding.

### 4. Verify npm login

```bash
npm whoami
```

Must show `0xnayuta`.

### 5. Publish to npm

```bash
npm publish --access public
```

### 6. Create git tag

```bash
git tag v0.1.0
```

**Recommended**: Create tag after npm publish to ensure the published version matches the tag.

### 7. Push commit and tag

```bash
git push origin main
git push origin v0.1.0
```

### 8. Create GitHub Release

1. Go to: https://github.com/0xnayuta/pi-slim-agents/releases/new
2. Select tag: `v0.1.0`
3. Release title: `v0.1.0`
4. Copy release notes from above

### 9. Post-release smoke test

```text
pi install npm:@0xnayuta/pi-slim-agents
/agents
/agent explorer find where agents are loaded
/agents validate
/agents status
/agents templates
/agents history
/agents metrics
```

---

## Post-release Smoke Test

After `npm publish` and `pi install`:

| Command | Expected Result |
|---------|-----------------|
| `/agents` | Shows 6 built-in agents |
| `/agent explorer test` | Delegation result in prompt-only mode |
| `/agents status` | Shows runnerMode, provider-call availability |
| `/agents templates` | Shows 7 templates |
| `/agents validate` | All checks pass |
| `/agent --format json oracle test` | Valid JSON response |

---

## Remaining Post-0.1.0 Follow-ups

### From R7 Final Release Readiness Review

| Issue | Category | Priority |
|-------|----------|----------|
| Unicode/Chinese input tests | Test coverage | Low |
| Repeated flag tests | Test coverage | Low |
| outputTemplate=false integration test | Test coverage | Low |
| Concurrent history append tests | Test coverage | Low |
| --flag-like text in task parsing | Documentation | Low |
| README table of contents | Documentation | Low |
| --source filter not in README | Documentation | Low |
| docs/ no navigation index | Documentation | Low |

### Features / Spikes

| Item | Priority |
|------|----------|
| Provider-call feasibility spike | Medium |
| Tag autocomplete in /agent | Low |
| Token usage tracking | Low |

### Dogfooding

- Use /agent, /agents, templates in actual development workflow
- Real-world prompt tuning based on usage

---

## Recommendation

### ✅ Ready for Manual Publish

All release-prep tasks completed:

1. **Version confirmed**: `0.1.0` in package.json
2. **CHANGELOG updated**: Date set to 2026-05-06
3. **README updated**: Status changed to "Release-ready"
4. **Release docs enhanced**: docs/release.md now includes full checklist
5. **Post-0.1.0 documented**: R7 Minor items recorded in roadmap
6. **All tests passing**: 362 unit tests + 7 prompt checks
7. **Package contents verified**: Correct files included/excluded
8. **Release pipeline confirmed**: pnpm release:check passes

### This Phase Did NOT Include

- ❌ npm publish
- ❌ git tag
- ❌ git push
- ❌ New features
- ❌ R7 Minor fixes
- ❌ provider-call real integration

### Next Step

Proceed with **manual publish** using the commands in "Manual Publish Checklist" above.

---

*Report generated: 2026-05-06*
*Report file: `docs/reviews/Release-0.1.0-prep.md`*
