/**
 * Delegation runner for pi-slim-agents.
 *
 * v1: Returns a structured delegation prompt that the main agent can use
 * to adopt the specialist's role. This is the "prompt-based delegation" approach.
 *
 * TODO(v2): Integrate with pi-mono child session / provider call API when available.
 *   - Create an independent model call with the specialist's system prompt
 *   - Stream results back to the main session
 *   - Support parallel delegation for multiple agents
 */

import type {
  AgentDefinition,
  DelegationResult,
  DelegateAgentParams,
  SlimAgentsConfig,
} from './types.js';
import { loadAgents, resolveAgentName } from './agents.js';
import { isSafeAgentName } from './utils.js';

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Execute a delegation request.
 *
 * In v1, this builds a structured delegation prompt that tells the main
 * agent to adopt the specialist's role and complete the task.
 */
export function runDelegation(
  params: DelegateAgentParams,
  cwd: string,
  config: SlimAgentsConfig,
): DelegationResult {
  // Validate input format
  if (!isSafeAgentName(params.agent)) {
    const enabled = loadAgents(cwd, config).filter(a => a.enabled);
    const available = enabled.map(a => a.name).join(', ');
    return {
      ok: false,
      prompt: '',
      agentName: params.agent,
      error: `Invalid agent name "${params.agent}". Allowed characters: lowercase letters, numbers, hyphen, underscore. Available: ${available}`,
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
    };
  }

  return {
    ok: true,
    prompt: buildDelegationPrompt(agent, params),
    agentName: agent.name,
    message: `Delegating to @${agent.name} (${agent.role}). ${agent.readonly ? 'This agent is read-only.' : ''}`,
  };
}

/**
 * Format a delegation result for display to the user.
 */
export function formatDelegationResult(result: DelegationResult): string {
  if (!result.ok) {
    return `❌ Delegation failed: ${result.error}`;
  }

  const lines = [
    `📋 Delegated to @${result.agentName}`,
    result.message ?? '',
    '',
    '--- Delegation Prompt ---',
    result.prompt,
    '--- End ---',
  ];

  return lines.filter(Boolean).join('\n');
}

// ─── Prompt Builder ─────────────────────────────────────────────────

function buildDelegationPrompt(
  agent: AgentDefinition,
  params: DelegateAgentParams,
): string {
  const files = params.files ?? [];
  const mode = params.mode ?? 'normal';
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
    agent.readonly
      ? 'Search, analyze, and report clearly. Do not modify files.'
      : 'Complete the task and report concise, actionable results.',
  ];

  return sections.join('\n');
}
