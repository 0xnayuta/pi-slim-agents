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
 */

import type { AgentDefinition, DelegationRecord } from './types.js';
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

// ─── JSON Output: Agents ──────────────────────────────────────────

export interface AgentsJsonOutput {
  schemaVersion: number;
  kind: 'agents';
  filters: {
    tags?: string[];
    query?: string;
    readonly?: boolean;
    writable?: boolean;
    enabled?: boolean;
    disabled?: boolean;
    source?: string;
    regex?: string | null;
  };
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
}

export function formatAgentsJson(
  agents: AgentDefinition[],
  filter: AgentFilter & { regex?: RegExp | null },
): string {
  const output: AgentsJsonOutput = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'agents',
    filters: {
      tags: filter.tags,
      query: filter.query,
      readonly: filter.readonly,
      writable: filter.writable,
      enabled: filter.enabled,
      disabled: filter.disabled,
      source: filter.source,
      regex: filter.regex instanceof RegExp ? filter.regex.source : null,
    },
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
    })),
  };

  return JSON.stringify(output, null, 2);
}

// ─── JSON Output: Templates ────────────────────────────────────────

export interface TemplatesJsonOutput {
  schemaVersion: number;
  kind: 'templates';
  filters: {
    tags?: string[];
    query?: string;
    readonly?: boolean;
    writable?: boolean;
    regex?: string | null;
  };
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
}

export function formatTemplatesJson(
  templates: FilterableTemplate[],
  filter: TemplateFilter & { regex?: RegExp | null },
): string {
  const output: TemplatesJsonOutput = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'templates',
    filters: {
      tags: filter.tags,
      query: filter.query,
      readonly: filter.readonly,
      writable: filter.writable,
      regex: filter.regex instanceof RegExp ? filter.regex.source : null,
    },
    count: templates.length,
    items: templates.map(t => ({
      name: t.name,
      description: t.description,
      readonly: t.readonly,
      aliases: t.aliases,
      tags: t.tags,
      recommendedMode: t.recommendedMode,
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
    agent?: string;
    status?: string;
    mode?: string;
    runnerMode?: string;
    query?: string;
    limit?: number;
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
      agent: filter?.agent,
      status: filter?.status,
      mode: filter?.mode,
      runnerMode: filter?.runnerMode,
      query: filter?.query,
      limit: filter?.limit,
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
