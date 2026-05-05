/**
 * Command parsing and replay logic for pi-slim-agents.
 *
 * Provides:
 *   - Flag parsing utility
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

// ─── Flag Parsing ──────────────────────────────────────────────────

export interface ParsedFlags {
  flags: Record<string, string>;
  positional: string[];
}

/**
 * Parse CLI-style flags from an argument string.
 *
 * Handles:
 *   - --key value pairs
 *   - -k value short forms
 *   - Quoted values: --key "multi word value"
 *   - Boolean flags: --verbose (sets to "true")
 *   - Positional arguments (non-flag tokens)
 */
export function parseFlags(args: string): ParsedFlags {
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  const tokens = tokenizeArgs(args.trim());

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.startsWith('-')) {
      const key = token.replace(/^-{1,2}/, '');
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
        flags[key] = tokens[i + 1];
        i += 2;
      } else {
        flags[key] = 'true';
        i++;
      }
    } else {
      positional.push(token);
      i++;
    }
  }

  return { flags, positional };
}

/**
 * Tokenize an argument string, respecting quoted values.
 */
function tokenizeArgs(args: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);

  return tokens;
}

// ─── Constants ──────────────────────────────────────────────────────

const VALID_MODES = ['quick', 'normal', 'deep'] as const;

// ─── /agent Command Parsing ────────────────────────────────────────

export interface ParsedAgentCommand {
  agent: string;
  task: string;
  mode?: 'quick' | 'normal' | 'deep';
  modeError?: string;
}

/**
 * Parse the arguments string from `/agent <args>`.
 *
 * Supports --mode / -m flag before or between positional args.
 * First positional is the agent name, rest is the task.
 *
 * Examples:
 *   "/agent --mode deep oracle review this design"
 *     → { agent: "oracle", task: "review this design", mode: "deep" }
 *   "/agent -m quick explorer find playback code"
 *     → { agent: "explorer", task: "find playback code", mode: "quick" }
 *   "/agent oracle --mode deep review this"
 *     → { agent: "oracle", task: "review this", mode: "deep" }
 *   "/agent explorer find playback speed implementation"
 *     → { agent: "explorer", task: "find playback speed implementation" }
 */
export function parseAgentCommand(args: string): ParsedAgentCommand {
  const { flags, positional } = parseFlags(args);

  let mode: DelegateAgentParams['mode'] = undefined;
  let modeError: string | undefined;

  const modeValue = flags.mode ?? flags.m;
  if (modeValue) {
    if (!(VALID_MODES as readonly string[]).includes(modeValue)) {
      modeError = `Invalid mode "${modeValue}". Valid modes: ${VALID_MODES.join(', ')}`;
    } else {
      mode = modeValue as DelegateAgentParams['mode'];
    }
  }

  if (positional.length === 0) {
    return { agent: '', task: '', mode, modeError };
  }

  const agent = positional[0];
  const task = positional.slice(1).join(' ');

  return { agent, task, mode, modeError };
}

/**
 * Generate the help text shown when /agent is called without arguments.
 */
export function buildAgentHelpText(): string {
  return [
    '# /agent — Quick Delegation',
    '',
    'Usage: /agent [--mode <mode>] <agent-or-alias> <task...>',
    '',
    'Modes: quick, normal (default), deep',
    '',
    'Examples:',
    '  /agent explorer find playback speed implementation',
    '  /agent --mode deep oracle review the architecture',
    '  /agent -m quick search find playback code',
    '  /agent arch review the UI flow',
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
  replayOf?: number,
): Promise<DelegationResult> {
  const startTime = Date.now();
  const result = await runDelegation(params, cwd, config, providerCtx);
  const durationMs = Date.now() - startTime;

  const runnerMode: RunnerMode = config.runnerMode ?? 'prompt-only';
  const delegationStatus = determineDelegationStatus(result, config);
  const taskSummary = params.task.length > 80 ? params.task.slice(0, 77) + '...' : params.task;
  const aliasUsed = result.ok && params.agent !== result.agentName;

  // Determine whether to store full task/context/files
  const storeTask = config.history?.storeFullTask !== false;
  const storeContext = config.history?.storeFullContext !== false;

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
    fullTask: storeTask ? params.task : undefined,
    fullContext: storeContext ? params.context : undefined,
    fullFiles: storeTask ? params.files : undefined,
    replayOf,
  });

  return result;
}

// ─── Replay ─────────────────────────────────────────────────────────

export interface ReplayResult {
  ok: boolean;
  result?: DelegationResult;
  error?: string;
  aliasDriftWarning?: string;
  modifications?: string[];
  originalAgent?: string;
  newAgent?: string;
}

