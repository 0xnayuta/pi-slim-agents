/**
 * Provider-call runner for pi-slim-agents.
 *
 * Attempts to call a model via @mariozechner/pi-ai's `complete()` function.
 * Falls back gracefully when pi-ai is not available in the module resolution chain.
 *
 * Architecture:
 *   - System prompt = agent markdown prompt + boundary instructions
 *   - User message = task + context + files + mode + expected output
 *   - Model = current session model (via ExtensionContext)
 *   - API key = resolved via ModelRegistry
 *   - Temperature = agent-level config with priority cascade
 *
 * Note: pi-ai is a transitive dependency of pi-coding-agent. In pnpm strict mode,
 * it may not be directly importable from the extension's module context.
 * When importable, this runner will make real model calls.
 * When not importable, it provides a clear fallback message.
 */

import type { AgentDefinition, DelegationResult, DelegateAgentParams, ProviderCallMeta, SlimAgentsConfig } from './types.js';
import { buildExpectedOutputSection } from './output-template.js';
import { sanitizeErrorMessage, getProviderUnavailableReason } from './security.js';

// ─── Lazy pi-ai import ──────────────────────────────────────────────

type CompleteFn = (
  model: unknown,
  context: unknown,
  options?: unknown,
) => Promise<{ content: Array<{ type: string; text?: string }> }>;

let _piAiComplete: CompleteFn | null = null;
let _piAiLoadAttempted = false;
let _piAiLoadErrorType: string | null = null;

async function getPiAiComplete(): Promise<CompleteFn | null> {
  if (_piAiLoadAttempted) return _piAiComplete;
  _piAiLoadAttempted = true;

  try {
    // Attempt to resolve @mariozechner/pi-ai from the current module graph.
    // In pnpm strict mode this may fail; when running inside pi-coding-agent's
    // process it may succeed depending on hoisting / resolution.
    //
    // Use a variable path to prevent TypeScript from resolving the module
    // at compile time (pi-ai is a transitive dependency, not declared).
    const piAiPath: string = '@mariozechner/pi-ai';
    const piAi = await import(piAiPath);
    if (typeof piAi.complete === 'function') {
      _piAiComplete = piAi.complete as CompleteFn;
      return _piAiComplete;
    }
    _piAiLoadErrorType = 'PI_AI_NO_COMPLETE';
  } catch (_err) {
    // Don't expose the actual error message - just categorize it
    _piAiLoadErrorType = 'PI_AI_IMPORT_FAILED';
  }

  return null;
}

/**
 * Check if the provider-call runner can make real model calls.
 * Useful for diagnostics and /agents status.
 */
export async function isProviderCallAvailable(): Promise<{ available: boolean; error?: string; errorType?: string }> {
  const fn = await getPiAiComplete();
  if (fn) return { available: true };
  return { 
    available: false, 
    error: getProviderUnavailableReason(_piAiLoadErrorType ?? undefined),
    errorType: _piAiLoadErrorType ?? 'UNKNOWN',
  };
}

// ─── Provider-call runner ───────────────────────────────────────────

/** Context shape expected by pi-ai complete(). */
interface ModelContext {
  systemPrompt?: string;
  messages: Array<{ role: 'user'; content: string; timestamp: number }>;
}

/** ExtensionContext interface (subset we need). */
export interface ProviderRunnerContext {
  model?: { id: string; provider: string; api: string } | undefined;
  modelRegistry: {
    getApiKeyAndHeaders(model: unknown): Promise<{ ok: boolean; apiKey?: string; headers?: Record<string, string>; error?: string }>;
  };
}

/**
 * Resolve the effective temperature for an agent.
 *
 * Priority:
 *   1. Config file agent.temperature
 *   2. Agent frontmatter temperature
 *   3. Default 0.2
 */
export function resolveTemperature(
  agent: AgentDefinition,
  config: SlimAgentsConfig,
): number {
  const override = config.agents?.[agent.name];
  if (override?.temperature !== undefined) return override.temperature;
  return agent.temperature;
}

/**
 * Resolve the effective model identifier for an agent.
 *
 * Priority:
 *   1. Config file agent.model
 *   2. Config file defaultModel
 *   3. Default "current"
 */
