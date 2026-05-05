/**
 * Delegation history and metrics for pi-slim-agents.
 *
 * In-memory store — cleared on process restart.
 * No persistence, no database, no file I/O.
 */

import type { DelegationRecord, DelegationResult, RunnerMode, SlimAgentsConfig } from './types.js';

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

// ─── History Store ──────────────────────────────────────────────────

const MAX_HISTORY = 200;

class HistoryStore {
  private records: DelegationRecord[] = [];

  add(record: DelegationRecord): void {
    this.records.push(record);
    if (this.records.length > MAX_HISTORY) {
      this.records = this.records.slice(-MAX_HISTORY);
    }
  }

  /** Get the N most recent records (newest first). */
  recent(n: number = 10): DelegationRecord[] {
    return this.records.slice(-n).reverse();
  }

  count(): number {
    return this.records.length;
  }

  clear(): void {
    this.records = [];
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
