/**
 * Core type definitions for pi-slim-agents.
 *
 * No OpenCode SDK dependency — all types are self-contained.
 */

// ─── Agent Definition ──────────────────────────────────────────────

/** Parsed frontmatter from an agent .md file. */
export interface AgentFrontmatter {
  name: string;
  description?: string;
  role?: string;
  temperature?: number;
  /** Whether this agent is read-only (advises, doesn't implement). */
  readonly?: boolean;
  /** Tags for filtering / categorization. */
  tags?: string[];
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
  prompt: string;
  /** Temperature override. */
  temperature: number;
  /** Role hint. */
  role: string;
  /** Whether agent is read-only. */
  readonly: boolean;
  /** Tags. */
  tags: string[];
  /** Display order. */
  order: number;
  /** Source path (for diagnostics). */
  sourcePath?: string;
}

// ─── Configuration ─────────────────────────────────────────────────

/** User/project configuration file shape (.pi/slim-agents.json). */
export interface SlimAgentsConfig {
  /** Agent name overrides — keys are agent names, values are overrides. */
  agents?: Record<string, AgentOverride>;
  /** Default model hint for delegation (informational in v1). */
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
  /** Replace the entire prompt. */
  prompt?: string;
  /** Append to the existing prompt. */
  appendPrompt?: string;
  /** Disable this agent. */
  disabled?: boolean;
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
  mode?: 'auto' | 'focus' | 'review';
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