export function resolveModel(
  agent: AgentDefinition,
  config: SlimAgentsConfig,
): string {
  const override = config.agents?.[agent.name];
  if (override?.model !== undefined) return override.model;
  if (config.defaultModel !== undefined) return config.defaultModel;
  return 'current';
}

/**
 * Build the system prompt for a provider-call delegation.
 */
export function buildProviderSystemPrompt(agent: AgentDefinition): string {
  return [
    agent.body,
    '',
    '--- Boundaries ---',
    '- Only complete the delegated task. Do not perform unrelated work.',
    '- Do not pretend to have modified files unless you actually have tool access.',
    '- Keep output short, specific, and actionable for the main agent to consume.',
    '- If the task is unclear, state what you understood and provide your best answer.',
  ].join('\n');
}

/**
 * Build the user message for a provider-call delegation.
 */
export function buildProviderUserMessage(params: DelegateAgentParams, config?: SlimAgentsConfig): string {
  const files = params.files ?? [];
  const mode = params.mode ?? 'normal';

  const modeDescription: Record<string, string> = {
    quick: 'Quick answer — prioritize speed, be brief.',
    normal: 'Balanced answer — adequate depth, stay concise.',
    deep: 'Thorough analysis — consider edge cases and tradeoffs.',
  };

  // We need agent name to build the output template, but it's not in params.
  // The caller should pass it via a wrapper. For now, use a generic template
  // based on readonly (which we don't have here either).
  // The output template is primarily used in the prompt-only path; for provider-call,
  // the system prompt already sets expectations. We include a simple version here.
  const expectedOutput = config?.outputTemplate !== false
    ? 'Provide a clear, structured response using <summary>, <findings>, <evidence>, <risks>, <next_actions> sections as applicable.'
    : 'Provide a clear, structured response that the main agent can directly use.';

  const sections = [
    `## Task`,
    params.task,
    '',
    `## Context`,
    params.context?.trim() || '(none)',
    '',
    `## Files`,
    files.length > 0 ? files.map(f => `- ${f}`).join('\n') : '(none)',
    '',
    `## Mode`,
    `${mode} — ${modeDescription[mode] ?? modeDescription.normal}`,
    '',
    `## Expected Output`,
    expectedOutput,
  ];

  return sections.join('\n');
}

/**
 * Execute a provider-call delegation.
 *
 * Attempts to call the model via pi-ai. Returns a DelegationResult with
 * providerOutput populated if successful, or a fallback prompt if not.
 */
