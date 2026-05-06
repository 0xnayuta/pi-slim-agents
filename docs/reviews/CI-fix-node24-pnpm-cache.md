# CI Fix - Node 24 and pnpm Cache

## Problem

Two issues were identified in the GitHub Actions CI workflow:

1. **pnpm cache path missing**: `Path(s) specified in the action for caching do(es) not exist, hence no cache is being saved.`

2. **Node.js 20 actions deprecation warning**: `Node.js 20 actions are deprecated. actions/checkout@v4, actions/setup-node@v4, pnpm/action-setup@v4 are running on Node.js 20 and may be forced to Node.js 24 starting June 2, 2026.`

## Root cause

### pnpm cache path issue

The `actions/setup-node` action with `cache: 'pnpm'` option relies on detecting the package manager from lockfiles and environment setup. In some GitHub hosted runner configurations or with certain pnpm versions, this automatic detection may fail or the cache path may not exist before the cache step runs.

The fix uses explicit manual pnpm store caching:
1. Get the pnpm store path with `pnpm store path --silent`
2. Ensure the directory exists with `mkdir -p`
3. Cache the explicit store path with `actions/cache@v4`

### Node.js 20 deprecation

GitHub Actions is migrating JavaScript actions runtime from Node.js 20 to Node.js 24. The warning indicates that third-party actions (`actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`) are still running on Node.js 20 internally, but will be forced to Node.js 24 after June 2, 2026.

Setting `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` at the workflow level signals that the workflow is ready for Node.js 24.

## Changes made

Modified [.github/workflows/ci.yml](.github/workflows/ci.yml):

1. **Added workflow-level environment variable**:
   ```yaml
   env:
     FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
   ```

2. **Updated Node.js version** from `22` to `24`:
   ```yaml
   - name: Setup Node.js
     uses: actions/setup-node@v4
     with:
       node-version: '24'
   ```

3. **Removed `cache: 'pnpm'`** from `actions/setup-node`:
   - Old: `cache: 'pnpm'` in setup-node
   - New: Manual pnpm store caching with `actions/cache@v4`

4. **Reordered setup steps** for proper dependency order:
   - setup-node → corepack → pnpm/action-setup → cache → install

5. **Added manual pnpm store caching**:
   ```yaml
   - name: Get pnpm store path
     id: pnpm-store
     run: |
       STORE_PATH="$(pnpm store path --silent)"
       mkdir -p "$STORE_PATH"
       echo "STORE_PATH=$STORE_PATH" >> "$GITHUB_OUTPUT"
       echo "Store path: $STORE_PATH"

   - name: Cache pnpm store
     uses: actions/cache@v4
     with:
       path: ${{ steps.pnpm-store.outputs.STORE_PATH }}
       key: ${{ runner.os }}-pnpm-store-${{ hashFiles('pnpm-lock.yaml') }}
       restore-keys: |
         ${{ runner.os }}-pnpm-store-
   ```

6. **Updated `pnpm/action-setup@v4`** with `run_install: false` for explicit control.

Updated [docs/release.md](docs/release.md):
- Added CI configuration section with Node.js 24 and manual pnpm store caching notes.
- Documented all CI steps explicitly.

## Validation

Local validation was performed:

```bash
pnpm release:check
pnpm pack --dry-run
```

See validation results in the main response.

Note: Full GitHub Actions validation requires a push to the repository to trigger the workflow.

## Expected GitHub Actions behavior

After this fix:

1. **pnpm cache**: The `actions/cache@v4` step should successfully save and restore the pnpm store cache:
   - Cache key: `linux-pnpm-store-<hash-of-pnpm-lock.yaml>`
   - Cache path: `/home/runner/.local/share/pnpm/store/v3` (or equivalent)
   - No more "Path does not exist" error

2. **Node.js 24**: The workflow should run on Node.js 24:
   - `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` signals readiness
   - Node 20 deprecation warnings from GitHub's runtime should be reduced
   - Third-party actions (`actions/checkout@v4`, `actions/setup-node@v4`, `pnpm/action-setup@v4`) may still show warnings until they update their Node.js 20 internal implementations — this is an upstream issue

3. **CI steps unchanged**: All validation steps continue to run:
   - `pnpm install --no-frozen-lockfile`
   - `pnpm typecheck`
   - `pnpm build`
   - `pnpm test:agents`
   - `pnpm test:prompts`
   - `pnpm check:package`
   - `pnpm pack:dry`

## Remaining concerns

1. **Third-party action warnings**: `actions/checkout@v4`, `actions/setup-node@v4`, and `pnpm/action-setup@v4` may still emit Node.js 20 deprecation warnings until their maintainers update to Node.js 24 internally. This is outside the project's control — the workflow has done its part by setting `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`.

2. **Lockfile strategy**: CI uses `--no-frozen-lockfile` to allow lockfile updates in PRs. If strict lockfile enforcement is desired, this could be changed to `--frozen-lockfile` with appropriate handling for lockfile update PRs.

3. **Node.js 24 compatibility**: While the workflow is configured for Node.js 24, full compatibility with all dependencies should be verified over time as Node.js 24 matures.

## Follow-up: pnpm pack --dry-run requires pnpm >= 10.26.0

### CI failure

After the Node 24 / pnpm cache fix was applied, CI continued to fail on the `pnpm pack:dry` step:

```
Run pnpm pack:dry

> @0xnayuta/pi-slim-agents@0.1.0 pack:dry
> pnpm pack --dry-run

ERROR Unknown option: 'dry-run'
ELIFECYCLE Command failed with exit code 1.
```

### Root cause

The CI workflow used `pnpm/action-setup@v4` with `version: 9`, which installed pnpm 9.x. The `pnpm pack --dry-run` option was introduced in pnpm 10.26.0. pnpm 9 does not recognize this flag.

### Fix

1. **Pin pnpm version to 10.32.0** in `.github/workflows/ci.yml`:
   ```yaml
   - name: Setup pnpm
     uses: pnpm/action-setup@v4
     with:
       version: 10.32.0
       run_install: false
   ```

2. **Add `packageManager` field** to `package.json`:
   ```json
   "packageManager": "pnpm@10.32.0"
   ```
   This ensures local development and CI use the same pnpm version.

3. **Add pnpm version print step** in CI for diagnostics:
   ```yaml
   - name: Print pnpm version
     run: pnpm --version
   ```

4. **Update docs/release.md** to document pnpm >= 10.26.0 requirement.

### Validation

```bash
$ pnpm --version
10.32.0

$ pnpm pack --dry-run
# (succeeds — lists package contents without creating tarball)
```
