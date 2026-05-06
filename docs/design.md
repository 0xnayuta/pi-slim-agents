# Design Document — pi-slim-agents

## Philosophy

**pi-slim-agents** brings lightweight specialist agent roles to pi-mono, inspired by the multi-agent patterns in [oh-my-opencode-slim](https://github.com/alvinunreal/oh-my-opencode-slim) but without the full orchestration framework.

### Key Principles

1. **Markdown-first**: Agents are defined as `.md` files with YAML frontmatter. No TypeScript required to create or customize agents.
2. **Zero runtime overhead**: No background processes, no scheduling, no multiplexing. Agents are invoked on-demand via the `delegate_agent` tool.
3. **Prompt-based delegation** (v1): The delegation prompt is returned to the main LLM, which adopts the specialist's role to complete the task. This is simple and effective.
4. **Extensible**: Users can add custom agents at project or user level without modifying the package.

## Architecture

```
┌─────────────────────────────────────────────┐
│                pi-mono session               │
│                                             │
│  ┌────────────────────────────────────────┐  │
│  │         slim-agents extension          │  │
│  │                                        │  │
│  │  ┌──────────┐  ┌───────────────────┐   │  │
│  │  │ /agents   │  │ delegate_agent    │   │  │
│  │  │ command   │  │ tool              │   │  │
│  │  └──────────┘  └────────┬──────────┘   │  │
│  │                         │              │  │
│  │  ┌──────────────────────▼──────────┐   │  │
│  │  │        Agent Loader             │   │  │
│  │  │  project > user > package       │   │  │
│  │  └──────────────────────┬──────────┘   │  │
│  │                         │              │  │
│  │  ┌──────────────────────▼──────────┐   │  │
│  │  │        Runner (v1)              │   │  │
│  │  │  builds delegation prompt       │   │  │
│  │  └─────────────────────────────────┘   │  │
│  └────────────────────────────────────────┘  │
│                                             │
│  agents/orchestrator.md                     │
│  agents/explorer.md                         │
│  agents/librarian.md                        │
│  agents/oracle.md                           │
│  agents/designer.md                         │
│  agents/fixer.md                            │
└─────────────────────────────────────────────┘
```

## Agent Loading Priority

Agents are discovered from three locations. For the same agent name, the highest-priority source wins:

1. **Project-level** — `.pi/slim-agents/agents/*.md` (team-shared customizations)
2. **User-level** — `~/.pi/agent/slim-agents/agents/*.md` (personal customizations)
3. **Package built-in** — `agents/*.md` (bundled with the npm package)

## Configuration

Configuration is loaded from two files, merged (project overrides user):

- `~/.pi/agent/slim-agents.json` — User-level defaults
- `.pi/slim-agents.json` — Project-level overrides

```json
{
  "agents": {
    "oracle": {
      "temperature": 0.3,
      "appendPrompt": "Focus on security concerns."
    },
    "fixer": {
      "disabled": true
    }
  },
  "disabled": ["council"],
  "extraAgentDirs": ["./custom-agents"]
}
```

## Delegation Model

### v1: Prompt-Based Delegation

When `delegate_agent` is called:
1. The runner loads the target agent's prompt
2. Builds a structured delegation prompt with task, context, and files
3. Returns the prompt as a tool result
4. The main LLM reads the result and adopts the specialist role

This is simple, works within the pi extension API, and produces good results because the main LLM is already capable.

### v2 (planned): Child Session Delegation

When pi-mono exposes child session / provider call APIs:
1. The runner creates an independent model call with the specialist's system prompt
2. The specialist runs in its own context, not polluting the main session
3. Results are streamed back and integrated

## Relationship to oh-my-opencode-slim

pi-slim-agents is **inspired by** but does **not copy** oh-my-opencode-slim. Key differences:

| Aspect | oh-my-opencode-slim | pi-slim-agents |
|--------|-------------------|----------------|
| Platform | OpenCode plugin | pi-mono extension |
| Agents | TypeScript-defined | Markdown + frontmatter |
| Runtime | Full orchestration (scheduler, council, multiplexer) | Minimal prompt-based delegation |
| Custom agents | Config-based overrides | File-based (project/user/package) |
| Dependencies | OpenCode SDK | pi-coding-agent only |

## JSON Output & Machine-Readable Formats (M10)

All commands that show data support `--format json` for scriptable, machine-readable output. JSON output:

- Is always valid JSON (parseable by any JSON library)
- Contains no Markdown formatting, ANSI codes, or API keys
- Does not include full prompt bodies or agent results
- Uses `schemaVersion` for forward-compatibility
- Uses camelCase field names throughout

### JSON Schema Design

Each JSON output includes a top-level envelope:

```json
{
  "schemaVersion": 1,
  "kind": "<kind>",
  ...
}
```

| kind | Description |
|------|-------------|
| `agents` | Agent list with filters applied |
| `templates` | Template list with filters applied |
| `status` | Runtime status report |
| `history` | Delegation history records |
| `metrics` | Delegation metrics summary |
| `validation` | Agent validation results |

### schemaVersion Compatibility

If the JSON schema changes in a future release, `schemaVersion` will be incremented. Consumers should check `schemaVersion` before parsing.

### Privacy in JSON Output

- **No API keys** — Provider errors are sanitized before inclusion
- **No full prompts** — Agent `body` field is never included in JSON
- **No full results** — Provider-call outputs are not included
- **No full task/context** — History JSON only includes `taskSummary` (truncated to 80 chars)

### Tags, Aliases, and JSON Output

Tags and aliases are included in JSON output as arrays. These fields enable:

- **Script filtering**: `jq '.items[] | select(.tags | contains("security"))'`
- **External tooling**: Build dashboards from `/agents metrics --format json`
- **CI integration**: Validate agent files via `/agents validate --format json`

### Regex Search Design

`--regex` provides advanced pattern matching for power users. It is **AND-combined** with other filters:

```text
/agents --regex "^cpp"               # matches name, description, aliases, tags
/agents --tag review --regex "oracle" # must have 'review' tag AND match 'oracle'
/agents templates --regex "writer|reviewer"
```

Regex defaults to **case-insensitive** (`i` flag) for simplicity. Anchors (`^`, `$`) apply to the full searchable string, not individual fields.

**Recommendation**: For simple searches, prefer `--query` (plain text, case-insensitive). Reserve `--regex` for complex patterns.

### Tag Autocomplete Design Reservation (Future)

Tag autocomplete is **not implemented** in this release. It requires pi-mono command completion API support. Design reservation:

**Candidates** would come from:
- Agent names (from loaded agents)
- Agent aliases (from loaded agents)
- Tags (aggregated from all agents/templates)
- Template names

**Implementation approach** (future):
1. Aggregate all unique tags from `loadAgents()` + `loadTemplates()`
2. Register a completion provider via pi-mono API
3. On `--tag<Tab>`, return matching tags

This is **out of scope for M10**.

### Token Usage Tracking Design Reservation (Future)

Real token usage tracking requires a working provider-call integration. Design reservation:

```json
"tokenUsage": {
  "available": false,
  "reason": "provider-call usage data unavailable"
}
```

When provider-call works, `tokenUsage` would be populated from pi-ai response metadata. Without real integration, it remains `available: false`.

**Out of scope**: Tokenizer dependencies, estimated token counts, cost tracking.

### Format Layer Architecture

The formatter layer (`src/format.ts`) separates data generation from presentation:

```
Command Handler
    │
    ├─ parseFlags(args) → flags{}
    ├─ parseFormatOption(flags) → 'text' | 'json'
    ├─ parseRegexOption(flags) → RegExp | null
    │
    ├─ Load data (loadAgents, historyStore, etc.)
    │
    ├─ filterAgents / filterTemplates (with regex)
    │
    └─ Format:
           formatAgentsJson() → JSON string
           formatTemplatesJson() → JSON string
           formatStatusJson() → JSON string
           formatHistoryJson() → JSON string
           formatMetricsJson() → JSON string
           formatValidationJson() → JSON string
           ...
           OR
           formatAgentList() → text string  (existing)
           formatTemplatesList() → text string
           ...
```

This separation ensures:
1. JSON formatters never produce Markdown
2. Text formatters remain unchanged
3. New output formats can be added without touching business logic
4. Every formatter is independently testable
