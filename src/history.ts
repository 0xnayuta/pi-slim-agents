/**
 * Delegation history and metrics for pi-slim-agents.
 *
 * In-memory store with optional persistent JSONL backing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DelegationRecord, DelegationResult, HistoryConfig, RunnerMode, SlimAgentsConfig } from './types.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface MetricsSummary {
  total: number;
  success: number;
  fallback: number;
  error: number;
  avgDurationMs: number;
  perAgent: Record<string, number>;
  perRunnerMode: Record<string, number>;
  providerCallAvailable: number;
  providerCallUnavailable: number;
}

export interface HistoryFilter {
  /** Filter by agent name (matches requestedAgent or resolvedAgent). */
  agent?: string;
  /** Filter by delegation status. */
  status?: 'success' | 'fallback' | 'error';
  /** Filter by runner mode. */
  runnerMode?: RunnerMode;
  /** Filter by delegation mode (quick/normal/deep). */
  mode?: string;
  /** Maximum number of results (default 10, max 100). */
  limit?: number;
  /** Case-insensitive text search in task, agent names, and context. */
  query?: string;
}

// ─── History Store ──────────────────────────────────────────────────

const DEFAULT_MAX_HISTORY = 200;

class HistoryStore {
  private nextId = 1;
  private records: DelegationRecord[] = [];
  private persistent = false;
  private persistentPath = '';
  private retention = DEFAULT_MAX_HISTORY;

  /**
   * Initialize persistent history storage.
   * Call once at session start. No-op if persistent is not enabled.
   */
  init(cwd: string, historyConfig?: HistoryConfig): void {
    if (!historyConfig?.persistent) return;
    if (this.persistent) return; // Already initialized

    this.persistent = true;
    this.persistentPath = path.resolve(cwd, historyConfig.path ?? '.pi/slim-agents/history.jsonl');
    this.retention = historyConfig.retention ?? DEFAULT_MAX_HISTORY;

    this.loadFromDisk();
  }

  add(record: Omit<DelegationRecord, 'id'>): DelegationRecord {
    const full: DelegationRecord = { ...record, id: this.nextId++ };
    this.records.push(full);

    if (this.records.length > this.retention) {
      this.records = this.records.slice(-this.retention);
      if (this.persistent) {
        this.rewriteDisk();
      }
    } else if (this.persistent) {
      this.appendToDisk(full);
    }

    return full;
  }

  /** Get the N most recent records (newest first). */
  recent(n: number = 10): DelegationRecord[] {
    return this.records.slice(-n).reverse();
  }

  /** Get a record by its id. */
  getById(id: number): DelegationRecord | undefined {
    return this.records.find(r => r.id === id);
  }

  /** Get all record ids (for error messages). */
  allIds(): number[] {
    return this.records.map(r => r.id);
  }

  count(): number {
    return this.records.length;
  }

  clear(): void {
    this.records = [];
    this.nextId = 1;
    if (this.persistent) {
      try {
        const dir = path.dirname(this.persistentPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.persistentPath, '');
      } catch {
        // Ignore write errors on clear
      }
    }
  }

  /**
   * Filter history records by criteria.
   * Returns newest-first, limited to `limit` (default 10, max 100).
   */
  filter(f: HistoryFilter): DelegationRecord[] {
    let records = [...this.records].reverse(); // newest first

    if (f.agent) {
      const agentLower = f.agent.toLowerCase();
      records = records.filter(
        r =>
          r.requestedAgent.toLowerCase().includes(agentLower) ||
          r.resolvedAgent.toLowerCase().includes(agentLower),
      );
    }

    if (f.status) {
      records = records.filter(r => r.status === f.status);
    }

    if (f.runnerMode) {
      records = records.filter(r => r.runnerMode === f.runnerMode);
    }

    if (f.mode) {
      records = records.filter(r => r.mode === f.mode);
    }

    if (f.query) {
      const q = f.query.toLowerCase();
      records = records.filter(
        r =>
          r.taskSummary.toLowerCase().includes(q) ||
          r.resolvedAgent.toLowerCase().includes(q) ||
          r.requestedAgent.toLowerCase().includes(q) ||
          (r.fullContext?.toLowerCase().includes(q) ?? false),
      );
    }

    const limit = Math.min(f.limit ?? 10, 100);
    return records.slice(0, limit);
  }

