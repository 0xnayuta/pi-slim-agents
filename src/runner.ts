/**
 * Delegation runner for pi-slim-agents.
 *
 * Routes between two runner modes:
 *   - "prompt-only"  — returns a structured delegation prompt (default)
 *   - "provider-call" — attempts to call the model via pi-ai, with fallback
 *
 * Both modes share the same validation, alias resolution, and disabled-agent
 * checks. Only the final output generation differs.
 */

import type {
  AgentDefinition,
  DelegationResult,
  DelegateAgentParams,
  RunnerMode,
  SlimAgentsConfig,
} from './types.js';
import { loadAgents, resolveAgentName } from './agents.js';
import { isSafeAgentName } from './utils.js';
import { buildExpectedOutputSection } from './output-template.js';
import { runProviderDelegation, type ProviderRunnerContext } from './provider-runner.js';

export type { ProviderRunnerContext };

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Execute a delegation request.
 *
 * Validates input, resolves aliases, checks disabled status, then
 * routes to the appropriate runner based on config.runnerMode.
 *
 * @param ctx - ExtensionContext (required for provider-call mode).
 *              Pass undefined to force prompt-only fallback.
 */
export async function runDelegation(
  params: DelegateAgentParams,
  cwd: string,
  config: SlimAgentsConfig,
  ctx?: ProviderRunnerContext,
): Promise<DelegationResult> {
  // Validate input format
  if (!isSafeAgentName(params.agent)) {
    const enabled = loadAgents(cwd, config).filter(a => a.enabled);
    const available = enabled.map(a => a.name).join(', ');
    return {
      ok: false,
      prompt: '',
      agentName: params.agent,
      error: `Invalid agent name "${params.agent}". Allowed characters: lowercase letters, numbers, hyphen, underscore. Available: ${available}`,
      runnerMode: 'prompt-only',
      executed: false,
      toolsExecuted: false,
      childSessionStarted: false,
    };
  }

  // Resolve alias to actual agent name
  const agents = loadAgents(cwd, config);
  const resolvedName = resolveAgentName(params.agent, agents);

  if (!resolvedName) {
    const enabled = agents.filter(a => a.enabled);
    const available = enabled.map(a => a.name).join(', ');
    return {
      ok: false,
      prompt: '',
      agentName: params.agent,
      error: `Agent "${params.agent}" not found. Available: ${available}`,
      runnerMode: 'prompt-only',
      executed: false,
      toolsExecuted: false,
      childSessionStarted: false,
    };
  }

  const agent = agents.find(a => a.name === resolvedName)!;

  // Check if agent is enabled
  if (!agent.enabled) {
    const enabled = agents.filter(a => a.enabled);
    const available = enabled.map(a => a.name).join(', ');
    const viaAlias = params.agent !== resolvedName ? ` (via alias "${params.agent}")` : '';
    return {
      ok: false,
      prompt: '',
      agentName: resolvedName,
      error: `Agent "${resolvedName}"${viaAlias} is disabled. To enable, add { "agents": { "${resolvedName}": { "enabled": true } } } to .pi/slim-agents.json. Available enabled agents: ${available}`,
      runnerMode: 'prompt-only',
      executed: false,
      toolsExecuted: false,
      childSessionStarted: false,
    };
  }

  // Route to appropriate runner
  const runnerMode: RunnerMode = config.runnerMode ?? 'prompt-only';

  if (runnerMode === 'provider-call') {
    return runProviderCallOrFallback(agent, params, config, ctx);
  }

  // Default: prompt-only
  const note =
    'Prompt-only delegation: this returns a specialist prompt. ' +
    'No tools were executed. No child agent was started. ' +
    'Use the generated prompt to guide the main agent, or ask the main session to perform the search manually with grep/read/bash.';

  return {
    ok: true,
    prompt: buildDelegationPrompt(agent, params, config),
    agentName: agent.name,
    message: `Delegating to @${agent.name} (${agent.role}). ${agent.readonly ? 'This agent is read-only.' : ''}`,
    runnerMode: 'prompt-only',
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    note,
  };
}

// ─── Provider-call routing ──────────────────────────────────────────

async function runProviderCallOrFallback(
  agent: AgentDefinition,
  params: DelegateAgentParams,
  config: SlimAgentsConfig,
  ctx?: ProviderRunnerContext,
): Promise<DelegationResult> {
  if (!ctx) {
    // No context available — cannot do provider-call, fall back to prompt-only
    const note =
      'Prompt-only fallback: provider-call was requested but no ExtensionContext was available. ' +
      'No tools were executed. No child agent was started. ' +
      'Use the generated prompt to guide the main agent.';

    return {
      ok: true,
      prompt: buildDelegationPrompt(agent, params, config),
      agentName: agent.name,
      message: `Provider-call mode requested but no ExtensionContext available. Returning prompt-only for @${agent.name}.`,
      runnerMode: 'prompt-only',
      executed: false,
      toolsExecuted: false,
      childSessionStarted: false,
      note,
    };
  }

  return runProviderDelegation(agent, params, config, ctx);
}

// ─── Prompt-only output ─────────────────────────────────────────────

/**
 * Format a delegation result for display to the user.
 */
export function formatDelegationResult(result: DelegationResult): string {
  if (!result.ok) {
    return `❌ Delegation failed: ${result.error}`;
  }

  // Provider-call mode with actual output
  if (result.providerOutput) {
    return result.providerOutput;
  }

  // Prompt-only mode — show a clear UX banner so users don't mistake
  // this for an actual search result.
  const bannerLines: string[] = [];

  if (result.runnerMode === 'prompt-only') {
    const isFallback = result.note?.includes('fallback') ?? false;

    bannerLines.push(
      isFallback
        ? '⚠️  Prompt-only (fallback) — no tools were executed'
        : '⚠️  Prompt-only delegation — no tools were executed',
    );
    bannerLines.push(
      '   This is a specialist prompt only. No child agent was started.',
    );
    bannerLines.push(
      '   Use this prompt to guide the main agent, or ask it to perform',
    );
    bannerLines.push(
      '   the search manually with grep/read/bash.',
    );
    bannerLines.push('');
  }

  const lines = [
    `📋 Delegated to @${result.agentName}`,
    result.message ?? '',
    '',
    ...bannerLines,
    '--- Delegation Prompt ---',
    result.prompt,
    '--- End ---',
  ];

  return lines.filter(Boolean).join('\n');
}

// ─── Prompt Builder ─────────────────────────────────────────────────

/**
 * Build a delegation prompt with optional output template.
 *
 * @param config - Used to check outputTemplate setting.
 */
export function buildDelegationPrompt(
  agent: AgentDefinition,
  params: DelegateAgentParams,
  config?: SlimAgentsConfig,
): string {
  const files = params.files ?? [];
  const mode = params.mode ?? 'normal';
  const expectedOutput = buildExpectedOutputSection(
    agent.name,
    agent.readonly,
    config?.outputTemplate,
  );
  const sections = [
    'Agent',
    `@${agent.name}`,
    '',
    'Role',
    agent.role,
    '',
    'Task',
    params.task,
    '',
    'Context',
    params.context?.trim() || '(none)',
    '',
    'Files',
    files.length > 0 ? files.map(file => `- ${file}`).join('\n') : '(none)',
    '',
    'Mode',
    mode,
    '',
    'Instructions',
    agent.body,
    '',
    'Expected Output',
    expectedOutput,
  ];

  return sections.join('\n');
}
