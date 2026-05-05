/**
 * pi-slim-agents — pi-mono Extension Entry Point
 *
 * Registers:
 *   - /agents           — List available specialist agents
 *   - delegate_agent    — Tool for the LLM to delegate tasks to specialists
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';

import { loadConfig } from './config.js';
import { loadAgents } from './agents.js';
import { runDelegation } from './runner.js';
import type { DelegateAgentParams, SlimAgentsConfig } from './types.js';

// ─── Extension Factory ──────────────────────────────────────────────

export default function slimAgentsExtension(pi: ExtensionAPI): void {
  // Cache config per session
  let config: SlimAgentsConfig = {};
  let cwd = process.cwd();

  // ── Session lifecycle ─────────────────────────────────────────────

  pi.on('session_start', async (_event, ctx) => {
    cwd = ctx.cwd;
    config = loadConfig(cwd);

    const agents = loadAgents(cwd, config);
    ctx.ui.setStatus(
      'slim-agents',
      `agents: ${agents.length}`,
    );
  });

  // ── /agents command ───────────────────────────────────────────────

  pi.registerCommand('agents', {
    description: 'List available specialist agents',
    handler: async (_args, ctx) => {
      const allAgents = loadAgents(cwd, config);
      const enabled = allAgents.filter(a => a.enabled);
      const disabled = allAgents.filter(a => !a.enabled);

      if (enabled.length === 0 && disabled.length === 0) {
        ctx.ui.notify('No agents found. Add .md files to agents/ directories.', 'warning');
        return;
      }

      const lines: string[] = ['# Available Agents', ''];

      for (const agent of enabled) {
        lines.push(`- @${agent.name} — ${agent.description} — readonly: ${agent.readonly ? 'yes' : 'no'}`);
        if (agent.aliases.length > 0) {
          lines.push(`  aliases: ${agent.aliases.join(', ')}`);
        }
      }

      if (disabled.length > 0) {
        lines.push('', '# Disabled Agents', '');
        for (const agent of disabled) {
          lines.push(`- @${agent.name} — ${agent.description}`);
          lines.push(`  (enable: add { "agents": { "${agent.name}": { "enabled": true } } } to .pi/slim-agents.json)`);
        }
      }

      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });

  // ── Lightweight routing hint injection ───────────────────────────

  pi.on('before_agent_start', async event => ({
    systemPrompt: `${event.systemPrompt}\n\nSlim agents routing hints: explorer=code location search; librarian=external docs/library research; oracle=architecture judgment/review; fixer=small bounded implementation; designer=UI/UX and interaction review. Use delegate_agent only when the specialist prompt helps.`,
  }));

  // ── delegate_agent tool ───────────────────────────────────────────

  pi.registerTool({
    name: 'delegate_agent',
    label: 'Delegate to Agent',
    description:
      'Delegate a task to a specialist agent. The agent receives the task, context, and relevant files, then returns structured guidance or results.',
    promptSnippet:
      'Delegate tasks to specialist agents (explorer, librarian, oracle, fixer, etc.) for focused expert work',
    promptGuidelines: [
      'Use delegate_agent when a specialist agent can handle a subtask better than the main agent.',
      'Common delegations: explorer for codebase search, librarian for docs research, oracle for architecture review, fixer for bounded implementation.',
      'Provide clear task descriptions and relevant file paths for best results.',
      'After receiving delegation results, integrate the findings into your response.',
    ],
    parameters: Type.Object({
      agent: Type.String({
        description: 'Agent name to delegate to (e.g. explorer, librarian, oracle, fixer)',
      }),
      task: Type.String({
        description: 'Clear description of the task for the specialist agent',
      }),
      context: Type.Optional(
        Type.String({
          description: 'Additional context the agent needs (file contents, error messages, etc.)',
        }),
      ),
      files: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Relevant file paths the agent should examine',
        }),
      ),
      mode: Type.Optional(
        Type.Union([
          Type.Literal('quick'),
          Type.Literal('normal'),
          Type.Literal('deep'),
        ], {
          description: 'Delegation mode: quick, normal (default), or deep',
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { agent: agentName, task, context, files, mode } = params as DelegateAgentParams;

      // Refresh config in case it changed
      config = loadConfig(cwd);

      const result = runDelegation(
        { agent: agentName, task, context, files, mode },
        cwd,
        config,
      );

      if (!result.ok) {
        return {
          content: [{ type: 'text', text: `❌ ${result.error}` }],
          details: { error: result.error },
        };
      }

      // v1 prompt-only runner: return the structured delegation prompt.
      return {
        content: [{ type: 'text', text: result.prompt }],
        details: {
          agent: result.agentName,
          delegated: true,
        },
      };
    },
  });
}
