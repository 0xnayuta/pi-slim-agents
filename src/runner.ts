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
import { getAgent, loadAgents } from './agents.js';
import { truncate } from './utils.js';

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
  // Resolve agent
  const agent = getAgent(params.agent, cwd, config);
  if (!agent) {
    const available = loadAgents(cwd, config).map(a => a.name).join(', ');
    return {
      ok: false,
      prompt: '',
      agentName: params.agent,
      error: `Agent "${params.agent}" not found. Available: ${available}`,
    };
  }

  // Build delegation prompt
  const prompt = buildDelegationPrompt(agent, params);

  return {
    ok: true,
    prompt,
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
    truncate(result.prompt, 2000),
    '--- End ---',
  ];

  return lines.filter(Boolean).join('\n');
}

// ─── Prompt Builder ─────────────────────────────────────────────────

function buildDelegationPrompt(
  agent: AgentDefinition,
  params: DelegateAgentParams,
): string {
  const sections: string[] = [];

  // Agent identity
  sections.push(`<delegation>`);
  sections.push(`<agent name="${agent.name}" role="${agent.role}" />`);
  sections.push('');

  // System prompt
  sections.push(`<system-prompt>`);
  sections.push(agent.prompt);
  sections.push('</system-prompt>');
  sections.push('');

  // Task
  sections.push(`<task>`);
  sections.push(params.task);
  sections.push('</task>');

  // Context
  if (params.context) {
    sections.push('');
    sections.push('<context>');
    sections.push(params.context);
    sections.push('</context>');
  }

  // Files
  if (params.files && params.files.length > 0) {
    sections.push('');
    sections.push('<relevant-files>');
    for (const f of params.files) {
      sections.push(`- ${f}`);
    }
    sections.push('</relevant-files>');
  }

  // Mode
  if (params.mode && params.mode !== 'auto') {
    sections.push('');
    sections.push(`<mode>${params.mode}</mode>`);
  }

  // Readonly instruction
  if (agent.readonly) {
    sections.push('');
    sections.push('<constraint>READ-ONLY: Do not modify files. Only search, analyze, and advise.</constraint>');
  }

  sections.push('</delegation>');

  return sections.join('\n');
}