export interface ParsedReplayArgs {
  id: number | null;
  overrides: Partial<DelegateAgentParams>;
  error?: string;
}

/**
 * Parse replay command arguments.
 *
 * Examples:
 *   "5" → { id: 5, overrides: {} }
 *   "5 --mode deep" → { id: 5, overrides: { mode: "deep" } }
 *   "5 --agent oracle --task 'new task'" → { id: 5, overrides: { agent: "oracle", task: "new task" } }
 */
export function parseReplayArgs(args: string): ParsedReplayArgs {
  const { flags, positional } = parseFlags(args);

  if (positional.length === 0) {
    return { id: null, overrides: {} };
  }

  const idStr = positional[0];
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return { id: null, overrides: {}, error: `Invalid history ID "${idStr}". Must be a number.` };
  }

  const overrides: Partial<DelegateAgentParams> = {};

  if (flags.agent) {
    overrides.agent = flags.agent;
  }

  if (flags.mode || flags.m) {
    const modeValue = flags.mode ?? flags.m;
    if (!(VALID_MODES as readonly string[]).includes(modeValue)) {
      return { id, overrides: {}, error: `Invalid mode "${modeValue}". Valid modes: ${VALID_MODES.join(', ')}` };
    }
    overrides.mode = modeValue as DelegateAgentParams['mode'];
  }

  if (flags.task) {
    overrides.task = flags.task;
  }

  if (flags.context) {
    overrides.context = flags.context;
  }

  if (flags.files) {
    overrides.files = flags.files.split(',').map(f => f.trim()).filter(Boolean);
  }

  return { id, overrides };
}

/**
 * Replay a delegation from history with optional parameter overrides.
 *
 * Looks up the record by id, validates it, and re-runs the delegation
 * with original parameters (optionally overridden).
 *
 * @param overrides - Optional parameter overrides for the replay.
 */
export async function replayDelegation(
  id: number,
  cwd: string,
  config: SlimAgentsConfig,
  providerCallAvailable: boolean,
  providerCtx?: ProviderRunnerContext,
  overrides?: Partial<DelegateAgentParams>,
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

  const agents = loadAgents(cwd, config);

  // Determine effective agent
  let resolvedAgentName = record.resolvedAgent;
  if (overrides?.agent) {
    const resolved = resolveAgentName(overrides.agent, agents);
    if (!resolved) {
      return {
        ok: false,
        error: `Agent "${overrides.agent}" not found. Use /agents to see available agents.`,
      };
    }
    resolvedAgentName = resolved;
  }

  const agent = agents.find(a => a.name === resolvedAgentName);

  if (!agent) {
    return {
      ok: false,
      error: `Agent "${resolvedAgentName}" (from history #${id}) no longer exists. Use --agent to specify a different agent.`,
    };
  }

  if (!agent.enabled) {
    return {
      ok: false,
      error: `Agent "${resolvedAgentName}" (from history #${id}) is now disabled. Use --agent to specify a different agent, or enable it first.`,
    };
  }

  // Check for alias drift (only when not overriding agent)
  let aliasDriftWarning: string | undefined;
  if (!overrides?.agent && record.aliasUsed) {
    const currentResolved = resolveAgentName(record.requestedAgent, agents);
    if (currentResolved && currentResolved !== record.resolvedAgent) {
      aliasDriftWarning = `⚠️ Alias "${record.requestedAgent}" now resolves to "${currentResolved}" (was "${record.resolvedAgent}"). Using original agent "${record.resolvedAgent}" to avoid drift.`;
    }
  }

  // Build replay params
  const replayParams: DelegateAgentParams = {
    agent: resolvedAgentName,
    task: overrides?.task ?? record.fullTask ?? record.taskSummary,
    context: overrides?.context ?? record.fullContext,
    files: overrides?.files ?? record.fullFiles,
    mode: overrides?.mode ?? (record.mode as DelegateAgentParams['mode']) ?? 'normal',
  };

  // Track modifications
  const modifications: string[] = [];
  if (overrides?.agent) modifications.push(`agent: ${record.resolvedAgent} → ${resolvedAgentName}`);
  if (overrides?.mode) modifications.push(`mode: ${record.mode} → ${overrides.mode}`);
  if (overrides?.task) modifications.push('task: modified');
  if (overrides?.context) modifications.push('context: modified');
  if (overrides?.files) modifications.push('files: modified');

  const result = await runAndRecordDelegation(
    replayParams,
    cwd,
    config,
    providerCallAvailable,
    providerCtx,
    id, // replayOf
  );

  return {
    ok: true,
    result,
    aliasDriftWarning,
    modifications: modifications.length > 0 ? modifications : undefined,
    originalAgent: record.resolvedAgent,
    newAgent: resolvedAgentName,
  };
}
