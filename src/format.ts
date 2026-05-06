/**
 * Unified formatting layer for pi-slim-agents.
 *
 * Provides:
 *   - Format option parsing (text / json)
 *   - JSON output formatters for all commands
 *   - Regex parsing and validation
 *   - Error helpers for format/regex failures
 *
 * Design principles:
 *   - Human-readable text output and JSON output are fully separated.
 *   - All JSON formatters produce plain objects first, then serialize.
 *   - schemaVersion is included in every JSON response for forward compatibility.
 *   - No ANSI codes, no Markdown, no API keys in JSON output.
 *   - Unset filters use null (not undefined) for consistent serialization.
 */

import type { AgentDefinition, DelegationRecord, DelegationResult, ProviderCallMeta } from './types.js';
import type { AgentFilter, TemplateFilter, FilterableTemplate } from './commands.js';
import type { MetricsSummary, HistoryFilter } from './history.js';
import type { StatusReport } from './status.js';
import type { ValidationResult } from './templates.js';

// ─── Format Option ─────────────────────────────────────────────────

export type OutputFormat = 'text' | 'json';

/**
 * Parse --format flag from a flags object.
 * Returns 'text' as default and validates against allowed values.
 */
export function parseFormatOption(flags: Record<string, string>): { format: OutputFormat; error?: string } {
  const raw = flags.format;
  if (raw === undefined) return { format: 'text' };
  if (raw === 'text' || raw === 'json') return { format: raw };
  return {
    format: 'text',
    error: `Unsupported format "${raw}". Supported formats: text, json`,
  };
}

// ─── Regex Option ─────────────────────────────────────────────────

/**
 * Parse --regex flag from a flags object.
 * Returns a compiled RegExp (with 'i' flag) or null if not provided.
 * Returns an error object if the pattern is invalid.
 */
export function parseRegexOption(
  flags: Record<string, string>,
): { regex: RegExp | null; error?: string } {
  const raw = flags.regex;
  if (raw === undefined) return { regex: null };

  try {
    // Always use case-insensitive flag for simplicity
    const re = new RegExp(raw, 'i');
    return { regex: re };
  } catch {
    return {
      regex: null,
      error: `Invalid regex pattern "${raw}": ${getRegexErrorMessage(raw)}`,
    };
  }
}

