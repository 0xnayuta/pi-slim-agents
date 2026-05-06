# Decisions

Key design decisions that shaped pi-slim-agents.

## D001: Keep pi-slim-agents slim

**Decision:** Do not build a heavy subagent framework with tmux, worktree, scheduler, or council.

**Rationale:**
- Complex orchestration adds maintenance burden and runtime overhead
- pi-mono is not designed as a multi-agent runtime
- User needs are served by focused, single-purpose delegation prompts
- Simplicity enables reliability and predictability

**Consequences:**
- No background agent processes
- No automatic tool execution in prompt-only mode
- Delegation is request-response, not persistent
- Users must adopt the specialist role manually in their own reasoning

---

## D002: Prompt-only is the stable default for v0.1.0

**Decision:** `runnerMode: "prompt-only"` is the stable default. Provider-call runner is architectural only.

**Rationale:**
- pi-mono ExtensionAPI does not expose direct model calling
- `@mariozechner/pi-ai` is not importable via pnpm strict module resolution
- Prompt-based delegation produces good results without real model calls
- Provider-call integration can be added when pi-mono API supports it

**Consequences:**
- `/agent` returns a delegation prompt, not search results
- Users must manually perform searches after receiving the delegation prompt
- Provider-call runner gracefully falls back to prompt-only when unavailable
- Future: `executed: true` when real provider-call is available

---

## D003: `/agent` does not imply execution in prompt-only mode

**Decision:** In prompt-only mode, `/agent` only generates a delegation prompt. It does not execute tools or start a child agent.

**Rationale:**
- Clear behavior boundary between modes
- No false expectations about what `/agent` does
- Fallback is explicit and visible
- Users can always check with `/agents status`

**Consequences:**
- UX banner shows "⚠️ Prompt-only delegation — no tools were executed"
- JSON output includes `executed: false`, `toolsExecuted: false`, `childSessionStarted: false`
- Dogfood requires two-step pattern: `/agent` + ask main agent to perform search
- Direct search (bypassing `/agent`) works for real work

---

## D004: Markdown frontmatter for agents/templates

**Decision:** Agents and templates are defined as Markdown files with YAML frontmatter.

**Rationale:**
- Human-readable and easy to edit
- No TypeScript or build step required to create agents
- Frontmatter allows metadata (aliases, tags, mode, temperature)
- Markdown body provides natural prompt structure
- Works with standard text editors

**Consequences:**
- Agents loaded via file system (project/user/package priority)
- Frontmatter validation on load
- Users can customize by copying package agents to project level
- Templates can be instantiated with `/agents create`

---

## D005: Safe sourcePath metadata

**Decision:** JSON output never includes absolute paths or full user directory paths.

**Rationale:**
- Privacy: user directory paths may reveal personal information
- Security: absolute paths could leak system structure
- Portability: relative paths work across environments

**Consequences:**
- `sourcePath` is always a safe display path:
  - `builtin`: relative to package root (e.g., `agents/oracle.md`)
  - `project`: relative to project cwd (e.g., `.pi/slim-agents/agents/foo.md`)
  - `user`: home directory abbreviated (e.g., `~/.pi/agent/...`)
  - `external`: just filename
- `sourcePathKind` field indicates the path type
- API key sanitization also applied to JSON output

---

## D006: Provider-call deferred

**Decision:** Do not force real provider-call integration in v0.1.0. Wait for stable pi-mono ExtensionAPI.

**Rationale:**
- pnpm strict module resolution prevents `@mariozechner/pi-ai` import
- Hacks (public-hoist-pattern, shamefully-hoist) break module isolation
- pi-mono may expose direct model calling API in future
- Prompt-only delegation is effective without real model calls

**Consequences:**
- Provider-call runner architecture exists but falls back to prompt-only
- `/agents status` shows provider-call availability and reason
- Future integration point: pi-mono ExtensionAPI with `complete()` or `generateText()`
- Monitor pi-mono releases for API additions

---

## D007: npm release deferred but code is release-ready

**Decision:** Code is ready for v0.1.0 but npm publish is temporarily blocked by account 2FA/token issue.

**Rationale:**
- R7 review concluded "Ready for 0.1.0"
- All 362 tests passing, all blockers resolved
- Package contents verified correct
- CI pipeline matches release:check

**Consequences:**
- README shows "Release-ready" and "npm publication pending"
- CHANGELOG shows "[0.1.0] - Unreleased"
- Local dogfood can proceed without npm publish
- Publish when account auth issue is resolved

---

## D008: History defaults to in-memory, optional JSONL persistence

**Decision:** History is in-memory by default. Optional JSONL persistence via `history.persistent: true` config.

**Rationale:**
- Most users don't need persistence across sessions
- JSONL adds file I/O and complexity
- Persistence requires `.gitignore` updates
- Default behavior is simple and fast

**Consequences:**
- History lost on session end (default)
- Optional persistence with `history.persistent: true`
- Retention limit configurable (default: 200 records)
- Write failures do not affect delegation

---

## D009: Aliases for common agent roles

**Decision:** Built-in aliases allow short commands: `search` → `explorer`, `arch` → `oracle`, etc.

**Rationale:**
- Reduces typing for common operations
- Maps to natural language patterns (search for X, arch review Y)
- Aliases resolved before agent loading
- Users can create their own aliases via custom agents

**Consequences:**
- Alias resolution in both prompt-only and provider-call modes
- Alias validation to detect conflicts
- Aliases included in JSON output (`aliasUsed: true`)
- Standalone fallback commands also support aliases

---

## D010: Tag autocomplete reserved for future

**Decision:** Tag autocomplete in `/agent` is a future enhancement, not implemented in v0.1.0.

**Rationale:**
- Requires pi-mono command completion API support
- Not critical for core functionality
- Can be designed when pi-mono API is available
- v0.1.0 should focus on stable core features

**Consequences:**
- No completion for `--tag` flag in `/agent`
- Tags work for `/agents --tag` filtering
- Future: completion candidates from agent names, aliases, and tags

---

## D011: No API keys or full prompts in JSON output

**Decision:** JSON output excludes sensitive data: API keys, full prompts, full results.

**Rationale:**
- Privacy: prompts may contain proprietary context
- Security: API key-like strings must be sanitized
- Portability: JSON output safe to share or log

**Consequences:**
- `sanitizeJsonText()` removes `apiKey=sk-...`, `sk-XXXXXXXX`, `Bearer <token>`
- Agent `body` field never included in JSON
- Provider-call outputs not included in JSON
- History JSON only includes `taskSummary` (truncated to 80 chars)

---

## D012: JSON output with schemaVersion for forward compatibility

**Decision:** All JSON outputs include `schemaVersion: 1` and `kind` field.

**Rationale:**
- Consumers can check schema version before parsing
- `kind` field identifies the output type
- Future schema changes can be handled gracefully

**Consequences:**
- JSON envelope: `{ "schemaVersion": 1, "kind": "agents", ... }`
- 8 kinds: agents, templates, status, history, metrics, validation, agentResult, error
- Null for unset filter fields (consistent serialization)
- camelCase field names throughout

---

*Last updated: 2026-05-06*