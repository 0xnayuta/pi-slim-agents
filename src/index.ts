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
import { runDelegation, formatDelegationResult } from './runner.js';
import type { DelegateAgentParams, SlimAgentsConfig } from './types.js';
import { indent } from './utils.js';

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
      const agents = loadAgents(cwd, config);

      if (agents.length === 0) {
        ctx.ui.notify('No agents found. Add .md files to agents/ directories.', 'warning');
        return;
      }

      const lines: string[] = ['# Available Agents', ''];

      for (const agent of agents) {
        const tags = agent.tags.length > 0 ? ` [${agent.tags.join(', ')}]` : '';
        const ro = agent.readonly ? ' (read-only)' : '';
        lines.push(`## @${agent.name}${ro}${tags}`);
        lines.push(agent.description);
        if (agent.sourcePath) {
          lines.push(`  _Source: ${agent.sourcePath}_`);
        }
        lines.push('');
      }

      ctx.ui.notify(lines.join('\n'), 'info');
    },
  });

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
        Type.String({
          description: 'Delegation mode: auto (default), focus (single-task), review (read-only analysis)',
          enum: ['auto', 'focus', 'review'],
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

      // Return the delegation prompt as tool result.
      // The main LLM reads this and executes the specialist's task.
      const output = [
        result.message,
        '',
        result.prompt,
        '',
        `---`,
        `Instructions: Adopt the role described in <system-prompt> above. Complete the task in <task>. Follow all constraints. Report results clearly.`,
      ].join('\n');

      return {
        content: [{ type: 'text', text: output }],
        details: {
          agent: result.agentName,
          delegated: true,
        },
      };
    },
  });
}