export async function runProviderDelegation(
  agent: AgentDefinition,
  params: DelegateAgentParams,
  config: SlimAgentsConfig,
  ctx: ProviderRunnerContext,
): Promise<DelegationResult> {
  const requestedAgent = params.agent;
  const resolvedAgent = agent.name;
  const modelId = resolveModel(agent, config);
  const temperature = resolveTemperature(agent, config);

  const meta: ProviderCallMeta = {
    resolvedAgent,
    requestedAgent,
    model: modelId,
    temperature,
    runnerMode: 'provider-call',
  };

  // Check preconditions before attempting model call
  if (!ctx.model) {
    return {
      ok: true,
      prompt: '',
      agentName: resolvedAgent,
      providerOutput: [
        `Agent: @${resolvedAgent}`,
        `Mode: provider-call`,
        `Error: No model configured in the current session.`,
        ``,
        `Fallback Prompt:`,
        buildFallbackPrompt(agent, params),
      ].join('\n'),
      meta,
    };
  }

  // Try to get the complete function
  const complete = await getPiAiComplete();

  if (!complete) {
    // Fallback: provider-call not available
    return buildFallbackResult(agent, params, meta);
  }

  // Resolve API key
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
  if (!auth.ok) {
    return {
      ok: true,
      prompt: '',
      agentName: resolvedAgent,
      providerOutput: [
        `Agent: @${resolvedAgent}`,
        `Mode: provider-call`,
        `Error: Could not resolve API key — ${auth.error}`,
        ``,
        `Fallback Prompt:`,
        buildFallbackPrompt(agent, params),
      ].join('\n'),
      meta,
    };
  }

  // Build model context
  const modelContext: ModelContext = {
    systemPrompt: buildProviderSystemPrompt(agent),
    messages: [
      {
        role: 'user',
        content: buildProviderUserMessage(params, config),
        timestamp: Date.now(),
      },
    ],
  };

  // Call the model
  try {
    const result = await complete(ctx.model, modelContext, {
      apiKey: auth.apiKey,
      headers: auth.headers,
      temperature,
    });

    const text = result.content
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text?: string }) => c.text ?? '')
      .join('')
      .trim();

    if (!text) {
      return {
        ok: true,
        prompt: '',
        agentName: resolvedAgent,
        providerOutput: [
          `Agent: @${resolvedAgent}`,
          `Mode: provider-call`,
          `Error: Model returned empty response.`,
          ``,
          `Fallback Prompt:`,
          buildFallbackPrompt(agent, params),
        ].join('\n'),
        meta,
      };
    }

    // Success — format output
    const actualModelId = (ctx.model as { id: string }).id;
    const output = [
      `Agent: @${resolvedAgent}`,
      `Mode: provider-call`,
      `Task: ${params.task}`,
      `Result:`,
      text,
      ``,
      `Metadata:`,
      `- resolvedAgent: ${resolvedAgent}`,
      `- requestedAgent: ${requestedAgent}`,
      `- model: ${actualModelId}`,
      `- temperature: ${temperature}`,
      `- runnerMode: provider-call`,
    ].join('\n');

    return {
      ok: true,
      prompt: '',
      agentName: resolvedAgent,
      providerOutput: output,
      message: `Provider-call delegation to @${resolvedAgent} completed.`,
      meta,
    };
  } catch (err) {
    // Sanitize the error message - don't expose stack traces or sensitive details
    const sanitizedError = sanitizeErrorMessage(err);
    return {
      ok: true,
      prompt: '',
      agentName: resolvedAgent,
      providerOutput: [
        `Agent: @${resolvedAgent}`,
        `Mode: provider-call`,
        `Error: Model call failed — ${sanitizedError}`,
        ``,
        `Fallback Prompt:`,
        buildFallbackPrompt(agent, params),
      ].join('\n'),
      meta,
    };
  }
}

// ─── Fallback helpers ───────────────────────────────────────────────

function buildFallbackResult(
  agent: AgentDefinition,
  params: DelegateAgentParams,
  meta: ProviderCallMeta,
): DelegationResult {
  const fallbackPrompt = buildFallbackPrompt(agent, params);
  // Use safe error reason without exposing implementation details
  const safeError = getProviderUnavailableReason(_piAiLoadErrorType ?? undefined);

  return {
    ok: true,
    prompt: fallbackPrompt,
    agentName: agent.name,
    providerOutput: [
      `Agent: @${agent.name}`,
      `Mode: provider-call (fallback to prompt-only)`,
      `Task: ${params.task}`,
      `Error: ${safeError}`,
      ``,
      `Fallback Prompt:`,
      fallbackPrompt,
      ``,
      `Metadata:`,
      `- resolvedAgent: ${agent.name}`,
      `- requestedAgent: ${params.agent}`,
      `- model: current`,
      `- temperature: ${meta.temperature}`,
      `- runnerMode: provider-call (fallback)`,
    ].join('\n'),
    message: `Provider-call unavailable. Falling back to prompt-only for @${agent.name}.`,
    meta,
  };
}

function buildFallbackPrompt(agent: AgentDefinition, params: DelegateAgentParams): string {
  const files = params.files ?? [];
  const mode = params.mode ?? 'normal';

  const sections = [
    `Agent: @${agent.name}`,
    `Role: ${agent.role}`,
    `Task: ${params.task}`,
    `Context: ${params.context?.trim() || '(none)'}`,
    `Files: ${files.length > 0 ? files.map(f => `- ${f}`).join('\n') : '(none)'}`,
    `Mode: ${mode}`,
    ``,
    `Instructions:`,
    agent.body,
    ``,
    `Expected Output:`,
    agent.readonly
      ? 'Search, analyze, and report clearly. Do not modify files.'
      : 'Complete the task and report concise, actionable results.',
  ];

  return sections.join('\n');
}