function getRegexErrorMessage(pattern: string): string {
  try {
    new RegExp(pattern);
    return 'Unknown syntax error';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

// ─── JSON Schema Versions ──────────────────────────────────────────

export const CURRENT_SCHEMA_VERSION = 1;

// ─── Shared Filter Serialization ──────────────────────────────────

/** Serialize agent filters to a JSON-compatible object (null for unset). */
export function serializeAgentFilters(
  filter: AgentFilter & { regex?: RegExp | null },
): Record<string, unknown> {
  return {
    tags: filter.tags ?? null,
    query: filter.query ?? null,
    readonly: filter.readonly ?? null,
    writable: filter.writable ?? null,
    enabled: filter.enabled ?? null,
    disabled: filter.disabled ?? null,
    source: filter.source ?? null,
    regex: filter.regex instanceof RegExp ? filter.regex.source : null,
  };
}

/** Serialize template filters to a JSON-compatible object (null for unset). */
export function serializeTemplateFilters(
  filter: TemplateFilter & { regex?: RegExp | null },
): Record<string, unknown> {
  return {
    tags: filter.tags ?? null,
    query: filter.query ?? null,
    readonly: filter.readonly ?? null,
    writable: filter.writable ?? null,
    regex: filter.regex instanceof RegExp ? filter.regex.source : null,
  };
}

// ─── JSON Output: Agent Result ────────────────────────────────────

export interface AgentResultJsonOutput {
  schemaVersion: number;
  kind: 'agentResult';
  requestedAgent: string;
  resolvedAgent: string;
  aliasUsed: boolean;
  mode: string;
  runnerMode: string;
  status: 'success' | 'fallback' | 'error';
  durationMs: number;
  historyId: number | null;
  replayOf: number | null;
  providerCall: {
    available: boolean;
    fallback: boolean;
    reason: string;
  };
  task: {
    summary: string;
  };
  output: {
    text: string;
    format: 'text' | 'provider-call';
  } | null;
  error?: {
    code: string;
    message: string;
    availableAgents?: string[];
  };
}

/**
 * Format a delegation result as JSON.
 *
 * Privacy guarantees:
 *   - No API keys
 *   - No full agent prompt (body) unless it's a delegation prompt
 *   - No full task text (only summary)
 *   - Provider-call outputs are included as text
 */
export function formatAgentResultJson(params: {
  requestedAgent: string;
  resolvedAgent: string;
  aliasUsed: boolean;
  mode: string;
  runnerMode: string;
  status: 'success' | 'fallback' | 'error';
  durationMs: number;
  historyId: number | null;
  replayOf?: number | null;
  providerCallAvailable: boolean;
  error?: string;
  output?: string | null;
  availableAgents?: string[];
}): string {
  const output: AgentResultJsonOutput = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'agentResult',
    requestedAgent: params.requestedAgent,
    resolvedAgent: params.resolvedAgent,
    aliasUsed: params.aliasUsed,
    mode: params.mode,
    runnerMode: params.runnerMode,
    status: params.status,
    durationMs: params.durationMs,
    historyId: params.historyId,
    replayOf: params.replayOf ?? null,
    providerCall: {
      available: params.providerCallAvailable,
      fallback: params.status === 'fallback',
      reason: params.providerCallAvailable
        ? (params.status === 'fallback' ? 'Provider-call unavailable, fallback to prompt-only' : 'Provider-call completed')
        : 'Provider-call not available in this environment',
    },
    task: {
      summary: truncateForJson(params.requestedAgent, 200),
    },
    output: null,
  };

  if (params.status === 'error') {
    const errorCode = classifyErrorCode(params.error ?? 'Unknown error');
    output.error = {
      code: errorCode,
      message: params.error ?? 'Unknown error',
    };
    if (errorCode === 'UNKNOWN_AGENT' && params.availableAgents) {
      output.error.availableAgents = params.availableAgents;
    }
    output.output = null;
  } else if (params.output !== undefined && params.output !== null) {
    // Sanitize the output: remove any accidental API keys
    output.output = {
      text: sanitizeJsonText(params.output),
      format: params.runnerMode === 'provider-call' ? 'provider-call' : 'text',
    };
  }

  return JSON.stringify(output, null, 2);
}

/** Get the last history record id from the store. */
export function getLastHistoryId(): number | null {
  // Import dynamically to avoid circular dependency
  // The caller should pass historyId from the result
  return null;
}

// ─── JSON Output: Agents ──────────────────────────────────────────

export interface AgentsJsonOutput {
  schemaVersion: number;
  kind: 'agents';
  filters: Record<string, unknown>;
  count: number;
  items: AgentJsonItem[];
}

export interface AgentJsonItem {
  name: string;
  description: string;
  enabled: boolean;
  readonly: boolean;
  aliases: string[];
  tags: string[];
  source: string;
  recommendedMode: string;
  metadata?: {
    sourcePath: string;
    createdAt: string | null;
    lastModified: string | null;
    sizeBytes: number | null;
  } | null;
}

export function formatAgentsJson(
  agents: AgentDefinition[],
  filter: AgentFilter & { regex?: RegExp | null },
): string {
  const output: AgentsJsonOutput = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'agents',
    filters: serializeAgentFilters(filter),
    count: agents.length,
    items: agents.map(a => ({
      name: a.name,
      description: a.description,
      enabled: a.enabled,
      readonly: a.readonly,
      aliases: a.aliases,
      tags: a.tags,
      source: a.source ?? 'unknown',
      recommendedMode: a.recommendedMode ?? 'normal',
      metadata: a.metadata ? {
        sourcePath: a.metadata.sourcePath,
        createdAt: a.metadata.createdAt,
        lastModified: a.metadata.lastModified,
        sizeBytes: a.metadata.sizeBytes,
      } : null,
    })),
  };

  return JSON.stringify(output, null, 2);
}

// ─── JSON Output: Templates ────────────────────────────────────────

export interface TemplatesJsonOutput {
  schemaVersion: number;
  kind: 'templates';
  filters: Record<string, unknown>;
  count: number;
  items: TemplateJsonItem[];
}

export interface TemplateJsonItem {
  name: string;
  description: string;
  readonly: boolean;
  aliases: string[];
  tags: string[];
  recommendedMode: string;
  metadata?: {
    sourcePath: string;
    createdAt: string | null;
    lastModified: string | null;
    sizeBytes: number | null;
  } | null;
}

