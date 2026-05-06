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
  filterAgents,
  filterTemplates,
  formatAgentList,
  formatTemplateList,
  type AgentFilter,
  type TemplateFilter,
  type FilterableTemplate,
} from './commands.js';
import {
  loadTemplates,
  createAgentFromTemplate,
  validateAgents,
  formatTemplatesList,
  formatValidationResult,
} from './templates.js';
import {
  parseFormatOption,
  parseRegexOption,
  formatAgentsJson,
  formatTemplatesJson,
  formatTemplatesJsonFull,
  formatStatusJson,
  formatHistoryJson,
  formatMetricsJson,
  formatValidationJson,
  formatAgentResultJson,
  formatErrorJson,
  serializeAgentFilters,
  serializeTemplateFilters,
} from './format.js';
import type { DelegateAgentParams, RunnerMode, SlimAgentsConfig } from './types.js';
import { sanitizeErrorMessage } from './security.js';
import * as fs from 'node:fs';

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
  async function handleStatus(args: string, ctx: any) {
    const { flags } = parseFlags(args);
    const { format, error: formatError } = parseFormatOption(flags);

    if (formatError) {
      ctx.ui.notify(`❌ ${formatError}`, 'error');
      return;
    }

    const report = buildStatusReport({
      cwd,
      config,
      providerCallStatus,
      lastReloadTime,
      delegationCount: historyStore.count(),
    });

    if (format === 'json') {
      const loadedPaths: string[] = [];
      if (fs.existsSync(report.config.projectPath)) loadedPaths.push(report.config.projectPath);
      if (fs.existsSync(report.config.userPath)) loadedPaths.push(report.config.userPath);
      ctx.ui.notify(formatStatusJson(report, loadedPaths), 'info');
      return;
    }

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
    const { format, error: formatError } = parseFormatOption(flags);

    if (formatError) {
      ctx.ui.notify(`❌ ${formatError}`, 'error');
      return;
    }

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

    const hasFilters = Object.keys(flags).some(k => k !== 'format');
    let records;

    if (!hasFilters) {
      records = historyStore.recent(10);
    } else {
      records = historyStore.filter(filter);
    }

    if (records.length === 0) {
      const hint = hasFilters
        ? 'No records match the filter criteria.'
        : 'No delegations recorded yet.';
      ctx.ui.notify(`# Delegation History\n\n${hint}`, 'info');
      return;
    }

    if (format === 'json') {
      ctx.ui.notify(formatHistoryJson(records, hasFilters ? filter : undefined), 'info');
      return;
    }

    ctx.ui.notify(formatHistoryTable(records), 'info');
  }

  async function handleMetrics(args: string, ctx: any) {
    const { flags } = parseFlags(args);
    const { format, error: formatError } = parseFormatOption(flags);

    if (formatError) {
      ctx.ui.notify(`❌ ${formatError}`, 'error');
      return;
    }

    const metrics = historyStore.metrics();

    if (format === 'json') {
      ctx.ui.notify(formatMetricsJson(metrics), 'info');
      return;
    }

    ctx.ui.notify(formatMetrics(metrics), 'info');
  }

  async function handleList(args: string, ctx: any) {
    const { flags } = parseFlags(args);
    const { format, error: formatError } = parseFormatOption(flags);

    if (formatError) {
      ctx.ui.notify(`❌ ${formatError}`, 'error');
      return;
    }

    const { regex, error: regexError } = parseRegexOption(flags);
    if (regexError) {
      ctx.ui.notify(`❌ ${regexError}`, 'error');
      return;
    }

    const allAgents = loadAgents(cwd, config);

    // Build filter from flags
    const filter: AgentFilter & { regex?: RegExp | null } = {
      regex,
    };
    if (flags.tag) {
      filter.tags = Array.isArray(flags.tag) ? flags.tag : [flags.tag];
    }
    if (flags.query) filter.query = flags.query;
    if (flags.readonly !== undefined) filter.readonly = true;
    if (flags.writable !== undefined) filter.writable = true;
    if (flags.enabled !== undefined) filter.enabled = true;
    if (flags.disabled !== undefined) filter.disabled = true;
    if (flags.source) {
      const src = flags.source as 'builtin' | 'user' | 'project';
      if (['builtin', 'user', 'project'].includes(src)) filter.source = src;
    }

    const hasFilters = Object.keys(flags).some(k => k !== 'format');

    if (format === 'json') {
      const filtered = filterAgents(allAgents, filter);
      ctx.ui.notify(formatAgentsJson(filtered, filter), 'info');
      return;
    }

    if (hasFilters) {
      // Show only enabled agents in filtered view, with disabled section separate
      const filtered = filterAgents(allAgents, filter);
      const enabledFiltered = filtered.filter(a => a.enabled);
      const disabledFiltered = filtered.filter(a => !a.enabled);

      if (enabledFiltered.length === 0 && disabledFiltered.length === 0) {
        const msg = formatAgentList([], filter);
        ctx.ui.notify(`${msg}\n\nUse /agents without filters to see all agents.`, 'info');
        return;
      }

      const lines: string[] = ['# Available Agents', ''];
      lines.push(formatAgentList(enabledFiltered, filter));

      if (disabledFiltered.length > 0) {
        lines.push('', '# Disabled Agents');
        lines.push(formatAgentList(disabledFiltered, filter).split('\n').map(l => '  ' + l).join('\n'));
      }

      lines.push('', `Showing ${filtered.length} agent${filtered.length === 1 ? '' : 's'}. Use /agents without filters to see all.`);
      ctx.ui.notify(lines.join('\n'), 'info');
      return;
    }

    // Default: no filters — show all agents
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
      if (agent.tags.length > 0) {
        lines.push(`  tags: ${agent.tags.slice(0, 8).join(', ')}`);
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

  // ── Templates handler ────────────────────────────────────────────

  async function handleTemplates(args: string, ctx: any) {
    const { flags } = parseFlags(args);
    const { format, error: formatError } = parseFormatOption(flags);

    if (formatError) {
      ctx.ui.notify(`❌ ${formatError}`, 'error');
      return;
    }

    const { regex, error: regexError } = parseRegexOption(flags);
    if (regexError) {
      ctx.ui.notify(`❌ ${regexError}`, 'error');
      return;
    }

    const result = loadTemplates();

    if (!result.ok) {
      ctx.ui.notify(`❌ Failed to load templates: ${result.error}`, 'error');
      return;
    }

    if (result.templates.length === 0) {
      ctx.ui.notify('No templates found.', 'warning');
      return;
    }

    // Build template filter from flags
    const filter: TemplateFilter & { regex?: RegExp | null } = {
      regex,
    };
    if (flags.tag) {
      filter.tags = Array.isArray(flags.tag) ? flags.tag : [flags.tag];
    }
    if (flags.query) filter.query = flags.query;
    if (flags.readonly !== undefined) filter.readonly = true;
    if (flags.writable !== undefined) filter.writable = true;

    const hasFilters = Object.keys(flags).some(k => k !== 'format');

    const asFilterable: FilterableTemplate[] = result.templates.map(t => ({
      name: t.name,
      description: t.description,
      readonly: t.readonly,
      aliases: t.aliases,
      tags: t.tags,
      recommendedMode: t.recommendedMode,
    }));

    if (format === 'json') {
      const filtered = filterTemplates(asFilterable, filter);
      // Map back to full template info for metadata
      const filteredWithMetadata = result.templates.filter(t =>
        filtered.some(f => f.name === t.name),
      );
      ctx.ui.notify(formatTemplatesJsonFull(filteredWithMetadata, filter), 'info');
      return;
    }

    if (hasFilters) {
      const filtered = filterTemplates(asFilterable, filter);
      const lines: string[] = ['# Agent Templates'];
      lines.push(`Filtered: ${filtered.length} of ${result.templates.length} templates`);
      lines.push('');
      lines.push(formatTemplateList(filtered, filter));
      lines.push('');
      lines.push('Use /agents templates without filters to see all templates.');
      ctx.ui.notify(lines.join('\n'), 'info');
      return;
    }

    ctx.ui.notify(formatTemplatesList(result.templates), 'info');
  }


  // ── Create handler ────────────────────────────────────────────────

  async function handleCreate(args: string, ctx: any) {
    const { flags, positional } = parseFlags(args);


    if (positional.length < 2) {
      ctx.ui.notify(
        'Usage: /agents create <template-name> <agent-name> [--force]\n\n' +
        'Examples:\n' +
        '  /agents create security-reviewer security\n' +
        '  /agents create cpp-reviewer cpp-reviewer\n' +
        '  /agents create test-writer test-writer\n\n' +
        'Use /agents templates to see available templates.',
        'warning',
      );
      return;
    }


    const [templateName, agentName] = positional;
    const force = flags.force === 'true';


    config = loadConfig(cwd);
    const result = createAgentFromTemplate(templateName, agentName, cwd, force);


    if (!result.ok) {
      ctx.ui.notify(`❌ Create failed: ${result.error}`, 'error');
      return;
    }


    const lines: string[] = [`✅ Agent created: ${agentName}`];
    lines.push(`   File: ${result.displayPath ?? result.filePath}`);

    if (result.warnings && result.warnings.length > 0) {
      lines.push('', 'Warnings:');
      for (const w of result.warnings) {
        lines.push(`  - ${w}`);
      }
    }
    lines.push('', 'Run /agents reload to activate the new agent.');
    ctx.ui.notify(lines.join('\n'), 'info');
  }


  // ── Validate handler ───────────────────────────────────────────────

  async function handleValidate(args: string, ctx: any) {
    const { flags } = parseFlags(args);
    const { format, error: formatError } = parseFormatOption(flags);

    if (formatError) {
      ctx.ui.notify(`❌ ${formatError}`, 'error');
      return;
    }

    config = loadConfig(cwd);
    const result = validateAgents(cwd);

    if (format === 'json') {
      ctx.ui.notify(formatValidationJson(result), 'info');
      return;
    }

    ctx.ui.notify(formatValidationResult(result), 'info');
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

  const KNOWN_SUBCOMMANDS = ['status', 'reload', 'history', 'metrics', 'replay', 'export-history', 'templates', 'create', 'validate'];

  pi.registerCommand('agents', {
    description: 'List agents. Subcommands: status, reload, history, metrics, replay, export-history',
    handler: async (args, ctx) => {
      const rawArgs = (args ?? '').trim();
      // Check if first word is a subcommand
      const firstWord = rawArgs.split(/\s+/)[0]?.toLowerCase() ?? '';

      if (!rawArgs) {
        return handleList('', ctx);
      }

      switch (firstWord) {
        case 'status':
          return handleStatus(rawArgs.slice('status'.length), ctx);
        case 'reload':
          return handleReload(ctx);
        case 'history':
          return handleHistory(rawArgs.slice('history'.length), ctx);
        case 'metrics':
          return handleMetrics(rawArgs.slice('metrics'.length), ctx);
        case 'replay':
          return handleReplay(rawArgs.slice('replay'.length), ctx);
        case 'export-history':
          return handleExportHistory(rawArgs.slice('export-history'.length), ctx);
        case 'templates':
          return handleTemplates(rawArgs.slice('templates'.length), ctx);
        case 'create':
          return handleCreate(rawArgs.slice('create'.length), ctx);
        case 'validate':
          return handleValidate(rawArgs.slice('validate'.length), ctx);
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
    handler: async (args, ctx) => handleStatus(args ?? '', ctx),
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
    handler: async (args, ctx) => handleMetrics(args ?? '', ctx),
  });

  pi.registerCommand('agents-replay', {
    description: 'Replay a delegation from history by ID',
    handler: async (args, ctx) => handleReplay(args ?? '', ctx),
  });

  pi.registerCommand('agents-history-export', {
    description: 'Export delegation history as JSON',
    handler: async (args, ctx) => handleExportHistory(args ?? '', ctx),
  });

  pi.registerCommand('agents-templates', {
    description: 'List available agent templates',
    handler: async (args, ctx) => handleTemplates(args ?? '', ctx),
  });

  pi.registerCommand('agents-create', {
    description: 'Create a project-level agent from a template: /agents-create <template> <agent> [--force]',
    handler: async (args, ctx) => handleCreate(args ?? '', ctx),
  });

  pi.registerCommand('agents-validate', {
    description: 'Validate all agent files',
    handler: async (args, ctx) => handleValidate(args ?? '', ctx),
  });

  // ── /agent shortcut command ─────────────────────────────────────

  pi.registerCommand('agent', {
    description: 'Quick delegation: /agent [--mode <mode>] [--format <format>] <agent-or-alias> <task...>',
    handler: async (args, ctx) => {
      // Parse format flag from args (before parseAgentCommand)
      const { flags, positional } = parseFlags(args ?? '');
      const { format, error: formatError } = parseFormatOption(flags);

      if (formatError && format === 'json') {
        ctx.ui.notify(formatErrorJson('INVALID_FORMAT', formatError), 'error');
        return;
      }

      const reconstructedArgs = positional.join(' ');
      const { agent: agentName, task, mode, modeError } = parseAgentCommand(reconstructedArgs);

      if (modeError) {
        if (format === 'json') {
          ctx.ui.notify(formatErrorJson('INVALID_MODE', modeError), 'error');
          return;
        }
        ctx.ui.notify(`❌ ${modeError}`, 'error');
        return;
      }

      if (!agentName) {
        if (format === 'json') {
          ctx.ui.notify(
            formatErrorJson('MISSING_AGENT', 'Usage: /agent [--mode <mode>] [--format <format>] <agent-or-alias> <task...>'),
            'error',
          );
          return;
        }
        ctx.ui.notify(buildAgentHelpText(), 'info');
        return;
      }

      if (!task) {
        if (format === 'json') {
          ctx.ui.notify(
            formatErrorJson('MISSING_TASK', `Usage: /agent [--mode <mode>] [--format <format>] <agent-or-alias> <task...>. Missing task for agent "${agentName}".`),
            'error',
          );
          return;
        }
        ctx.ui.notify(buildAgentHelpText(), 'info');
        return;
      }

      // Refresh config
      config = loadConfig(cwd);

      // Validate agent exists before running
      const allAgents = loadAgents(cwd, config);
      const { resolveAgentName } = await import('./agents.js');
      const resolvedName = resolveAgentName(agentName, allAgents);
      const aliasUsed = agentName !== resolvedName && resolvedName !== null;
      const availableAgentNames = allAgents.filter(a => a.enabled).map(a => a.name);

      if (!resolvedName) {
        if (format === 'json') {
          ctx.ui.notify(
            formatAgentResultJson({
              requestedAgent: agentName,
              resolvedAgent: agentName,
              aliasUsed: false,
              mode: mode ?? 'normal',
              runnerMode: config.runnerMode ?? 'prompt-only',
              status: 'error',
              durationMs: 0,
              historyId: null,
              executed: false,
              toolsExecuted: false,
              childSessionStarted: false,
              providerCallAvailable: providerCallStatus?.available ?? false,
              error: `Agent "${agentName}" not found.`,
              availableAgents: availableAgentNames,
            }),
            'error',
          );
          return;
        }
        ctx.ui.notify(
          `❌ Agent "${agentName}" not found.\n\n${buildAvailableAgentsList(cwd, config)}`,
          'error',
        );
        return;
      }

      const agent = allAgents.find(a => a.name === resolvedName);
      if (agent && !agent.enabled) {
        if (format === 'json') {
          ctx.ui.notify(
            formatAgentResultJson({
              requestedAgent: agentName,
              resolvedAgent: resolvedName,
              aliasUsed,
              mode: mode ?? 'normal',
              runnerMode: config.runnerMode ?? 'prompt-only',
              status: 'error',
              durationMs: 0,
              historyId: null,
              executed: false,
              toolsExecuted: false,
              childSessionStarted: false,
              providerCallAvailable: providerCallStatus?.available ?? false,
              error: `Agent "${resolvedName}" is disabled. Enable it in .pi/slim-agents.json.`,
              availableAgents: availableAgentNames,
            }),
            'error',
          );
          return;
        }
        const viaAlias = agentName !== resolvedName ? ` (via alias "${agentName}")` : '';
        ctx.ui.notify(
          `❌ Agent "${resolvedName}"${viaAlias} is disabled. Enable it in .pi/slim-agents.json.\n\n${buildAvailableAgentsList(cwd, config)}`,
          'error',
        );
        return;
      }

      const startTime = Date.now();
      const runnerMode: 'prompt-only' | 'provider-call' = config.runnerMode ?? 'prompt-only';

      // Run delegation
      const result = await runAndRecordDelegation(
        { agent: agentName, task, mode },
        cwd,
        config,
        providerCallStatus?.available ?? false,
      );

      const durationMs = Date.now() - startTime;
      const historyId = historyStore.count() > 0 ? historyStore.recent(1)[0]?.id ?? null : null;
      const lastRecord = historyStore.recent(1)[0];
      const effectiveHistoryId = lastRecord?.id ?? null;
      const effectiveReplayOf = lastRecord?.replayOf ?? null;

      if (!result.ok) {
        if (format === 'json') {
          ctx.ui.notify(
            formatAgentResultJson({
              requestedAgent: agentName,
              resolvedAgent: resolvedName,
              aliasUsed,
              mode: mode ?? 'normal',
              runnerMode: result.runnerMode,
              status: 'error',
              durationMs,
              historyId: effectiveHistoryId,
              replayOf: effectiveReplayOf,
              executed: result.executed,
              toolsExecuted: result.toolsExecuted,
              childSessionStarted: result.childSessionStarted,
              note: result.note,
              providerCallAvailable: providerCallStatus?.available ?? false,
              error: result.error ?? 'Unknown error',
              availableAgents: availableAgentNames,
            }),
            'error',
          );
          return;
        }
        ctx.ui.notify(`❌ ${result.error}`, 'error');
        return;
      }

      const output = result.providerOutput ?? result.prompt;
      const status = result.providerOutput
        ? 'success'
        : 'success';

      if (format === 'json') {
        ctx.ui.notify(
          formatAgentResultJson({
            requestedAgent: agentName,
            resolvedAgent: resolvedName,
            aliasUsed,
            mode: mode ?? 'normal',
            runnerMode: result.runnerMode,
            status,
            durationMs,
            historyId: effectiveHistoryId,
            replayOf: effectiveReplayOf,
            executed: result.executed,
            toolsExecuted: result.toolsExecuted,
            childSessionStarted: result.childSessionStarted,
            note: result.note,
            providerCallAvailable: providerCallStatus?.available ?? false,
            output,
            taskSummary: task,
          }),
          'info',
        );
        return;
      }

      ctx.ui.notify(output, 'info');
    },
  });

  // ── Lightweight routing hint injection ─────────────────────────────

  // Build routing hint based on current enabled agents
  function buildRoutingHint(): string {
    try {
      const agents = loadAgents(cwd, config);
      const enabledAgents = agents.filter(a => a.enabled);
      
      if (enabledAgents.length === 0) {
        // No enabled agents - provide minimal hint
        return '';
      }
      
      // Build short hints for each enabled agent
      const hints: string[] = [];
      for (const agent of enabledAgents) {
        const role = agent.role || agent.name;
        hints.push(`${agent.name}=${role}`);
      }
      
      return `\n\nSlim agents routing hints: ${hints.join('; ')}. Use delegate_agent only when the specialist prompt helps.`;
    } catch {
      // If loading fails, return empty hint rather than crashing
      return '';
    }
  }

  pi.on('before_agent_start', async event => ({
    systemPrompt: `${event.systemPrompt}${buildRoutingHint()}`,
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
      const startTime = Date.now();

      try {
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

        const durationMs = Date.now() - startTime;

        // Return result
        if (!result.ok) {
          // Record error in history even if delegation failed
          if (!result.error?.includes('not found') && !result.error?.includes('disabled')) {
            // Only record if it's not a validation error (those are handled elsewhere)
            try {
              historyStore.add({
                timestamp: startTime,
                requestedAgent: agentName,
                resolvedAgent: result.agentName,
                taskSummary: task.length > 80 ? task.slice(0, 77) + '...' : task,
                mode: mode ?? 'normal',
                runnerMode: config.runnerMode ?? 'prompt-only',
                status: 'error',
                durationMs,
                providerCallAvailable: providerCallStatus?.available ?? false,
                errorReason: sanitizeErrorMessage(result.error),
                aliasUsed: agentName !== result.agentName,
              });
            } catch {
              // History recording failure should not affect the error response
            }
          }
          
          return {
            content: [{ type: 'text', text: `❌ Delegation failed: ${result.error}` }],
            details: { 
              error: result.error,
              code: 'DELEGATION_FAILED',
            },
          };
        }

        const output = result.providerOutput ?? result.prompt;

        return {
          content: [{ type: 'text', text: output }],
          details: {
            agent: result.agentName,
            delegated: true,
            runnerMode: result.runnerMode,
            executed: result.executed,
            toolsExecuted: result.toolsExecuted,
            childSessionStarted: result.childSessionStarted,
            note: result.note,
            meta: result.meta,
          },
        };
      } catch (err) {
        // Catch any unexpected errors and return a safe error response
        const durationMs = Date.now() - startTime;
        const sanitizedError = sanitizeErrorMessage(err);
        
        // Try to record the error in history
        try {
          historyStore.add({
            timestamp: startTime,
            requestedAgent: agentName,
            resolvedAgent: agentName,
            taskSummary: task.length > 80 ? task.slice(0, 77) + '...' : task,
            mode: mode ?? 'normal',
            runnerMode: config.runnerMode ?? 'prompt-only',
            status: 'error',
            durationMs,
            providerCallAvailable: providerCallStatus?.available ?? false,
            errorReason: sanitizedError,
            aliasUsed: false,
          });
        } catch {
          // History recording failure should not affect the error response
        }

        return {
          content: [{ type: 'text', text: `❌ Delegation error: ${sanitizedError}` }],
          details: { 
            error: sanitizedError,
            code: 'DELEGATION_EXECUTION_ERROR',
          },
        };
      }
    },
  });
}
