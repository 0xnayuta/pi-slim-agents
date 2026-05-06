# Release Guide

This document covers the release process for pi-slim-agents.

## Pre-release Checklist

Before publishing to npm, run through this checklist:

### 1. Clean git status

```bash
git status
```

Make sure:
- No uncommitted changes (or intentionally staged)
- No local history files committed (`.pi/slim-agents/history.jsonl`)
- No sensitive data in working tree

### 2. Run full release check

```bash
pnpm release:check
```

This runs:
1. `pnpm typecheck` — TypeScript type checking
2. `pnpm build` — Compile TypeScript to dist/
3. `pnpm test:agents` — Unit tests (362 tests)
4. `pnpm test:prompts` — Prompt eval static checks (7 checks)
5. `pnpm check:package` — Package contents verification (13 checks)
6. `pnpm pack:dry` — Dry-run npm pack

### 3. Verify npm login

```bash
npm whoami
```

Must be logged in as `@0xnayuta`.

### 4. Check package contents (dry-run)

```bash
pnpm pack:dry
```

Verify these are included:
- `dist/` — compiled TypeScript
- `agents/` — 6 built-in agent files
- `templates/` — 7 template files
- `skills/` — skill definitions
- `docs/` — documentation
- `examples/prompt-evals/` — eval examples
- `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`

Verify these are excluded:
- `tests/`
- `src/`
- `.github/`
- `.pi/`
- `history.jsonl`
- `.env`

### 5. Review CHANGELOG.md

Make sure:
- All M13 changes are documented
- Version is set to release date (`[0.1.0] - YYYY-MM-DD`)
- No future features documented as past tense

### 5. Verify dist/ contents

```bash
ls dist/
```

Should contain:
- `index.js` (main entry)
- `index.d.ts` (type declarations)
- All `.js` and `.d.ts` files for each source module

## Version Update

### Update version in package.json

```json
{
  "version": "0.1.0"
}
```

### Update CHANGELOG.md

Change from:
```markdown
## [0.1.0] - Unreleased
```

To:
```markdown
## [0.1.0] - 2026-05-06
```

Add a release date.

## Publishing

### npm login verification

```bash
npm whoami
```

If not logged in:
```bash
npm login
```

### Publish to npm

For scoped packages, you must set access level:

```bash
npm publish --access public
```

This publishes to:
- https://www.npmjs.com/package/@0xnayuta/pi-slim-agents

### Verify publication

```bash
npm view @0xnayuta/pi-slim-agents
```

Should show:
- Package name
- Latest version
- Description
- Repository URL

## Post-release Verification

### Install from npm

```bash
pi install npm:@0xnayuta/pi-slim-agents
```

### Test basic functionality

```text
/agents
```

Should show 6 built-in agents.

### Smoke test commands

```text
/agent explorer find where agents are loaded
/agents validate
/agents status
/agents templates
/agents history
/agents metrics
```

### Test delegation

```text
/agent oracle review this design
```

Should show delegation result (prompt-only mode).

### Validate agents

```text
/agents validate
```

Should pass all validation checks.

### JSON output test

```text
/agents --format json
/agent --format json explorer test task
/agents status --format json
```

## GitHub Release

### Create git tag

```bash
git tag v0.1.0
```

### Push tag to remote

```bash
git push origin v0.1.0
```

### Create GitHub Release

1. Go to https://github.com/0xnayuta/pi-slim-agents/releases/new
2. Select the `v0.1.0` tag
3. Title: `v0.1.0`
4. Copy CHANGELOG.md content for this version

### Release notes template

```markdown
## What's Changed

<!-- Copy from CHANGELOG.md [0.1.0] section -->

## v0.1.0 Supported Features

- 6 built-in slim agents: explorer, librarian, oracle, fixer, designer, orchestrator
- `/agent` shortcut with `--mode` flag (quick, normal, deep)
- Agent aliases (search→explorer, arch→oracle, etc.)
- 7 templates: security-reviewer, test-writer, doc-generator, refactor-planner, bug-triager, release-checker, cpp-reviewer
- Tags, filters, regex, query search
- JSON output for all commands
- History, metrics, replay
- Enable/disable configuration
- Persistent history (optional)

## ⚠️ Known Limitations

- Provider-call is **architectural only** — falls back to prompt-only
- Real model calls pending pi-mono ExtensionAPI

## Installation

```bash
pi install npm:@0xnayuta/pi-slim-agents
```

**Full Changelog**: https://github.com/0xnayuta/pi-slim-agents/compare/v0.0.1...v0.1.0
```

## Rollback / Hotfix

### If something goes wrong

1. Do NOT delete the npm release (npm does not allow unpublishing immediately)

2. If critical bug: publish a patch version

```bash
# Fix the bug
git checkout -b fix/<issue>

# Update version to patch
# Edit package.json: "version": "0.1.1"

# Update CHANGELOG.md
git add CHANGELOG.md package.json
git commit -m "fix: <description>"

# Publish
npm publish --access public
```

3. Document the issue in CHANGELOG.md

### If npm publish failed

Check error message:
- `E403` — Not authorized, check npm login
- `E409` — Version already exists, increment version
- `E401` — Authentication failed, run `npm login` again

## Important Notes

### Do NOT

- Publish API keys or secrets in npm package
- Commit local history (`.pi/slim-agents/history.jsonl`)
- Publish in-development features marked as stable
- Mark provider-call as stable (it's still fallback-only)
- Publish from dirty git state (uncommitted changes)

### Do

- Keep prompt-only as the stable default
- Document provider-call limitations clearly
- Use semver correctly (major.minor.patch)
- Update CHANGELOG.md before each release
- Test locally before publishing

## CI/CD

This project uses GitHub Actions for CI. See [.github/workflows/ci.yml](.github/workflows/ci.yml).

CI runs on:
- Every push to main/master
- Every pull request to main/master

CI configuration:
- **Node.js**: 24 (GitHub Actions runtime)
- **pnpm caching**: Manual pnpm store caching via `actions/cache@v4`
- **Lockfile**: `--no-frozen-lockfile` for CI (allows lockfile updates in PRs)

CI steps:
1. Setup Node.js 24
2. Enable corepack
3. Setup pnpm (no auto-install)
4. Get and cache pnpm store path
5. Install dependencies
6. TypeScript type check
7. Build
8. Run tests (agents + prompts)
9. Check package contents
10. Dry-run pack (`pnpm pack --dry-run`)

CI does NOT publish to npm automatically. Manual publish is required.