export function formatTemplatesJson(
  templates: FilterableTemplate[],
  filter: TemplateFilter & { regex?: RegExp | null },
): string {
  // templates from FilterableTemplate don't have metadata; we handle both
  const output: TemplatesJsonOutput = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'templates',
    filters: serializeTemplateFilters(filter),
    count: templates.length,
    items: templates.map(t => ({
      name: t.name,
      description: t.description,
      readonly: t.readonly,
      aliases: t.aliases,
      tags: t.tags,
      recommendedMode: t.recommendedMode,
      metadata: null,
    })),
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Format templates with full TemplateInfo metadata.
 */
export function formatTemplatesJsonFull(
  templates: Array<{
    name: string;
    description: string;
    readonly: boolean;
    aliases: string[];
    tags: string[];
    recommendedMode: string;
    metadata?: { sourcePath: string; createdAt: string | null; lastModified: string | null; sizeBytes: number | null } | null;
  }>,
  filter: TemplateFilter & { regex?: RegExp | null },
): string {
  const output: TemplatesJsonOutput = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'templates',
    filters: serializeTemplateFilters(filter),
    count: templates.length,
    items: templates.map(t => ({
      name: t.name,
      description: t.description,
      readonly: t.readonly,
      aliases: t.aliases,
      tags: t.tags,
      recommendedMode: t.recommendedMode,
      metadata: t.metadata ?? null,
    })),
  };

  return JSON.stringify(output, null, 2);
}

// ─── JSON Output: Status ───────────────────────────────────────────

export interface StatusJsonOutput {
  schemaVersion: number;
  kind: 'status';
  runnerMode: string;
  providerCall: {
    available: boolean;
    reason: string;
  };
  agents: {
    enabled: number;
    disabled: number;
    aliases: number;
  };
  config: {
    loadedPaths: string[];
    projectConfigPath: string;
    userConfigPath: string;
  };
  lastReloadTime: string | null;
  delegationCount: number;
  metadataSummary?: {
    newestAgentModifiedAt: string | null;
    newestTemplateModifiedAt: string | null;
  };
}

export function formatStatusJson(report: StatusReport, loadedPaths: string[]): string {
  const output: StatusJsonOutput = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'status',
    runnerMode: report.runnerMode,
    providerCall: {
      available: report.providerCall.available,
      reason: report.providerCall.reason,
    },
    agents: {
      enabled: report.agents.enabled,
      disabled: report.agents.disabled,
      aliases: report.agents.aliasCount,
    },
    config: {
      loadedPaths,
      projectConfigPath: report.config.projectPath,
      userConfigPath: report.config.userPath,
    },
    lastReloadTime: report.lastReloadTime,
    delegationCount: report.delegationCount,
  };

  return JSON.stringify(output, null, 2);
}

// ─── JSON Output: History ──────────────────────────────────────────

export interface HistoryJsonOutput {
  schemaVersion: number;
  kind: 'history';
  filters: {
    agent?: string | null;
    status?: string | null;
    mode?: string | null;
    runnerMode?: string | null;
    query?: string | null;
    limit?: number | null;
  };
  count: number;
  items: HistoryJsonItem[];
}

export interface HistoryJsonItem {
  id: number;
  timestamp: string;
  requestedAgent: string;
  resolvedAgent: string;
  mode: string;
  runnerMode: string;
  status: string;
  durationMs: number;
  aliasUsed: boolean;
  replayOf: number | null;
  taskSummary: string;
  errorReason?: string;
}

export function formatHistoryJson(
  records: DelegationRecord[],
  filter?: HistoryFilter,
): string {
  const output: HistoryJsonOutput = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'history',
    filters: {
      agent: filter?.agent ?? null,
      status: filter?.status ?? null,
      mode: filter?.mode ?? null,
      runnerMode: filter?.runnerMode ?? null,
      query: filter?.query ?? null,
      limit: filter?.limit ?? null,
    },
    count: records.length,
    items: records.map(r => ({
      id: r.id,
      timestamp: new Date(r.timestamp).toISOString(),
      requestedAgent: r.requestedAgent,
      resolvedAgent: r.resolvedAgent,
      mode: r.mode,
      runnerMode: r.runnerMode,
      status: r.status,
      durationMs: r.durationMs,
      aliasUsed: r.aliasUsed,
      replayOf: r.replayOf ?? null,
      taskSummary: r.taskSummary,
      errorReason: r.errorReason,
    })),
  };

  return JSON.stringify(output, null, 2);
}

// ─── JSON Output: Metrics ─────────────────────────────────────────

export interface MetricsJsonOutput {
  schemaVersion: number;
  kind: 'metrics';
  totalDelegations: number;
  successCount: number;
  fallbackCount: number;
  errorCount: number;
  averageDurationMs: number;
  perAgent: Record<string, number>;
  perRunnerMode: Record<string, number>;
  tokenUsage: {
    available: false;
    reason: 'provider-call usage data unavailable';
  };
}

