/**
 * Command parsing and replay logic for pi-slim-agents.
 *
 * Provides:
 *   - /agent command parsing (parseAgentCommand)
 *   - Replay delegation from history (replayDelegation)
 */

import type {
  AgentDefinition,
  DelegateAgentParams,
  DelegationRecord,
  DelegationResult,
  RunnerMode,
  SlimAgentsConfig,
} from './types.js';
import { loadAgents, resolveAgentName } from './agents.js';
import { runDelegation, type ProviderRunnerContext } from './runner.js';
import { historyStore, determineDelegationStatus } from './history.js';
import { isSafeAgentName } from './utils.js';

// ─── /agent Command Parsing ────────────────────────────────────────

export interface ParsedAgentCommand {
  agent: string;
  task: string;
}

/**
 * Parse the arguments string from `/agent <args>`.
 *
 * The first word is the agent name (or alias), the rest is the task.
 *
 * Examples:
 *   "explorer find playback speed implementation" → { agent: "explorer", task: "find playback speed implementation" }
 *   "search find where .devpiano files are saved" → { agent: "search", task: "find where .devpiano files are saved" }
 *   "oracle" → { agent: "oracle", task: "" }
 *   "" → { agent: "", task: "" }
 */
export function parseAgentCommand(args: string): ParsedAgentCommand {
  const trimmed = args.trim();
  if (!trimmed) {
    return { agent: '', task: '' };
  }

  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return { agent: trimmed, task: '' };
  }

  return {
    agent: trimmed.slice(0, spaceIdx),
    task: trimmed.slice(spaceIdx + 1).trim(),
  };
}

/**
 * Generate the help text shown when /agent is called without arguments.
 */
export function buildAgentHelpText(): string {
  return [
    '# /agent — Quick Delegation',
    '',
    'Usage: /agent <agent-or-alias> <task...>',
    '',
    'Examples:',
    '  /agent explorer find playback speed implementation',
    '  /agent search find where .devpiano files are saved',
    '  /agent oracle review the playback speed design',
    '  /agent arch check whether this approach is over-engineered',
    '  /agent designer review the controls panel UX',
    '  /agent fixer implement a small null check',
    '',
    'Use /agents to list all available agents and aliases.',
  ].join('\n');
}

/**
 * Generate the available agents list for error messages.
 */
export function buildAvailableAgentsList(cwd: string, config: SlimAgentsConfig): string {
  const agents = loadAgents(cwd, config);
  const enabled = agents.filter(a => a.enabled);
  const lines: string[] = ['# Available Agents', ''];

  for (const agent of enabled) {
    const aliases = agent.aliases.length > 0 ? ` (aliases: ${agent.aliases.join(', ')})` : '';
    lines.push(`- ${agent.name}${aliases}`);
  }

  return lines.join('\n');
}

// ─── Delegation Helpers ─────────────────────────────────────────────

/**
 * Run a delegation and record it in history.
 *
 * This is the shared logic between delegate_agent tool and /agent command.
 */
export async function runAndRecordDelegation(
  params: DelegateAgentParams,
  cwd: string,
  config: SlimAgentsConfig,
  providerCallAvailable: boolean,
  providerCtx?: ProviderRunnerContext,
): Promise<DelegationResult> {
  const startTime = Date.now();
  const result = await runDelegation(params, cwd, config, providerCtx);
  const durationMs = Date.now() - startTime;

  const runnerMode: RunnerMode = config.runnerMode ?? 'prompt-only';
  const delegationStatus = determineDelegationStatus(result, config);
  const taskSummary = params.task.length > 80 ? params.task.slice(0, 77) + '...' : params.task;
  const aliasUsed = result.ok && params.agent !== result.agentName;

  // Determine whether to store full task/context/files
  const storeFull = config.history?.storeFullTask !== false;

  historyStore.add({
    timestamp: startTime,
    requestedAgent: params.agent,
    resolvedAgent: result.agentName,
    taskSummary,
    mode: params.mode ?? 'normal',
    runnerMode,
    status: delegationStatus.status,
    durationMs,
    providerCallAvailable,
    errorReason: delegationStatus.errorReason,
    aliasUsed,
    fullTask: storeFull ? params.task : undefined,
    fullContext: storeFull ? params.context : undefined,
    fullFiles: storeFull ? params.files : undefined,
  });

  return result;
}

// ─── Replay ─────────────────────────────────────────────────────────

export interface ReplayResult {
  ok: boolean;
  result?: DelegationResult;
  error?: string;
  aliasDriftWarning?: string;
}

/**
 * Replay a delegation from history.
 *
 * Looks up the record by id, validates it, and re-runs the delegation
 * with the original parameters.
 */
export async function replayDelegation(
  id: number,
  cwd: string,
  config: SlimAgentsConfig,
  providerCallAvailable: boolean,
  providerCtx?: ProviderRunnerContext,
): Promise<ReplayResult> {
  // Look up the record
  const record = historyStore.getById(id);
  if (!record) {
    const availableIds = historyStore.allIds();
    const idsStr = availableIds.length > 0
      ? `Available IDs: ${availableIds.join(', ')}`
      : 'No history records available.';
    return {
      ok: false,
      error: `History record #${id} not found. ${idsStr}`,
    };
  }

  // Check if the resolved agent is still enabled
  const agents = loadAgents(cwd, config);
  const agent = agents.find(a => a.name === record.resolvedAgent);

  if (!agent) {
    return {
      ok: false,
      error: `Agent "${record.resolvedAgent}" (from history #${id}) no longer exists. It may have been removed.`,
    };
  }

  if (!agent.enabled) {
    return {
      ok: false,
      error: `Agent "${record.resolvedAgent}" (from history #${id}) is now disabled. Enable it first to replay.`,
    };
  }

  // Check for alias drift
  let aliasDriftWarning: string | undefined;
  if (record.aliasUsed) {
    const currentResolved = resolveAgentName(record.requestedAgent, agents);
    if (currentResolved && currentResolved !== record.resolvedAgent) {
      aliasDriftWarning = `⚠️ Alias "${record.requestedAgent}" now resolves to "${currentResolved}" (was "${record.resolvedAgent}"). Using original agent "${record.resolvedAgent}" to avoid drift.`;
    }
  }

  // Build replay params — always use resolvedAgent to avoid alias drift
  const replayParams: DelegateAgentParams = {
    agent: record.resolvedAgent,
    task: record.fullTask ?? record.taskSummary,
    context: record.fullContext,
    files: record.fullFiles,
    mode: (record.mode as DelegateAgentParams['mode']) ?? 'normal',
  };

  const result = await runAndRecordDelegation(
    replayParams,
    cwd,
    config,
    providerCallAvailable,
    providerCtx,
  );

  return {
    ok: true,
    result,
    aliasDriftWarning,
  };
}
