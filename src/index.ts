/**
 * pi-slim-agents — pi-mono Extension Entry Point
 *
 * Registers:
 *   - /agent               — Quick delegation shortcut
 *   - /agents              — List available specialist agents (with subcommands)
 *   - /agents status       — Show runtime status
 *   - /agents reload       — Reload config and agents from disk
 *   - /agents history      — Show recent delegation history
 *   - /agents metrics      — Show delegation metrics
 *   - /agents replay <id>  — Replay a delegation from history
 *   - /agents-status       — Standalone status command (fallback)
 *   - /agents-reload       — Standalone reload command (fallback)
 *   - /agents-history      — Standalone history command (fallback)
 *   - /agents-metrics      — Standalone metrics command (fallback)
 *   - /agents-replay       — Standalone replay command (fallback)
 *   - delegate_agent       — Tool for the LLM to delegate tasks to specialists
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from 'typebox';

import { loadConfig } from './config.js';
import { loadAgents } from './agents.js';
import { formatDelegationResult, type ProviderRunnerContext } from './runner.js';
import { isProviderCallAvailable } from './provider-runner.js';
import { historyStore, type HistoryFilter } from './history.js';
import {
  buildStatusReport,
  formatStatusReport,
  formatHistoryTable,
  formatMetrics,
  formatReloadResult,
  performReload,
} from './status.js';
import {
  parseAgentCommand,
  buildAgentHelpText,
  buildAvailableAgentsList,
  runAndRecordDelegation,
  replayDelegation,
  parseReplayArgs,
  parseFlags,
} from './commands.js';
import type { DelegateAgentParams, RunnerMode, SlimAgentsConfig } from './types.js';

// ─── Extension Factory ──────────────────────────────────────────────

export default function slimAgentsExtension(pi: ExtensionAPI): void {
  // ── Session state ─────────────────────────────────────────────────

  let config: SlimAgentsConfig = {};
  let cwd = process.cwd();
  let lastReloadTime: string | null = null;
  let providerCallStatus: { available: boolean; error?: string } | null = null;

  // ── Session lifecycle ─────────────────────────────────────────────

  pi.on('session_start', async (_event, ctx) => {
    cwd = ctx.cwd;
    config = loadConfig(cwd);
    providerCallStatus = await isProviderCallAvailable();
    lastReloadTime = new Date().toISOString();

    historyStore.init(cwd, config.history);

    const agents = loadAgents(cwd, config);
    ctx.ui.setStatus('slim-agents', `agents: ${agents.length}`);
  });

  // ── Subcommand handlers ───────────────────────────────────────────

  /* eslint-disable @typescript-eslint/no-explicit-any */
  async function handleStatus(ctx: any) {
    const report = buildStatusReport({
      cwd,
      config,
      providerCallStatus,
      lastReloadTime,
      delegationCount: historyStore.count(),
    });
    ctx.ui.notify(formatStatusReport(report), 'info');
  }

  async function handleReload(ctx: any) {
    const result = performReload(cwd);
    const reloadTime = new Date().toISOString();

    if (result.ok) {
      config = result.config;
      lastReloadTime = reloadTime;
      providerCallStatus = await isProviderCallAvailable();
    }

    ctx.ui.notify(formatReloadResult(result, reloadTime), result.ok ? 'info' : 'error');
  }

  async function handleHistory(args: string, ctx: any) {
    const { flags } = parseFlags(args);
    const hasFilters = Object.keys(flags).length > 0;

    let records;

    if (!hasFilters) {
      records = historyStore.recent(10);
    } else {
      const filter: HistoryFilter = {};
      if (flags.agent) filter.agent = flags.agent;
      if (flags.status && ['success', 'fallback', 'error'].includes(flags.status)) {
        filter.status = flags.status as 'success' | 'fallback' | 'error';
      }
      if (flags.runner && ['prompt-only', 'provider-call'].includes(flags.runner)) {
        filter.runnerMode = flags.runner as RunnerMode;
      }
      if (flags.mode && ['quick', 'normal', 'deep'].includes(flags.mode)) {
        filter.mode = flags.mode;
      }
      if (flags.limit) {
        const limit = parseInt(flags.limit, 10);
        if (!isNaN(limit) && limit > 0) filter.limit = limit;
      }
      if (flags.query) filter.query = flags.query;

      records = historyStore.filter(filter);
    }

    if (records.length === 0) {
      const hint = hasFilters
        ? 'No records match the filter criteria.'
        : 'No delegations recorded yet.';
      ctx.ui.notify(`# Delegation History\n\n${hint}`, 'info');
      return;
    }

    ctx.ui.notify(formatHistoryTable(records), 'info');
  }

  async function handleMetrics(ctx: any) {
    const metrics = historyStore.metrics();
    ctx.ui.notify(formatMetrics(metrics), 'info');
  }

  async function handleList(ctx: any) {
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
        lines.push(
          `  (enable: add { "agents": { "${agent.name}": { "enabled": true } } } to .pi/slim-agents.json)`,
        );
      }
    }

    ctx.ui.notify(lines.join('\n'), 'info');
  }

  // ── Replay handler ───────────────────────────────────────────────

  async function handleReplay(args: string, ctx: any) {
    const parsed = parseReplayArgs(args);

    if (parsed.error) {
      ctx.ui.notify(`❌ ${parsed.error}`, 'error');
      return;
    }

    if (parsed.id === null) {
      const ids = historyStore.allIds();
      const idsStr = ids.length > 0
        ? `Available IDs: ${ids.join(', ')}`
        : 'No history records available.';
      ctx.ui.notify(
        `Usage: /agents replay <id> [--mode <mode>] [--agent <agent>] [--task <task>] [--context <ctx>] [--files <f1,f2>]\n${idsStr}`,
        'warning',
      );
      return;
    }

    config = loadConfig(cwd);

    const hasOverrides = Object.keys(parsed.overrides).length > 0;
    const replayResult = await replayDelegation(
      parsed.id,
      cwd,
      config,
      providerCallStatus?.available ?? false,
      undefined,
      hasOverrides ? parsed.overrides : undefined,
    );

    if (!replayResult.ok) {
      ctx.ui.notify(`❌ Replay failed: ${replayResult.error}`, 'error');
      return;
    }

    const lines: string[] = [`🔄 Replay of history #${parsed.id}`];

    if (replayResult.originalAgent && replayResult.newAgent && replayResult.originalAgent !== replayResult.newAgent) {
      lines.push(`   Original agent: @${replayResult.originalAgent}`);
      lines.push(`   New agent: @${replayResult.newAgent}`);
    }

    if (replayResult.modifications && replayResult.modifications.length > 0) {
      lines.push('', 'Modified fields:');
      for (const mod of replayResult.modifications) {
        lines.push(`  - ${mod}`);
      }
    }

    if (replayResult.aliasDriftWarning) {
      lines.push('', replayResult.aliasDriftWarning);
    }

    lines.push('', formatDelegationResult(replayResult.result!));

    ctx.ui.notify(lines.join('\n'), 'info');
  }

  // ── Export history handler ────────────────────────────────────────

  async function handleExportHistory(args: string, ctx: any) {
    const { flags } = parseFlags(args);

    const filter: HistoryFilter = {};
    if (flags.agent) filter.agent = flags.agent;
    if (flags.status && ['success', 'fallback', 'error'].includes(flags.status)) {
      filter.status = flags.status as 'success' | 'fallback' | 'error';
    }
    if (flags.runner && ['prompt-only', 'provider-call'].includes(flags.runner)) {
      filter.runnerMode = flags.runner as RunnerMode;
    }
    if (flags.mode && ['quick', 'normal', 'deep'].includes(flags.mode)) {
      filter.mode = flags.mode;
    }
    if (flags.limit) {
      const limit = parseInt(flags.limit, 10);
      if (!isNaN(limit) && limit > 0) filter.limit = limit;
    }
    if (flags.query) filter.query = flags.query;

    const json = historyStore.exportJson(Object.keys(filter).length > 0 ? filter : undefined);
    ctx.ui.notify(json, 'info');
  }

  // ── /agents command with subcommand dispatch ──────────────────────

  const KNOWN_SUBCOMMANDS = ['status', 'reload', 'history', 'metrics', 'replay', 'export-history'];

  pi.registerCommand('agents', {
    description: 'List agents. Subcommands: status, reload, history, metrics, replay, export-history',
    handler: async (args, ctx) => {
      const rawArgs = (args ?? '').trim();
      // Check if first word is a subcommand
      const firstWord = rawArgs.split(/\s+/)[0]?.toLowerCase() ?? '';

      if (!rawArgs) {
        return handleList(ctx);
      }

      switch (firstWord) {
        case 'status':
          return handleStatus(ctx);
        case 'reload':
          return handleReload(ctx);
        case 'history':
          return handleHistory(rawArgs.slice('history'.length), ctx);
        case 'metrics':
          return handleMetrics(ctx);
        case 'replay':
          return handleReplay(rawArgs.slice('replay'.length), ctx);
        case 'export-history':
          return handleExportHistory(rawArgs.slice('export-history'.length), ctx);
        default:
          ctx.ui.notify(
            `Unknown subcommand "${firstWord}". Available: ${KNOWN_SUBCOMMANDS.join(', ')}`,
            'warning',
          );
      }
    },
  });

  // ── Standalone fallback commands ──────────────────────────────────

  pi.registerCommand('agents-status', {
    description: 'Show slim-agents runtime status',
    handler: async (_args, ctx) => handleStatus(ctx),
  });

  pi.registerCommand('agents-reload', {
    description: 'Reload slim-agents configuration and agents',
    handler: async (_args, ctx) => handleReload(ctx),
  });

  pi.registerCommand('agents-history', {
    description: 'Show recent delegation history (supports filters)',
    handler: async (args, ctx) => handleHistory(args ?? '', ctx),
  });

  pi.registerCommand('agents-metrics', {
    description: 'Show delegation metrics',
    handler: async (_args, ctx) => handleMetrics(ctx),
  });

  pi.registerCommand('agents-replay', {
    description: 'Replay a delegation from history by ID',
    handler: async (args, ctx) => handleReplay(args ?? '', ctx),
  });

  pi.registerCommand('agents-history-export', {
    description: 'Export delegation history as JSON',
    handler: async (args, ctx) => handleExportHistory(args ?? '', ctx),
  });

  // ── /agent shortcut command ─────────────────────────────────────

  pi.registerCommand('agent', {
    description: 'Quick delegation: /agent [--mode <mode>] <agent-or-alias> <task...>',
    handler: async (args, ctx) => {
      const { agent: agentName, task, mode, modeError } = parseAgentCommand(args ?? '');

      if (modeError) {
        ctx.ui.notify(`❌ ${modeError}`, 'error');
        return;
      }

      if (!agentName) {
        ctx.ui.notify(buildAgentHelpText(), 'info');
        return;
      }

      if (!task) {
        ctx.ui.notify(buildAgentHelpText(), 'info');
        return;
      }

      // Refresh config
      config = loadConfig(cwd);

      // Validate agent exists before running
      const allAgents = loadAgents(cwd, config);
      const { resolveAgentName } = await import('./agents.js');
      const resolvedName = resolveAgentName(agentName, allAgents);

      if (!resolvedName) {
        ctx.ui.notify(
          `❌ Agent "${agentName}" not found.\n\n${buildAvailableAgentsList(cwd, config)}`,
          'error',
        );
        return;
      }

      const agent = allAgents.find(a => a.name === resolvedName);
      if (agent && !agent.enabled) {
        const viaAlias = agentName !== resolvedName ? ` (via alias "${agentName}")` : '';
        ctx.ui.notify(
          `❌ Agent "${resolvedName}"${viaAlias} is disabled. Enable it in .pi/slim-agents.json.\n\n${buildAvailableAgentsList(cwd, config)}`,
          'error',
        );
        return;
      }

      // Run delegation
      const result = await runAndRecordDelegation(
        { agent: agentName, task, mode },
        cwd,
        config,
        providerCallStatus?.available ?? false,
      );

      if (!result.ok) {
        ctx.ui.notify(`❌ ${result.error}`, 'error');
        return;
      }

      const output = result.providerOutput ?? result.prompt;
      ctx.ui.notify(output, 'info');
    },
  });

  // ── Lightweight routing hint injection ─────────────────────────────

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
        Type.Union([Type.Literal('quick'), Type.Literal('normal'), Type.Literal('deep')], {
          description: 'Delegation mode: quick, normal (default), or deep',
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { agent: agentName, task, context, files, mode } = params as DelegateAgentParams;

      // Refresh config
      config = loadConfig(cwd);

      // Build provider-runner context
      const providerCtx: ProviderRunnerContext | undefined = ctx
        ? {
            model: ctx.model as ProviderRunnerContext['model'],
            modelRegistry: ctx.modelRegistry as ProviderRunnerContext['modelRegistry'],
          }
        : undefined;

      // Run delegation and record history
      const result = await runAndRecordDelegation(
        { agent: agentName, task, context, files, mode },
        cwd,
        config,
        providerCallStatus?.available ?? false,
        providerCtx,
      );

      // Return result
      if (!result.ok) {
        return {
          content: [{ type: 'text', text: `❌ ${result.error}` }],
          details: { error: result.error },
        };
      }

      const output = result.providerOutput ?? result.prompt;

      return {
        content: [{ type: 'text', text: output }],
        details: {
          agent: result.agentName,
          delegated: true,
          meta: result.meta,
        },
      };
    },
  });
}