  /**
   * Export history as JSON string.
   * Strips full task/context/files for privacy.
   */
  exportJson(filter?: HistoryFilter): string {
    const records = filter
      ? this.filter({ ...filter, limit: filter.limit ?? this.records.length })
      : [...this.records].reverse();

    const stripped = records.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      requestedAgent: r.requestedAgent,
      resolvedAgent: r.resolvedAgent,
      taskSummary: r.taskSummary,
      mode: r.mode,
      runnerMode: r.runnerMode,
      status: r.status,
      durationMs: r.durationMs,
      providerCallAvailable: r.providerCallAvailable,
      errorReason: r.errorReason,
      aliasUsed: r.aliasUsed,
      replayOf: r.replayOf,
    }));

    return JSON.stringify(stripped, null, 2);
  }

  metrics(): MetricsSummary {
    const total = this.records.length;
    let success = 0;
    let fallback = 0;
    let error = 0;
    let totalDuration = 0;
    const perAgent: Record<string, number> = {};
    const perRunnerMode: Record<string, number> = {};
    let providerCallAvailable = 0;
    let providerCallUnavailable = 0;

    for (const r of this.records) {
      if (r.status === 'success') success++;
      else if (r.status === 'fallback') fallback++;
      else error++;

      totalDuration += r.durationMs;
      perAgent[r.resolvedAgent] = (perAgent[r.resolvedAgent] ?? 0) + 1;
      perRunnerMode[r.runnerMode] = (perRunnerMode[r.runnerMode] ?? 0) + 1;

      if (r.providerCallAvailable) providerCallAvailable++;
      else providerCallUnavailable++;
    }

    return {
      total,
      success,
      fallback,
      error,
      avgDurationMs: total > 0 ? Math.round(totalDuration / total) : 0,
      perAgent,
      perRunnerMode,
      providerCallAvailable,
      providerCallUnavailable,
    };
  }

  // ─── Persistent history I/O ─────────────────────────────────────

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.persistentPath)) return;

      const content = fs.readFileSync(this.persistentPath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());
      const records: DelegationRecord[] = [];

      for (const line of lines) {
        try {
          records.push(JSON.parse(line));
        } catch {
          // Skip malformed lines
        }
      }

      this.records = records;
      if (records.length > 0) {
        this.nextId = Math.max(...records.map(r => r.id)) + 1;
      }

      // Enforce retention
      if (this.records.length > this.retention) {
        this.records = this.records.slice(-this.retention);
        this.rewriteDisk();
      }
    } catch (err) {
      console.warn(
        `[slim-agents] Failed to load persistent history: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private appendToDisk(record: DelegationRecord): void {
    try {
      const dir = path.dirname(this.persistentPath);
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(this.persistentPath, JSON.stringify(record) + '\n');
    } catch (err) {
      console.warn(
        `[slim-agents] Failed to write persistent history: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private rewriteDisk(): void {
    try {
      const dir = path.dirname(this.persistentPath);
      fs.mkdirSync(dir, { recursive: true });
      const content = this.records.map(r => JSON.stringify(r)).join('\n') + '\n';
      fs.writeFileSync(this.persistentPath, content);
    } catch (err) {
      console.warn(
        `[slim-agents] Failed to rewrite persistent history: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/** Module-level singleton — one per process. */
export const historyStore = new HistoryStore();

// ─── Status Determination ───────────────────────────────────────────

/**
 * Determine the delegation outcome status from a DelegationResult.
 *
 * Logic:
 *   - result.ok === false → 'error'
 *   - runnerMode is 'provider-call' but no actual model output → 'fallback'
 *   - otherwise → 'success'
 */
export function determineDelegationStatus(
  result: DelegationResult,
  config: SlimAgentsConfig,
): { status: 'success' | 'fallback' | 'error'; errorReason?: string } {
  if (!result.ok) {
    return { status: 'error', errorReason: result.error };
  }

  const runnerMode: RunnerMode = config.runnerMode ?? 'prompt-only';
  if (runnerMode === 'provider-call') {
    // Provider-call was configured. Check if we actually got model output.
    // Success case has "\nResult:\n" in providerOutput.
    if (!result.meta || !result.providerOutput?.includes('\nResult:\n')) {
      const reason = result.message ?? 'provider-call unavailable';
      return { status: 'fallback', errorReason: reason };
    }
  }

  return { status: 'success' };
}
