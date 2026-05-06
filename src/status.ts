/**
 * Status, reload, and formatting for pi-slim-agents.
 *
 * Provides:
 *   - Status report building and formatting
 *   - Config/agent reload logic
 *   - History table formatting
 *   - Metrics formatting
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AgentDefinition, DelegationRecord, SlimAgentsConfig } from './types.js';
import { loadConfig } from './config.js';
import { loadAgents } from './agents.js';
import { projectConfigPath, userConfigPath } from './utils.js';
import { historyStore, type MetricsSummary } from './history.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface StatusReport {
  packageName: string;
  version: string;
  runnerMode: string;
  providerCall: {
    available: boolean;
    reason: string;
  };
  config: {
    userPath: string;
    projectPath: string;
    userExists: boolean;
    projectExists: boolean;
  };
  agents: {
    total: number;
    enabled: number;
    disabled: number;
    aliasCount: number;
    list: Array<{
      name: string;
      enabled: boolean;
      readonly: boolean;
      aliases: string[];
      source: string;
    }>;
  };
  lastReloadTime: string | null;
  delegationCount: number;
  persistentHistory: {
    enabled: boolean;
    lastWarning: string | null;
  };
}

export interface ReloadResult {
  ok: boolean;
  config: SlimAgentsConfig;
  agents: AgentDefinition[];
  agentCount: number;
  enabledCount: number;
  disabledCount: number;
  aliasCount: number;
  loadedConfigPaths: string[];
  error?: string;
}

// ─── Package Info ───────────────────────────────────────────────────

export function getPackageInfo(): { name: string; version: string } {
  try {
    const srcDir = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(srcDir, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return { name: pkg.name ?? 'unknown', version: pkg.version ?? '0.0.0' };
  } catch {
    return { name: 'unknown', version: '0.0.0' };
  }
}

// ─── Status Report ──────────────────────────────────────────────────

export function buildStatusReport(params: {
  cwd: string;
  config: SlimAgentsConfig;
  providerCallStatus: { available: boolean; error?: string } | null;
  lastReloadTime: string | null;
  delegationCount: number;
}): StatusReport {
  const { cwd, config, providerCallStatus, lastReloadTime, delegationCount } = params;
  const agents = loadAgents(cwd, config);
  const enabled = agents.filter(a => a.enabled);
  const disabled = agents.filter(a => !a.enabled);
  const aliasCount = agents.reduce((sum, a) => sum + a.aliases.length, 0);
  const pkg = getPackageInfo();

  const userPath = userConfigPath();
  const projPath = projectConfigPath(cwd);

  // Get persistent history status
  const persistentStatus = historyStore.getPersistentStatus();

  return {
    packageName: pkg.name,
    version: pkg.version,
    runnerMode: config.runnerMode ?? 'prompt-only',
    providerCall: {
      available: providerCallStatus?.available ?? false,
      reason: categorizeProviderError(providerCallStatus?.error),
    },
    config: {
      userPath,
      projectPath: projPath,
      userExists: fs.existsSync(userPath),
      projectExists: fs.existsSync(projPath),
    },
    agents: {
      total: agents.length,
      enabled: enabled.length,
      disabled: disabled.length,
      aliasCount,
      list: agents.map(a => ({
        name: a.name,
        enabled: a.enabled,
        readonly: a.readonly,
        aliases: a.aliases,
        source: a.source ?? 'unknown',
      })),
    },
    lastReloadTime,
    delegationCount,
    persistentHistory: {
      enabled: persistentStatus.enabled,
      lastWarning: persistentStatus.lastWarning ?? null,
    },
  };
}

export function formatStatusReport(report: StatusReport): string {
  const lines: string[] = ['# Slim Agents Status', ''];

  lines.push(`Package:      ${report.packageName} v${report.version}`);
  lines.push(`Runner Mode:  ${report.runnerMode}`);

  const providerStr = report.providerCall.available
    ? 'available'
    : `unavailable (${report.providerCall.reason})`;
  lines.push(`Provider:     ${providerStr}`);

  lines.push('', 'Config:');
  lines.push(
    `  User config:    ${report.config.userPath}${report.config.userExists ? '' : ' (not found)'}`,
  );
  lines.push(
    `  Project config: ${report.config.projectPath}${report.config.projectExists ? '' : ' (not found)'}`,
  );

  lines.push(
    '',
    `Agents: ${report.agents.total} (${report.agents.enabled} enabled, ${report.agents.disabled} disabled, ${report.agents.aliasCount} aliases)`,
  );

  if (report.agents.list.length > 0) {
    lines.push('');
    lines.push('  Name             Status    RO   Source    Aliases');
    lines.push('  ' + '─'.repeat(65));
    for (const a of report.agents.list) {
      const name = `@${a.name}`.padEnd(17);
      const status = (a.enabled ? 'enabled' : 'disabled').padEnd(8);
      const ro = (a.readonly ? 'yes' : 'no ').padEnd(3);
      const source = a.source.padEnd(8);
      const aliases = a.aliases.length > 0 ? a.aliases.join(', ') : '—';
      lines.push(`  ${name} ${status}  ${ro}  ${source}  ${aliases}`);
    }
  }

  lines.push('', `Delegations: ${report.delegationCount} total`);

  // Show persistent history status
  if (report.persistentHistory.enabled) {
    lines.push('Persistent History: enabled');
    if (report.persistentHistory.lastWarning) {
      lines.push(`  ⚠️  Last warning: ${report.persistentHistory.lastWarning}`);
    }
  } else {
    lines.push('Persistent History: disabled');
  }

  if (report.lastReloadTime) {
    lines.push(`Last Reload: ${report.lastReloadTime}`);
  }

  return lines.join('\n');
}

// ─── History Table ──────────────────────────────────────────────────

export function formatHistoryTable(records: DelegationRecord[]): string {
  const lines: string[] = ['# Delegation History', ''];

  if (records.length === 0) {
    lines.push('No delegations recorded yet.');
    return lines.join('\n');
  }

  lines.push(
    '  ID   Time       Agent            Task                  Mode    Status     Dur.',
  );
  lines.push('  ' + '─'.repeat(78));

  for (const r of records) {
    const id = String(r.id).padStart(4);
    const time = formatTime(r.timestamp);
    const agent = `@${r.resolvedAgent}`.padEnd(15);
    const task = truncate(r.taskSummary, 22).padEnd(22);
    const mode = r.mode.padEnd(6);
    const status = r.status.padEnd(9);
    const dur = formatDuration(r.durationMs).padStart(6);
    const alias = r.aliasUsed ? ` (via ${r.requestedAgent})` : '';
    const replay = r.replayOf ? ` (replay #${r.replayOf})` : '';

    lines.push(`  ${id} ${time}   ${agent} ${task}  ${mode}  ${status} ${dur}${alias}${replay}`);
  }

  return lines.join('\n');
}

// ─── Metrics ────────────────────────────────────────────────────────

export function formatMetrics(metrics: MetricsSummary): string {
  const lines: string[] = ['# Delegation Metrics', ''];

  const pct = (n: number) =>
    metrics.total > 0 ? `(${Math.round((n / metrics.total) * 100)}%)` : '';

  lines.push(`Total:    ${metrics.total}`);
  lines.push(`Success:  ${metrics.success}  ${pct(metrics.success)}`);
  lines.push(`Fallback: ${metrics.fallback}  ${pct(metrics.fallback)}`);
  lines.push(`Error:    ${metrics.error}  ${pct(metrics.error)}`);

  lines.push('', `Avg Duration: ${formatDuration(metrics.avgDurationMs)}`);
  lines.push('Token Usage:  unavailable');

  if (Object.keys(metrics.perAgent).length > 0) {
    lines.push('', 'Per-Agent:');
    const sorted = Object.entries(metrics.perAgent).sort((a, b) => b[1] - a[1]);
    for (const [agent, count] of sorted) {
      lines.push(`  @${agent.padEnd(14)} ${count} call${count === 1 ? '' : 's'}`);
    }
  }

  if (Object.keys(metrics.perRunnerMode).length > 0) {
    lines.push('', 'Per-RunnerMode:');
    for (const [mode, count] of Object.entries(metrics.perRunnerMode)) {
      lines.push(`  ${mode.padEnd(16)} ${count} call${count === 1 ? '' : 's'}`);
    }
  }

  lines.push('', 'Provider-Call:');
  lines.push(`  Available:    ${metrics.providerCallAvailable}`);
  lines.push(`  Unavailable:  ${metrics.providerCallUnavailable}`);

  return lines.join('\n');
}

// ─── Reload ─────────────────────────────────────────────────────────

export function formatReloadResult(result: ReloadResult, reloadTime: string): string {
  if (!result.ok) {
    return [
      '# Reload Failed',
      '',
      `Error: ${result.error}`,
      '',
      'Previous state preserved.',
    ].join('\n');
  }

  const loadedPaths =
    result.loadedConfigPaths.length > 0 ? result.loadedConfigPaths.join(', ') : '(none)';

  return [
    '# Reload Complete',
    '',
    `Agents:    ${result.agentCount} loaded (${result.enabledCount} enabled, ${result.disabledCount} disabled)`,
    `Aliases:   ${result.aliasCount}`,
    `Config:    ${loadedPaths}`,
    `Time:      ${reloadTime}`,
  ].join('\n');
}

/**
 * Perform a full reload of config and agents from disk.
 *
 * This function does NOT mutate any external state — it returns the
 * new state for the caller to apply.
 */
