# R6-fix — Documentation and User Experience Fixes

## Issues Fixed

### B1: README Attribution 中英混杂 ✅ Fixed

**Changed**: `README.md` line ~402, Attribution section

**Before**:
```
It only借鉴轻量专家角色设计思想，并重写为 pi-mono extension for the pi-coding-agent ecosystem.
```

**After**:
```
It only adapts the lightweight specialist-agent design idea and rewrites it as a pi-mono extension.
```

The attribution paragraph is now fully English and maintains the original meaning:
- Not an OpenCode plugin
- Does not port the full runtime
- Adapts the lightweight specialist-agent design idea
- Rewrites as pi-mono extension

---

### M1: README 与 CHANGELOG 版本状态不一致 ✅ Fixed

**Changed**: `README.md` Status section

**Before**:
```
**v0.1.0 — Release Ready (M13)**

This is the first public release of pi-slim-agents. The core delegation system is functional and stable.
```

**After**:
```
**v0.1.0 — Release Candidate**

This is the first release of pi-slim-agents. The core delegation system is functional and ready for use. npm publication is pending.
```

**Consistency achieved**:
- README: "Release Candidate" + "npm publication is pending"
- CHANGELOG: `[0.1.0] - Unreleased` (unchanged — will be updated on publish day)
- package.json: `version: 0.1.0` (unchanged)

---

### M2: docs/roadmap.md 缺少 M12 和 M13 ✅ Fixed

**Changed**: `docs/roadmap.md` — Added M12 and M13 after M11

**M12: Prompt Tuning / Lightweight Eval Examples** includes:
- examples/prompt-evals/ directory with 6 agent + template evals
- docs/prompt-tuning.md with quality checklist
- Static prompt eval checker
- Built-in agent prompt tightening for all 6 agents
- pnpm test:prompts integration

**M13: Release Hardening / v0.1.0 Readiness** includes:
- Package hardening (.npmignore, .gitignore, check-package.ts)
- README / CHANGELOG / release docs
- GitHub Actions CI pipeline
- pnpm release:check chain
- prepublishOnly hook
- Multi-round code review (R0–R6)
- 362+ tests
- Provider-call remains "architectural only"

**Also updated**: `CHANGELOG.md` reference from "M2–M12" to "M2–M13"

---

### M3: docs/design.md JSON kind 表格缺少 agentResult 和 error ✅ Fixed

**Changed**: `docs/design.md` JSON kind table (lines ~133-140)

**Added**:
| kind | Description |
|------|-------------|
| `agentResult` | Delegation result from /agent command (success or error) |
| `error` | Format/regex validation error response |

The table now covers all 8 JSON kinds implemented in `src/format.ts`:
- agents, templates, status, history, metrics, validation
- agentResult (M11)
- error (M11)

---

### M4: README "Or install with pnpm" 与 npm 段重复 ✅ Fixed

**Changed**: `README.md` Installation section

**Before**:
```
## Installation

### Local development
...

### npm (after release)
...
Or install with pnpm:
...
> **Note**: npm publication is pending.
```

**After**:
```
## Installation

### From npm (after release)
...
> **Note**: npm publication is pending.

### Local development
...
```

The redundant "npm" section was removed. The installation instructions now have:
1. From npm (after release) — main user path
2. Local development — for contributors

---

## Verification

| Command | Result |
|---------|--------|
| `pnpm typecheck` | ✅ Passed |
| `pnpm build` | ✅ Passed |
| `pnpm test:agents` | ✅ 362 passed |
| `pnpm test:prompts` | ✅ All checks passed |
| `pnpm check:package` | ✅ 13 passed |

---

## Files Changed

| File | Changes |
|------|---------|
| `README.md` | Fixed Attribution (B1), Status (M1), Installation (M4) |
| `docs/roadmap.md` | Added M12 and M13 milestones (M2) |
| `docs/design.md` | Added agentResult and error to JSON kind table (M3) |
| `CHANGELOG.md` | Updated milestone reference to M2–M13 (M2) |

---

## R6 Issues Status

| Issue | Status |
|-------|--------|
| B1: README Attribution 中英混杂 | ✅ Fixed |
| M1: README 与 CHANGELOG 版本状态不一致 | ✅ Fixed |
| M2: docs/roadmap.md 缺少 M12 和 M13 | ✅ Fixed |
| M3: docs/design.md JSON kind 表格缺少 agentResult 和 error | ✅ Fixed |
| M4: README "Or install with pnpm" 与 npm 段重复 | ✅ Fixed |

---

*Fix completed: 2026-05-06*
