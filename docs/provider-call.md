# Provider-Call Investigation — pi-slim-agents

## Current Status (v0.1.0)

The provider-call runner is **architecturally complete** but **cannot make real model calls** in most environments.

### v0.1.0 Limitations

For the v0.1.0 release, **provider-call is marked as "architectural only"**:
- The runner architecture is in place and working for fallback
- Real model calls require pi-mono ExtensionAPI or verified pi-ai import
- Prompt-only delegation is the stable default

**Do not advertise provider-call as a working feature in v0.1.0.**

### What works

- Provider-call runner adapter (`src/provider-runner.ts`) is fully implemented
- System prompt assembly (agent body + boundaries)
- User message assembly (task + context + files + mode)
- Temperature and model resolution with priority cascade
- Graceful fallback to prompt-only when pi-ai is not importable
- Clear error messages for each failure mode
- `/agents status` shows provider-call availability and reason

### What doesn't work (v0.1.0)

Real model calls via `@mariozechner/pi-ai`'s `complete()` function. The import fails at runtime due to pnpm strict module resolution.

## Why Provider-Call Cannot Make Real Model Calls

### Root cause: pnpm strict module resolution

`@mariozechner/pi-ai` is a transitive dependency of `@mariozechner/pi-coding-agent`. In pnpm's default (strict) mode, transitive dependencies are **not** directly importable from packages that don't declare them as direct dependencies.

```
pi-coding-agent → pi-ai (transitive)
pi-slim-agents → pi-coding-agent (peer)
pi-slim-agents → pi-ai (NOT directly accessible)
```

When `src/provider-runner.ts` attempts `import('@mariozechner/pi-ai')`, it fails with:
```
ERR_MODULE_NOT_FOUND: Cannot find package '@mariozechner/pi-ai'
```

### Why not add pi-ai as a direct dependency?

1. `pi-ai` is not published as a standalone package on npm
2. It's an internal dependency of `pi-coding-agent`
3. Adding it as a dependency would require it to be resolvable from the extension's module context
4. Even if added, the version might drift from the one used by pi-coding-agent

## Provider-call Roadmap for Future Releases

The provider-call runner architecture will be completed in a future milestone when:

1. **pi-mono ExtensionAPI exposes direct model calling** (preferred solution)
   - `complete()` or `generateText()` on ExtensionAPI
   - Eliminates pi-ai dependency entirely
   - Guarantees version compatibility

2. **Or `@mariozechner/pi-ai` becomes importable** via:
   - Published as standalone npm package
   - Or ExtensionAPI exposes pi-ai import path

**For v0.1.0**: The provider-call runner remains in "fallback mode". Prompt-only is the stable default.

### Candidate Solutions (documented, not implemented)

#### 1. Wait for pi-mono ExtensionAPI to expose model calling

**Status:** Not yet available (as of pi-coding-agent v0.73.0)

The ideal solution is for the pi-mono Extension API to expose a `complete()` or `generateText()` method directly. This would:
- Eliminate the need to import pi-ai
- Guarantee version compatibility
- Work regardless of package manager configuration

**Risk:** API might not be added, or might have a different shape than expected.

#### 2. Optional peerDependency for @mariozechner/pi-ai

Add `@mariozechner/pi-ai` as an optional peerDependency in package.json:

```json
{
  "peerDependencies": {
    "@mariozechner/pi-ai": "*"
  },
  "peerDependenciesMeta": {
    "@mariozechner/pi-ai": { "optional": true }
  }
}
```

**Risk:** pi-ai is not published as a standalone package, so this won't work with standard npm/pnpm resolution.

#### 3. pnpm public-hoist-pattern / shamefully-hoist

Configure pnpm to hoist `@mariozechner/pi-ai` so it's accessible:

```json
// .npmrc
public-hoist-pattern[]=*@mariozechner*
```

Or:
```json
// .npmrc
shamefully-hoist=true
```

**Risk:**
- Breaks pnpm's strict isolation guarantees
- Different behavior across installation methods (pnpm vs npm vs yarn)
- Not portable — users would need to configure their own .npmrc
- Can cause version conflicts in monorepos

#### 4. Child process runner

Run the provider-call in a child process that has access to pi-coding-agent's module graph:

```typescript
const result = await execSync('node -e "require(\'@mariozechner/pi-ai\').complete(...)"', ...);
```

**Risk:**
- Complex IPC for passing model context, API keys, and results
- Performance overhead of spawning processes
- Security concerns with passing API keys via environment/stdin
- Hard to debug

#### 5. Dynamic path resolution

Try to find pi-ai by walking the node_modules tree:

```typescript
const piAiPath = require.resolve('@mariozechner/pi-ai', {
  paths: [path.dirname(require.resolve('@mariozechner/pi-coding-agent'))]
});
```

**Risk:**
- Fragile — depends on node_modules layout
- Different behavior across package managers
- May break on updates

## Current Recommendation (v0.1.0)

1. **Keep the provider-call adapter architecture as-is** — it's well-designed and ready for when the import issue is solved
2. **Always preserve the prompt-only fallback** — it works reliably and produces good results
3. **Monitor pi-mono releases** for ExtensionAPI model calling support
4. **Do not hack around pnpm resolution** — it creates fragile, non-portable code
5. **`/agents status` shows the current provider-call state** — users can always check availability
6. **Document limitations clearly** — README and CHANGELOG should explain provider-call status

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| M4 | Implement provider-call adapter | Architecture should be ready for when import works |
| M4 | Graceful fallback to prompt-only | Users should never see errors from provider-call unavailability |
| M5 | Document investigation results | Clear record of why provider-call doesn't work yet |
| M5 | Do not force-fix importability | Hacks would be fragile and non-portable |
| M11 | Do not attempt real integration this milestone | Avoid binding to unstable internal API; avoid breaking package portability |
| M11 | Monitor pi-mono ExtensionAPI for direct model calling | Complete/generateText on ExtensionAPI would eliminate pi-ai dependency |
| M11 | Optional peerDependency on pi-ai candidate | Only viable if pi-ai is published as standalone package |
| M11 | pnpm public-hoist-pattern not recommended | Breaks module isolation; non-portable across environments |
| M13 | Keep provider-call as "architectural only" for v0.1.0 | Fallback to prompt-only works well; real integration pending pi-mono API |
| M13 | Do not force pi-ai into dependencies | Would break package portability; not verified as working |
| M13 | Document limitations in README and CHANGELOG | Users should understand provider-call status |

## Next Steps

For a future release (e.g., v0.2.0 or v1.0.0):

1. Monitor pi-mono releases for ExtensionAPI additions
2. Test provider-call when pi-ai becomes importable
3. Update `/agents status` to reflect new availability
4. Consider marking provider-call as "stable" when verified working

Do NOT rush provider-call integration in v0.1.x releases. Wait for a stable API surface.