export function formatMetricsJson(metrics: MetricsSummary): string {
  const output: MetricsJsonOutput = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'metrics',
    totalDelegations: metrics.total,
    successCount: metrics.success,
    fallbackCount: metrics.fallback,
    errorCount: metrics.error,
    averageDurationMs: metrics.avgDurationMs,
    perAgent: metrics.perAgent,
    perRunnerMode: metrics.perRunnerMode,
    tokenUsage: {
      available: false,
      reason: 'provider-call usage data unavailable',
    },
  };

  return JSON.stringify(output, null, 2);
}

// ─── JSON Output: Validation ──────────────────────────────────────

export interface ValidationJsonOutput {
  schemaVersion: number;
  kind: 'validation';
  ok: boolean;
  issues: ValidationIssueJson[];
  checked: {
    builtin: number;
    template: number;
    user: number;
    project: number;
    total: number;
  };
  tagsChecked: number;
  invalidTagsCount: number;
}

export interface ValidationIssueJson {
  type: 'error' | 'warning';
  file: string;
  message: string;
  field?: string;
}

export function formatValidationJson(result: ValidationResult): string {
  const output: ValidationJsonOutput = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'validation',
    ok: result.ok,
    issues: result.issues.map(i => ({
      type: i.type,
      file: i.file,
      message: i.message,
      field: i.field,
    })),
    checked: result.checked,
    tagsChecked: result.tagsChecked,
    invalidTagsCount: result.invalidTagsCount,
  };

  return JSON.stringify(output, null, 2);
}

// ─── JSON Output: Error ─────────────────────────────────────────────

export interface ErrorJsonOutput {
  schemaVersion: number;
  kind: 'error';
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

/**
 * Format a structured error as JSON.
 * Used when commands need to return structured errors in JSON mode.
 */
export function formatErrorJson(code: string, message: string, details?: Record<string, unknown>): string {
  const output: ErrorJsonOutput = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'error',
    error: {
      code,
      message,
    },
  };
  if (details) {
    output.error.details = details;
  }
  return JSON.stringify(output, null, 2);
}

// ─── Filter augmentation: apply regex to agent ────────────────────

/**
 * Check if an agent matches a compiled regex.
 * Matches against: name, description, aliases, tags.
 * Always uses the 'i' (case-insensitive) flag.
 */
export function agentMatchesRegex(agent: AgentDefinition, regex: RegExp): boolean {
  const searchable = [
    agent.name,
    agent.description,
    ...agent.aliases,
    ...agent.tags,
  ].join(' ');
  return regex.test(searchable);
}

/**
 * Check if a template matches a compiled regex.
 * Matches against: name, description, aliases, tags.
 */
export function templateMatchesRegex(tmpl: FilterableTemplate, regex: RegExp): boolean {
  const searchable = [
    tmpl.name,
    tmpl.description,
    ...tmpl.aliases,
    ...tmpl.tags,
  ].join(' ');
  return regex.test(searchable);
}

// ─── Helpers ───────────────────────────────────────────────────────

/** Truncate text for JSON output. */
function truncateForJson(text: string, maxLen: number): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/** Sanitize text to remove potential API keys before JSON output. */
function sanitizeJsonText(text: string): string {
  if (!text) return '';
  // Remove common API key patterns
  return text
    .replace(/(api[_-]?key)\s*[=:]\s*[A-Za-z0-9_\-]{20,}/gi, '$1=[redacted]')
    .replace(/(sk-[A-Za-z0-9_\-]{20,})/g, '[API_KEY_REDACTED]')
    .replace(/(Bearer\s+)([A-Za-z0-9_\-\.]{20,})/gi, '$1[TOKEN_REDACTED]');
}

/** Classify error into a machine-readable code. */
function classifyErrorCode(errorMessage: string): string {
  const msg = errorMessage.toLowerCase();
  if (msg.includes('not found') || msg.includes('unknown agent')) return 'UNKNOWN_AGENT';
  if (msg.includes('disabled')) return 'AGENT_DISABLED';
  if (msg.includes('invalid agent name')) return 'INVALID_AGENT_NAME';
  if (msg.includes('invalid mode')) return 'INVALID_MODE';
  if (msg.includes('regex')) return 'INVALID_REGEX';
  if (msg.includes('format')) return 'INVALID_FORMAT';
  return 'UNKNOWN_ERROR';
}
