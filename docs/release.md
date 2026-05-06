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
3. `pnpm test:agents` — Unit tests
4. `pnpm test:prompts` — Prompt eval static checks
5. `pnpm check:package` — Package contents verification
6. `pnpm pack:dry` — Dry-run npm pack

### 3. Check package contents

```bash
pnpm check:package
```

Verifies:
- `dist/index.js` exists and is valid
- `agents/*.md` files present
- `templates/*.md` files present
- `skills/use-slim-agents/SKILL.md` exists
- `README.md` has required sections
- `CHANGELOG.md` mentions version
- `.gitignore` ignores history files

### 4. Review CHANGELOG.md

Make sure:
- All M13 changes are documented
- Version is set to unreleased (`[0.1.0] - Unreleased`)
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

### Login to npm

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

```bash
/agents
```

Should show 6 built-in agents.

### Test delegation

```text
/agent explorer test task
```

Should show delegation result (prompt-only mode).

### Validate agents

```text
/agents validate
```

Should pass all validation checks.

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

CI steps:
1. Setup pnpm
2. Install dependencies
3. TypeScript type check
4. Build
5. Run tests (agents + prompts)
6. Check package contents
7. Dry-run pack

CI does NOT publish to npm automatically. Manual publish is required.