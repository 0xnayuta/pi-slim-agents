/**
 * Core type definitions for pi-slim-agents.
 *
 * No OpenCode SDK dependency — all types are self-contained.
 */

// ─── Agent Definition ──────────────────────────────────────────────

/** Parsed frontmatter from an agent .md file. */
export interface AgentFrontmatter {
  name?: string;
  description?: string;
  role?: string;
  temperature?: number;
  /** Whether this agent is read-only (advises, doesn't implement). */
  readonly?: boolean;
  /** Tags for filtering / categorization. */
  tags?: string[];
  /** Aliases for this agent (e.g. search -> explorer). */
  aliases?: string[];
  /** Display order (lower = higher priority). */
  order?: number;
}

/** A fully resolved agent, ready for delegation. */
export interface AgentDefinition {
  /** Unique identifier (from frontmatter or filename). */
  name: string;
  /** Human-readable description. */
  description: string;
  /** The system prompt body (markdown after frontmatter). */
  body: string;
  /** Temperature override. */
  temperature: number;
  /** Role hint. */
  role: string;
  /** Whether agent is read-only. */
  readonly: boolean;
  /** Tags. */
  tags: string[];
  /** Aliases for this agent. */
  aliases: string[];
  /** Whether agent is enabled. */
  enabled: boolean;
  /** Display order. */
  order: number;
  /** Source path (for diagnostics). */
  sourcePath?: string;
}

// ─── Configuration ─────────────────────────────────────────────────

/** Runner mode — controls how delegation is executed. */
export type RunnerMode = 'prompt-only' | 'provider-call';

/** User/project configuration file shape (.pi/slim-agents.json). */
export interface SlimAgentsConfig {
  /** Agent name overrides — keys are agent names, values are overrides. */
  agents?: Record<string, AgentOverride>;
  /** Runner mode: 'prompt-only' (default) or 'provider-call'. */
  runnerMode?: RunnerMode;
  /** Default model hint for delegation ('current' or model id). */
  defaultModel?: string;
  /** Agents to disable. */
  disabled?: string[];
  /** Additional agent directories to scan. */
  extraAgentDirs?: string[];
}

/** Per-agent override in config. */
export interface AgentOverride {
  description?: string;
  temperature?: number;
  /** Model override for this agent ('current' or model id). */
  model?: string;
  /** Replace the entire prompt. */
  prompt?: string;
  /** Append to the existing prompt. */
  appendPrompt?: string;
  /** Disable this agent. */
  disabled?: boolean;
  /** Enable this agent (takes precedence over disabled). */
  enabled?: boolean;
  /** Tags override. */
  tags?: string[];
}

// ─── Delegation ─────────────────────────────────────────────────────

/** Parameters for the delegate_agent tool. */
export interface DelegateAgentParams {
  /** Agent name to delegate to. */
  agent: string;
  /** The task to perform. */
  task: string;
  /** Additional context for the agent. */
  context?: string;
  /** Relevant file paths. */
  files?: string[];
  /** Delegation mode. */
  mode?: 'quick' | 'normal' | 'deep';
}

/** Metadata for provider-call results. */
export interface ProviderCallMeta {
  /** Resolved agent name. */
  resolvedAgent: string;
  /** Originally requested agent name (before alias resolution). */
  requestedAgent: string;
  /** Model used ("current" or actual model id). */
  model: string;
  /** Temperature used. */
  temperature: number;
  /** Runner mode used. */
  runnerMode: RunnerMode;
}

/** Result returned by the runner. */
export interface DelegationResult {
  /** Whether delegation succeeded. */
  ok: boolean;
  /** The delegation prompt sent (or to send) to the agent. */
  prompt: string;
  /** Agent that handled the delegation. */
  agentName: string;
  /** Error message if delegation failed. */
  error?: string;
  /** Informational message. */
  message?: string;
  /** Provider-call mode output (actual model response). */
  providerOutput?: string;
  /** Provider-call metadata. */
  meta?: ProviderCallMeta;
}

// ─── Agent Loader ───────────────────────────────────────────────────

/** Source location for agent discovery. */
export type AgentSource = 'project' | 'user' | 'package';

/** A discovered but not yet resolved agent file. */
export interface AgentFileEntry {
  name: string;
  filePath: string;
  source: AgentSource;
}