export function performReload(cwd: string): ReloadResult {
  try {
    const newConfig = loadConfig(cwd);
    const agents = loadAgents(cwd, newConfig);

    const enabled = agents.filter(a => a.enabled);
    const disabled = agents.filter(a => !a.enabled);
    const aliasCount = agents.reduce((sum, a) => sum + a.aliases.length, 0);

    const loadedPaths: string[] = [];
    const projPath = projectConfigPath(cwd);
    const usrPath = userConfigPath();
    if (fs.existsSync(projPath)) loadedPaths.push(projPath);
    if (fs.existsSync(usrPath)) loadedPaths.push(usrPath);

    return {
      ok: true,
      config: newConfig,
      agents,
      agentCount: agents.length,
      enabledCount: enabled.length,
      disabledCount: disabled.length,
      aliasCount,
      loadedConfigPaths: loadedPaths,
    };
  } catch (err) {
    return {
      ok: false,
      config: {},
      agents: [],
      agentCount: 0,
      enabledCount: 0,
      disabledCount: 0,
      aliasCount: 0,
      loadedConfigPaths: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function categorizeProviderError(error?: string): string {
  if (!error) return 'unknown';
  // Sanitize: strip anything that looks like a secret
  const sanitized = error.replace(/(\w*(?:key|token|secret|password|auth)\w*)\s*[=:]\s*\S+/gi, '$1=[redacted]');
  if (sanitized.includes('Cannot find module') || sanitized.includes('ERR_MODULE_NOT_FOUND')) {
    return 'pi-ai not importable';
  }
  if (sanitized.includes('does not export complete')) {
    return 'pi-ai does not export complete()';
  }
  return sanitized.length > 60 ? sanitized.slice(0, 57) + '...' : sanitized;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
  } catch {
    return '??:??:??';
  }
}
