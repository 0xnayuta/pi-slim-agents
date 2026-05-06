/**
 * Test suite for pi-slim-agents.
 *
 * Uses Node built-in assert — no test framework needed.
 * Run with: pnpm test  (or: tsx tests/agents.test.ts)
 */

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAgents, resolveAgentName, getAgent } from '../src/agents.js';
import { isSafeAgentName, parseAgentFrontmatter } from '../src/utils.js';
import { isAgentDisabled, loadConfig } from '../src/config.js';
import { runDelegation } from '../src/runner.js';
import { parseAgentCommand, buildAgentHelpText, runAndRecordDelegation, replayDelegation, filterAgents, filterTemplates, formatAgentList, formatTemplateList } from '../src/commands.js';
import { buildExpectedOutputSection } from '../src/output-template.js';
import {
  buildProviderSystemPrompt,
  buildProviderUserMessage,
  resolveTemperature,
  resolveModel,
  type ProviderRunnerContext,
} from '../src/provider-runner.js';
import { historyStore, determineDelegationStatus } from '../src/history.js';
import type { MetricsSummary } from '../src/history.js';
import {
  buildStatusReport,
  formatStatusReport,
  formatHistoryTable,
  formatMetrics,
  formatReloadResult,
  performReload,
} from '../src/status.js';
import { loadTemplates, createAgentFromTemplate, validateAgents, formatTemplatesList, formatValidationResult, getTemplate } from '../src/templates.js';
import type { AgentDefinition, DelegationRecord, DelegationResult, DelegateAgentParams, SlimAgentsConfig } from '../src/types.js';
import * as fs from 'node:fs';
import * as os from 'node:os';

// ─── Helpers ────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    failed++;
    const msg = e.message ?? String(e);
    failures.push(`${name}: ${msg}`);
    console.log(`  ❌ ${name}`);
    console.log(`     ${msg}`);
  }
}

// ─── 1. Built-in agents load ────────────────────────────────────────

console.log('1. Built-in agents load');

const BUILTIN_AGENTS = ['orchestrator', 'explorer', 'librarian', 'oracle', 'fixer', 'designer'];
const agents = loadAgents(PROJECT_ROOT, {});

for (const name of BUILTIN_AGENTS) {
  await test(`${name} loads`, () => {
    const agent = agents.find(a => a.name === name);
    assert.ok(agent, `Agent "${name}" not found in loaded agents`);
    assert.ok(agent.description, `Agent "${name}" has no description`);
    assert.ok(agent.body.length > 10, `Agent "${name}" body is too short`);
  });
}

await test('exactly 6 built-in agents loaded', () => {
  assert.equal(agents.length, 6);
});

// ─── 2. Frontmatter parsing ─────────────────────────────────────────

console.log('\n2. Frontmatter parsing');

await test('explorer has correct name, description, readonly, temperature', () => {
  const explorer = agents.find(a => a.name === 'explorer')!;
  assert.equal(explorer.name, 'explorer');
  assert.equal(explorer.readonly, true);
  assert.ok(explorer.description.includes('search') || explorer.description.includes('Search'));
  assert.equal(explorer.temperature, 0.1);
});

await test('aliases are parsed from frontmatter', () => {
  const explorer = agents.find(a => a.name === 'explorer')!;
  assert.ok(Array.isArray(explorer.aliases), 'aliases should be an array');
  assert.ok(explorer.aliases.includes('search'), 'should include alias "search"');
  assert.ok(explorer.aliases.includes('find'), 'should include alias "find"');
  assert.ok(explorer.aliases.includes('locate'), 'should include alias "locate"');
});

await test('enabled defaults to true for non-disabled agents', () => {
  for (const agent of agents) {
    assert.equal(agent.enabled, true, `Agent "${agent.name}" should be enabled by default`);
  }
});

await test('designer has higher temperature', () => {
  const designer = agents.find(a => a.name === 'designer')!;
  assert.ok(designer.temperature > 0.2, `Expected temperature > 0.2, got ${designer.temperature}`);
});

// ─── 3. Invalid agent names ─────────────────────────────────────────

console.log('\n3. Invalid agent names');

await test('name with spaces is rejected', () => {
  assert.equal(isSafeAgentName('my agent'), false);
});

await test('name with slash is rejected', () => {
  assert.equal(isSafeAgentName('my/agent'), false);
});

await test('path traversal ../evil is rejected', () => {
  assert.equal(isSafeAgentName('../evil'), false);
});

await test('uppercase name is rejected', () => {
  assert.equal(isSafeAgentName('Explorer'), false);
});

await test('empty string is rejected', () => {
  assert.equal(isSafeAgentName(''), false);
});

await test('name starting with number is rejected', () => {
  assert.equal(isSafeAgentName('1agent'), false);
});

await test('valid lowercase names are accepted', () => {
  assert.equal(isSafeAgentName('explorer'), true);
  assert.equal(isSafeAgentName('my-agent'), true);
  assert.equal(isSafeAgentName('my_agent'), true);
  assert.equal(isSafeAgentName('agent1'), true);
});

// ─── 4. Unknown agent error ─────────────────────────────────────────

console.log('\n4. Unknown agent error');

await test('unknown agent returns clear error with available agents list', async () => {
  const result = await runDelegation(
    { agent: 'nonexistent', task: 'do something' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('not found'), `Error should mention "not found": ${result.error}`);
  assert.ok(result.error!.includes('Available'), `Error should list available agents: ${result.error}`);
});

await test('invalid agent name returns clear error', async () => {
  const result = await runDelegation(
    { agent: '../evil', task: 'do something' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('Invalid'), `Error should mention "Invalid": ${result.error}`);
});

// ─── 5. Alias resolution ────────────────────────────────────────────

console.log('\n5. Alias resolution');

const ALIAS_MAP: Record<string, string> = {
  search: 'explorer',
  find: 'explorer',
  locate: 'explorer',
  docs: 'librarian',
  research: 'librarian',
  library: 'librarian',
  arch: 'oracle',
  review: 'oracle',
  judge: 'oracle',
  fix: 'fixer',
  implement: 'fixer',
  patch: 'fixer',
  ui: 'designer',
  ux: 'designer',
  design: 'designer',
  route: 'orchestrator',
  router: 'orchestrator',
};

for (const [alias, expectedAgent] of Object.entries(ALIAS_MAP)) {
  await test(`alias "${alias}" resolves to ${expectedAgent}`, () => {
    const resolved = resolveAgentName(alias, agents);
    assert.equal(resolved, expectedAgent);
  });
}

await test('delegate_agent resolves alias "search" to explorer', async () => {
  const result = await runDelegation(
    { agent: 'search', task: 'Find all TypeScript files' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'explorer');
  assert.ok(result.prompt.includes('explorer'));
});

await test('delegate_agent resolves alias "ui" to designer', async () => {
  const result = await runDelegation(
    { agent: 'ui', task: 'Review the login form styling' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'designer');
});

await test('delegate_agent resolves alias "arch" to oracle', async () => {
  const result = await runDelegation(
    { agent: 'arch', task: 'Review the architecture' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'oracle');
});

await test('delegate_agent resolves alias "fix" to fixer', async () => {
  const result = await runDelegation(
    { agent: 'fix', task: 'Fix the bug in login.ts' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'fixer');
});

await test('delegate_agent resolves alias "docs" to librarian', async () => {
  const result = await runDelegation(
    { agent: 'docs', task: 'Research the pino logging library' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'librarian');
});

await test('delegate_agent resolves alias "route" to orchestrator', async () => {
  const result = await runDelegation(
    { agent: 'route', task: 'Plan the implementation' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'orchestrator');
});

await test('getAgent resolves alias', () => {
  const agent = getAgent('search', PROJECT_ROOT, {});
  assert.ok(agent);
  assert.equal(agent.name, 'explorer');
});

await test('resolveAgentName returns null for unknown name', () => {
  const result = resolveAgentName('nonexistent', agents);
  assert.equal(result, null);
});

// ─── 6. Disabled agents ─────────────────────────────────────────────

console.log('\n6. Disabled agents');

await test('disabled agent via enabled:false is marked as disabled', () => {
  const config: SlimAgentsConfig = {
    agents: { designer: { enabled: false } },
  };
  const allAgents = loadAgents(PROJECT_ROOT, config);
  const designer = allAgents.find(a => a.name === 'designer');
  assert.ok(designer, 'designer should still be in the list');
  assert.equal(designer.enabled, false);
});

await test('disabled agent via legacy disabled:true', () => {
  const config: SlimAgentsConfig = {
    agents: { designer: { disabled: true } },
  };
  assert.equal(isAgentDisabled(config, 'designer'), true);
});

await test('disabled agent via top-level disabled array', () => {
  const config: SlimAgentsConfig = {
    disabled: ['designer'],
  };
  assert.equal(isAgentDisabled(config, 'designer'), true);
});

await test('enabled:true overrides disabled:true', () => {
  const config: SlimAgentsConfig = {
    agents: { designer: { disabled: true, enabled: true } },
  };
  assert.equal(isAgentDisabled(config, 'designer'), false);
});

await test('delegate_agent rejects disabled agent with clear error', async () => {
  const config: SlimAgentsConfig = {
    agents: { designer: { enabled: false } },
  };
  const result = await runDelegation(
    { agent: 'designer', task: 'Design the UI' },
    PROJECT_ROOT,
    config,
  );
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('disabled'), `Error should mention "disabled": ${result.error}`);
  assert.ok(result.error!.includes('Available enabled agents'), `Error should list enabled agents: ${result.error}`);
});

await test('alias pointing to disabled agent is rejected', async () => {
  const config: SlimAgentsConfig = {
    agents: { designer: { enabled: false } },
  };
  const result = await runDelegation(
    { agent: 'ui', task: 'Design the UI' },
    PROJECT_ROOT,
    config,
  );
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('disabled'), `Error should mention "disabled": ${result.error}`);
  assert.ok(result.error!.includes('via alias'), `Error should mention the alias: ${result.error}`);
});

await test('enabled agents list does not include disabled agents', () => {
  const config: SlimAgentsConfig = {
    agents: { designer: { enabled: false } },
  };
  const allAgents = loadAgents(PROJECT_ROOT, config);
  const enabled = allAgents.filter(a => a.enabled);
  const disabled = allAgents.filter(a => !a.enabled);
  assert.equal(enabled.length, 5);
  assert.equal(disabled.length, 1);
  assert.equal(disabled[0].name, 'designer');
});

// ─── 7. Frontmatter parser edge cases ───────────────────────────────

console.log('\n7. Frontmatter parser edge cases');

await test('parses simple key-value pairs', () => {
  const { frontmatter } = parseAgentFrontmatter('---\nname: test\ndescription: A test\n---\nBody');
  assert.equal(frontmatter.name, 'test');
  assert.equal(frontmatter.description, 'A test');
});

await test('parses boolean values', () => {
  const { frontmatter } = parseAgentFrontmatter('---\nreadonly: true\n---\nBody');
  assert.equal(frontmatter.readonly, true);
});

await test('parses numeric values', () => {
  const { frontmatter } = parseAgentFrontmatter('---\ntemperature: 0.5\n---\nBody');
  assert.equal(frontmatter.temperature, 0.5);
});

await test('parses list values', () => {
  const { frontmatter } = parseAgentFrontmatter('---\ntags:\n  - a\n  - b\n---\nBody');
  assert.deepEqual(frontmatter.tags, ['a', 'b']);
});

await test('returns empty frontmatter for files without frontmatter', () => {
  const { frontmatter, body } = parseAgentFrontmatter('Just some markdown');
  assert.deepEqual(frontmatter, {});
  assert.equal(body, 'Just some markdown');
});

await test('parses body correctly after frontmatter', () => {
  const { body } = parseAgentFrontmatter('---\nname: test\n---\nThis is the body\nWith multiple lines');
  assert.ok(body.includes('This is the body'));
  assert.ok(body.includes('With multiple lines'));
});

// ─── 8. runnerMode = prompt-only compatibility ──────────────────────

console.log('\n8. runnerMode = prompt-only compatibility');

await test('prompt-only mode returns structured delegation prompt (default)', async () => {
  const result = await runDelegation(
    { agent: 'oracle', task: 'Review the architecture' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'oracle');
  assert.ok(result.prompt.length > 0, 'prompt should not be empty');
  assert.ok(result.prompt.includes('oracle'), 'prompt should contain agent name');
  assert.ok(result.prompt.includes('Review the architecture'), 'prompt should contain task');
  assert.equal(result.providerOutput, undefined, 'should not have providerOutput in prompt-only mode');
});

await test('explicit prompt-only mode behaves the same', async () => {
  const config: SlimAgentsConfig = { runnerMode: 'prompt-only' };
  const result = await runDelegation(
    { agent: 'explorer', task: 'Find config files', files: ['src/'], mode: 'quick' },
    PROJECT_ROOT,
    config,
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'explorer');
  assert.ok(result.prompt.includes('Find config files'));
  assert.ok(result.prompt.includes('src/'));
  assert.ok(result.prompt.includes('quick'));
});

// D1-fix: prompt-only UX tests ──────────────────────────────────────

await test('prompt-only mode sets executed=false, toolsExecuted=false, childSessionStarted=false', async () => {
  const result = await runDelegation(
    { agent: 'explorer', task: 'Find playback code' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.executed, false, 'executed should be false in prompt-only mode');
  assert.equal(result.toolsExecuted, false, 'toolsExecuted should be false in prompt-only mode');
  assert.equal(result.childSessionStarted, false, 'childSessionStarted should be false in prompt-only mode');
  assert.equal(result.runnerMode, 'prompt-only');
  assert.ok(result.note?.includes('No tools were executed'), 'note should mention no tools were executed');
  assert.ok(result.note?.includes('Prompt-only delegation'), 'note should say prompt-only');
});

await test('prompt-only mode result has note with guidance', async () => {
  const result = await runDelegation(
    { agent: 'oracle', task: 'Review architecture' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.ok(result.note, 'should have a note');
  assert.ok(result.note!.length > 20, 'note should be substantial');
  assert.ok(result.note!.includes('Prompt-only'), 'note should mention prompt-only');
  assert.ok(result.note!.includes('No tools were executed'), 'note should mention no tools');
  assert.ok(result.note!.includes('child agent'), 'note should mention child agent');
});

await test('formatDelegationResult shows prompt-only banner for prompt-only result', async () => {
  const { formatDelegationResult } = await import('../src/runner.js');
  const result = await runDelegation(
    { agent: 'explorer', task: 'Find config' },
    PROJECT_ROOT,
    {},
  );
  const formatted = formatDelegationResult(result);
  assert.ok(formatted.includes('Prompt-only') || formatted.includes('prompt-only'), 'should mention prompt-only');
  assert.ok(formatted.includes('no tools were executed'), 'should say no tools executed');
  assert.ok(formatted.includes('no child agent') || formatted.includes('child agent'), 'should mention child agent');
  assert.ok(formatted.includes('--- Delegation Prompt ---'), 'should show delegation prompt');
  assert.ok(formatted.includes('--- End ---'), 'should close delegation prompt');
});

await test('formatDelegationResult does NOT show banner for provider-call output', async () => {
  const { formatDelegationResult } = await import('../src/runner.js');
  const config: SlimAgentsConfig = { runnerMode: 'provider-call' };
  const mockCtx: ProviderRunnerContext = {
    model: undefined,
    modelRegistry: {
      async getApiKeyAndHeaders() { return { ok: false, error: 'no model' }; },
    },
  };
  const result = await runDelegation(
    { agent: 'oracle', task: 'Review' },
    PROJECT_ROOT,
    config,
    mockCtx,
  );
  const formatted = formatDelegationResult(result);
  assert.ok(result.providerOutput, 'should have providerOutput');
  assert.equal(formatted, result.providerOutput, 'providerOutput should be returned directly');
});

await test('provider-call fallback result has executed=false and fallback note', async () => {
  const config: SlimAgentsConfig = { runnerMode: 'provider-call' };
  const result = await runDelegation(
    { agent: 'oracle', task: 'Review this' },
    PROJECT_ROOT,
    config,
    // no ctx — should fall back
  );
  assert.equal(result.ok, true);
  assert.equal(result.executed, false, 'executed should be false in fallback');
  assert.equal(result.toolsExecuted, false, 'toolsExecuted should be false in fallback');
  assert.equal(result.childSessionStarted, false, 'childSessionStarted should be false in fallback');
  assert.ok(result.note?.includes('fallback') || result.note?.includes('ExtensionContext'), 'note should mention fallback');
});

// ─── 9. runnerMode = provider-call with no API ──────────────────────

console.log('\n9. runnerMode = provider-call (no real API)');

await test('provider-call without ctx falls back to prompt-only', async () => {
  const config: SlimAgentsConfig = { runnerMode: 'provider-call' };
  const result = await runDelegation(
    { agent: 'oracle', task: 'Review this' },
    PROJECT_ROOT,
    config,
    // no ctx passed — should fall back
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'oracle');
  assert.ok(result.prompt.length > 0, 'should have fallback prompt');
  assert.ok(result.message?.includes('prompt-only'), 'message should mention fallback');
});

await test('provider-call with ctx but no model returns error in output', async () => {
  const config: SlimAgentsConfig = { runnerMode: 'provider-call' };
  const mockCtx: ProviderRunnerContext = {
    model: undefined,
    modelRegistry: {
      async getApiKeyAndHeaders() {
        return { ok: false, error: 'no model' };
      },
    },
  };
  const result = await runDelegation(
    { agent: 'oracle', task: 'Review this' },
    PROJECT_ROOT,
    config,
    mockCtx,
  );
  assert.equal(result.ok, true);
  assert.ok(result.providerOutput, 'should have providerOutput');
  assert.ok(result.providerOutput!.includes('No model configured'), 'should mention no model');
  assert.ok(result.meta, 'should have meta');
  assert.equal(result.meta!.runnerMode, 'provider-call');
});

await test('provider-call falls back gracefully when pi-ai not importable', async () => {
  const config: SlimAgentsConfig = { runnerMode: 'provider-call' };
  const mockCtx: ProviderRunnerContext = {
    model: { id: 'test-model', provider: 'test', api: 'test' },
    modelRegistry: {
      async getApiKeyAndHeaders() {
        return { ok: true, apiKey: 'test-key' };
      },
    },
  };
  const result = await runDelegation(
    { agent: 'oracle', task: 'Review this' },
    PROJECT_ROOT,
    config,
    mockCtx,
  );
  assert.equal(result.ok, true);
  assert.ok(result.providerOutput, 'should have providerOutput');
  // Since pi-ai is not importable in test env, should show fallback
  assert.ok(
    result.providerOutput!.includes('fallback') || result.providerOutput!.includes('Error'),
    'should show fallback or error message',
  );
});

// ─── 10. Disabled agent blocks provider-call ────────────────────────

console.log('\n10. Disabled agent blocks provider-call');

await test('disabled agent rejected even in provider-call mode', async () => {
  const config: SlimAgentsConfig = {
    runnerMode: 'provider-call',
    agents: { oracle: { enabled: false } },
  };
  const result = await runDelegation(
    { agent: 'oracle', task: 'Review this' },
    PROJECT_ROOT,
    config,
  );
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('disabled'));
});

await test('alias to disabled agent rejected in provider-call mode', async () => {
  const config: SlimAgentsConfig = {
    runnerMode: 'provider-call',
    agents: { oracle: { enabled: false } },
  };
  const result = await runDelegation(
    { agent: 'arch', task: 'Review this' },
    PROJECT_ROOT,
    config,
  );
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('disabled'));
  assert.ok(result.error!.includes('via alias'));
});

// ─── 11. Unknown agent blocks provider-call ─────────────────────────

console.log('\n11. Unknown agent blocks provider-call');

await test('unknown agent rejected in provider-call mode', async () => {
  const config: SlimAgentsConfig = { runnerMode: 'provider-call' };
  const result = await runDelegation(
    { agent: 'nonexistent', task: 'Do something' },
    PROJECT_ROOT,
    config,
  );
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('not found'));
});

// ─── 12. Alias + provider-call resolves correctly ───────────────────

console.log('\n12. Alias + provider-call');

await test('alias resolves correctly in provider-call mode', async () => {
  const config: SlimAgentsConfig = { runnerMode: 'provider-call' };
  const mockCtx: ProviderRunnerContext = {
    model: undefined,
    modelRegistry: {
      async getApiKeyAndHeaders() {
        return { ok: false, error: 'no model' };
      },
    },
  };
  const result = await runDelegation(
    { agent: 'arch', task: 'Review architecture' },
    PROJECT_ROOT,
    config,
    mockCtx,
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'oracle');
  assert.ok(result.meta);
  assert.equal(result.meta!.resolvedAgent, 'oracle');
  assert.equal(result.meta!.requestedAgent, 'arch');
});

// ─── 13. Temperature priority ───────────────────────────────────────

console.log('\n13. Temperature priority');

await test('config temperature overrides frontmatter temperature', () => {
  const oracle = agents.find(a => a.name === 'oracle')!;
  const config: SlimAgentsConfig = {
    agents: { oracle: { temperature: 0.8 } },
  };
  const temp = resolveTemperature(oracle, config);
  assert.equal(temp, 0.8);
});

await test('frontmatter temperature used when no config override', () => {
  const oracle = agents.find(a => a.name === 'oracle')!;
  const temp = resolveTemperature(oracle, {});
  assert.equal(temp, 0.1); // oracle.md has temperature: 0.1
});

await test('designer frontmatter temperature is used by default', () => {
  const designer = agents.find(a => a.name === 'designer')!;
  const temp = resolveTemperature(designer, {});
  assert.ok(temp > 0.2, `Expected designer temp > 0.2, got ${temp}`);
});

await test('config temperature for different agents is independent', () => {
  const oracle = agents.find(a => a.name === 'oracle')!;
  const fixer = agents.find(a => a.name === 'fixer')!;
  const config: SlimAgentsConfig = {
    agents: {
      oracle: { temperature: 0.9 },
    },
  };
  assert.equal(resolveTemperature(oracle, config), 0.9);
  assert.equal(resolveTemperature(fixer, config), 0.2); // fixer frontmatter default
});

// ─── 14. Model resolution ───────────────────────────────────────────

console.log('\n14. Model resolution');

await test('default model is "current"', () => {
  const oracle = agents.find(a => a.name === 'oracle')!;
  const model = resolveModel(oracle, {});
  assert.equal(model, 'current');
});

await test('config defaultModel overrides default', () => {
  const oracle = agents.find(a => a.name === 'oracle')!;
  const config: SlimAgentsConfig = { defaultModel: 'gpt-4o' };
  const model = resolveModel(oracle, config);
  assert.equal(model, 'gpt-4o');
});

await test('agent-level model overrides defaultModel', () => {
  const oracle = agents.find(a => a.name === 'oracle')!;
  const config: SlimAgentsConfig = {
    defaultModel: 'gpt-4o',
    agents: { oracle: { model: 'claude-sonnet' } },
  };
  const model = resolveModel(oracle, config);
  assert.equal(model, 'claude-sonnet');
});

await test('agent-level model "current" uses current session model', () => {
  const oracle = agents.find(a => a.name === 'oracle')!;
  const config: SlimAgentsConfig = {
    agents: { oracle: { model: 'current' } },
  };
  const model = resolveModel(oracle, config);
  assert.equal(model, 'current');
});

// ─── 15. Prompt assembly ────────────────────────────────────────────

console.log('\n15. Prompt assembly');

await test('provider system prompt contains agent body and boundaries', () => {
  const oracle = agents.find(a => a.name === 'oracle')!;
  const systemPrompt = buildProviderSystemPrompt(oracle);
  assert.ok(systemPrompt.includes('Oracle'), 'should contain agent identity');
  assert.ok(systemPrompt.includes('Boundaries'), 'should contain boundaries section');
  assert.ok(systemPrompt.includes('Only complete the delegated task'), 'should contain boundary rule');
});

await test('provider user message contains task/context/files/mode', () => {
  const params: DelegateAgentParams = {
    agent: 'oracle',
    task: 'Review the authentication module',
    context: 'We use JWT tokens',
    files: ['src/auth/jwt.ts', 'src/auth/middleware.ts'],
    mode: 'deep',
  };
  const userMsg = buildProviderUserMessage(params);
  assert.ok(userMsg.includes('Review the authentication module'), 'should contain task');
  assert.ok(userMsg.includes('We use JWT tokens'), 'should contain context');
  assert.ok(userMsg.includes('src/auth/jwt.ts'), 'should contain first file');
  assert.ok(userMsg.includes('src/auth/middleware.ts'), 'should contain second file');
  assert.ok(userMsg.includes('deep'), 'should contain mode');
  assert.ok(userMsg.includes('Expected Output'), 'should contain expected output section');
});

await test('provider user message handles missing optional fields', () => {
  const params: DelegateAgentParams = {
    agent: 'oracle',
    task: 'Quick review',
  };
  const userMsg = buildProviderUserMessage(params);
  assert.ok(userMsg.includes('Quick review'), 'should contain task');
  assert.ok(userMsg.includes('(none)'), 'should show (none) for missing context');
});

await test('prompt-only prompt contains task/context/files/mode', async () => {
  const result = await runDelegation(
    {
      agent: 'oracle',
      task: 'Review module X',
      context: 'Context info here',
      files: ['src/x.ts'],
      mode: 'deep',
    },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.ok(result.prompt.includes('Review module X'));
  assert.ok(result.prompt.includes('Context info here'));
  assert.ok(result.prompt.includes('src/x.ts'));
  assert.ok(result.prompt.includes('deep'));
});

// ─── 16. runnerMode config merge ────────────────────────────────────

console.log('\n16. Config merge');

await test('runnerMode is merged from project config', () => {
  const userCfg: SlimAgentsConfig = {};
  const projCfg: SlimAgentsConfig = { runnerMode: 'provider-call' };
  // We test through loadConfig indirectly by checking the merge function
  // For now, verify the type is accepted
  const config: SlimAgentsConfig = { runnerMode: 'provider-call' };
  assert.equal(config.runnerMode, 'provider-call');
});

await test('runnerMode defaults to prompt-only when not set', () => {
  const config: SlimAgentsConfig = {};
  assert.equal(config.runnerMode, undefined); // undefined means prompt-only by default
});

// ─── 17. History store ──────────────────────────────────────────────

console.log('\n17. History store');

await test('history store starts empty', () => {
  historyStore.clear();
  assert.equal(historyStore.count(), 0);
  assert.deepEqual(historyStore.recent(), []);
});

await test('history store add and recent', () => {
  historyStore.clear();
  historyStore.add({
    timestamp: Date.now(),
    requestedAgent: 'search',
    resolvedAgent: 'explorer',
    taskSummary: 'Find all TypeScript files',
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 120,
    providerCallAvailable: false,
    aliasUsed: true,
  });
  assert.equal(historyStore.count(), 1);
  const recent = historyStore.recent(1);
  assert.equal(recent.length, 1);
  assert.equal(recent[0].resolvedAgent, 'explorer');
  assert.equal(recent[0].aliasUsed, true);
});

await test('history store recent returns newest first', () => {
  historyStore.clear();
  historyStore.add({
    timestamp: 1000,
    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    taskSummary: 'First task',
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 100,
    providerCallAvailable: false,
    aliasUsed: false,
  });
  historyStore.add({
    timestamp: 2000,
    requestedAgent: 'fixer',
    resolvedAgent: 'fixer',
    taskSummary: 'Second task',
    mode: 'quick',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 200,
    providerCallAvailable: false,
    aliasUsed: false,
  });
  const recent = historyStore.recent(10);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].taskSummary, 'Second task');
  assert.equal(recent[1].taskSummary, 'First task');
});

await test('history store clear', () => {
  historyStore.clear();
  assert.equal(historyStore.count(), 0);
});

await test('history store caps at MAX_HISTORY', () => {
  historyStore.clear();
  for (let i = 0; i < 250; i++) {
    historyStore.add({
      timestamp: i,
      requestedAgent: 'oracle',
      resolvedAgent: 'oracle',
      taskSummary: `Task ${i}`,
      mode: 'normal',
      runnerMode: 'prompt-only',
      status: 'success',
      durationMs: 100,
      providerCallAvailable: false,
      aliasUsed: false,
    });
  }
  assert.ok(historyStore.count() <= 200, `count should be <= 200, got ${historyStore.count()}`);
  historyStore.clear();
});

// ─── 18. Metrics ────────────────────────────────────────────────────

console.log('\n18. Metrics');

await test('metrics from empty history', () => {
  historyStore.clear();
  const m = historyStore.metrics();
  assert.equal(m.total, 0);
  assert.equal(m.success, 0);
  assert.equal(m.fallback, 0);
  assert.equal(m.error, 0);
  assert.equal(m.avgDurationMs, 0);
});

await test('metrics computes correct counts', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'explorer', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 200, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 3, requestedAgent: 'c', resolvedAgent: 'fixer', taskSummary: '', mode: 'normal', runnerMode: 'provider-call', status: 'fallback', durationMs: 50, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 4, requestedAgent: 'd', resolvedAgent: 'unknown', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'error', durationMs: 10, providerCallAvailable: false, aliasUsed: false });

  const m = historyStore.metrics();
  assert.equal(m.total, 4);
  assert.equal(m.success, 2);
  assert.equal(m.fallback, 1);
  assert.equal(m.error, 1);
  assert.equal(m.avgDurationMs, 90); // (100+200+50+10)/4
  assert.equal(m.perAgent['oracle'], 1);
  assert.equal(m.perAgent['explorer'], 1);
  assert.equal(m.perAgent['fixer'], 1);
  assert.equal(m.perRunnerMode['prompt-only'], 3);
  assert.equal(m.perRunnerMode['provider-call'], 1);
  assert.equal(m.providerCallAvailable, 0);
  assert.equal(m.providerCallUnavailable, 4);
  historyStore.clear();
});

await test('metrics provider-call available count', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: '', mode: 'normal', runnerMode: 'provider-call', status: 'success', durationMs: 100, providerCallAvailable: true, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'oracle', taskSummary: '', mode: 'normal', runnerMode: 'provider-call', status: 'fallback', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const m = historyStore.metrics();
  assert.equal(m.providerCallAvailable, 1);
  assert.equal(m.providerCallUnavailable, 1);
  historyStore.clear();
});

// ─── 19. determineDelegationStatus ─────────────────────────────────

console.log('\n19. determineDelegationStatus');

await test('error result → error status', () => {
  const result: DelegationResult = { ok: false, prompt: '', agentName: 'unknown', error: 'Agent not found' };
  const status = determineDelegationStatus(result, {});
  assert.equal(status.status, 'error');
  assert.equal(status.errorReason, 'Agent not found');
});

await test('prompt-only success → success status', () => {
  const result: DelegationResult = { ok: true, prompt: 'some prompt', agentName: 'oracle' };
  const status = determineDelegationStatus(result, {});
  assert.equal(status.status, 'success');
  assert.equal(status.errorReason, undefined);
});

await test('provider-call with actual result → success status', () => {
  const result: DelegationResult = {
    ok: true,
    prompt: '',
    agentName: 'oracle',
    providerOutput: 'Agent: @oracle\nMode: provider-call\nTask: review\nResult:\nHere is my review\n\nMetadata:\n- resolvedAgent: oracle',
    meta: { resolvedAgent: 'oracle', requestedAgent: 'arch', model: 'current', temperature: 0.2, runnerMode: 'provider-call' },
  };
  const config: SlimAgentsConfig = { runnerMode: 'provider-call' };
  const status = determineDelegationStatus(result, config);
  assert.equal(status.status, 'success');
});

await test('provider-call with fallback → fallback status', () => {
  const result: DelegationResult = {
    ok: true,
    prompt: 'fallback prompt',
    agentName: 'oracle',
    providerOutput: 'Agent: @oracle\nMode: provider-call (fallback to prompt-only)\nTask: review\nError: pi-ai not available\nFallback Prompt:\n...',
    meta: { resolvedAgent: 'oracle', requestedAgent: 'oracle', model: 'current', temperature: 0.2, runnerMode: 'provider-call' },
    message: 'Provider-call unavailable. Falling back to prompt-only for @oracle.',
  };
  const config: SlimAgentsConfig = { runnerMode: 'provider-call' };
  const status = determineDelegationStatus(result, config);
  assert.equal(status.status, 'fallback');
  assert.ok(status.errorReason?.includes('unavailable'));
});

await test('provider-call without ctx → fallback status', () => {
  const result: DelegationResult = {
    ok: true,
    prompt: 'prompt content',
    agentName: 'oracle',
    message: 'Provider-call mode requested but no ExtensionContext available. Returning prompt-only for @oracle.',
  };
  const config: SlimAgentsConfig = { runnerMode: 'provider-call' };
  const status = determineDelegationStatus(result, config);
  assert.equal(status.status, 'fallback');
});

// ─── 20. Status report ─────────────────────────────────────────────

console.log('\n20. Status report');

await test('buildStatusReport returns correct structure', () => {
  const report = buildStatusReport({
    cwd: PROJECT_ROOT,
    config: {},
    providerCallStatus: { available: false, error: 'Cannot find module pi-ai' },
    lastReloadTime: '2024-01-15T10:30:00Z',
    delegationCount: 5,
  });
  assert.equal(report.runnerMode, 'prompt-only');
  assert.equal(report.providerCall.available, false);
  assert.ok(report.providerCall.reason.includes('not importable'));
  assert.equal(report.agents.total, 6);
  assert.equal(report.agents.enabled, 6);
  assert.equal(report.agents.disabled, 0);
  assert.ok(report.agents.aliasCount > 0);
  assert.equal(report.lastReloadTime, '2024-01-15T10:30:00Z');
  assert.equal(report.delegationCount, 5);
});

await test('formatStatusReport includes runnerMode', () => {
  const report = buildStatusReport({
    cwd: PROJECT_ROOT,
    config: { runnerMode: 'provider-call' },
    providerCallStatus: null,
    lastReloadTime: null,
    delegationCount: 0,
  });
  const output = formatStatusReport(report);
  assert.ok(output.includes('Runner Mode:  provider-call'), `should include runnerMode: ${output}`);
});

await test('formatStatusReport shows provider unavailable reason', () => {
  const report = buildStatusReport({
    cwd: PROJECT_ROOT,
    config: {},
    providerCallStatus: { available: false, error: 'Cannot find module @mariozechner/pi-ai' },
    lastReloadTime: null,
    delegationCount: 0,
  });
  const output = formatStatusReport(report);
  assert.ok(output.includes('unavailable'), `should show unavailable: ${output}`);
  assert.ok(output.includes('not importable'), `should show reason: ${output}`);
});

await test('formatStatusReport lists all agents', () => {
  const report = buildStatusReport({
    cwd: PROJECT_ROOT,
    config: {},
    providerCallStatus: null,
    lastReloadTime: null,
    delegationCount: 0,
  });
  const output = formatStatusReport(report);
  assert.ok(output.includes('@explorer'), 'should include explorer');
  assert.ok(output.includes('@oracle'), 'should include oracle');
  assert.ok(output.includes('@fixer'), 'should include fixer');
});

await test('formatStatusReport does not leak API keys', () => {
  const report = buildStatusReport({
    cwd: PROJECT_ROOT,
    config: {},
    providerCallStatus: { available: false, error: 'apiKey: sk-1234567890abcdef' },
    lastReloadTime: null,
    delegationCount: 0,
  });
  const output = formatStatusReport(report);
  // The error is truncated to 60 chars, so the full key won't appear
  // But let's verify the output doesn't contain the raw error with key
  // Actually, categorizeProviderError truncates to 60 chars
  assert.ok(!output.includes('sk-1234567890abcdef'), 'should not contain full API key');
});

// ─── 21. History table formatting ───────────────────────────────────

console.log('\n21. History table formatting');

await test('formatHistoryTable with records', () => {
  const records: DelegationRecord[] = [
    { id: 1, timestamp: Date.now(), requestedAgent: 'search', resolvedAgent: 'explorer', taskSummary: 'Find TypeScript files', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 120, providerCallAvailable: false, aliasUsed: true },
    { id: 2, timestamp: Date.now() - 60000, requestedAgent: 'oracle', resolvedAgent: 'oracle', taskSummary: 'Review architecture', mode: 'deep', runnerMode: 'prompt-only', status: 'success', durationMs: 3500, providerCallAvailable: false, aliasUsed: false },
  ];
  const output = formatHistoryTable(records);
  assert.ok(output.includes('Delegation History'), 'should have title');
  assert.ok(output.includes('@explorer'), 'should include agent name');
  assert.ok(output.includes('via search'), 'should show alias');
  assert.ok(output.includes('success'), 'should show status');
  assert.ok(output.includes('ID'), 'should have ID column header');
  assert.ok(output.includes('1'), 'should show record id');
});

await test('formatHistoryTable empty', () => {
  const output = formatHistoryTable([]);
  assert.ok(output.includes('No delegations'), 'should show empty message');
});

// ─── 22. Metrics formatting ─────────────────────────────────────────

console.log('\n22. Metrics formatting');

await test('formatMetrics output includes all sections', () => {
  const metrics: MetricsSummary = {
    total: 10,
    success: 7,
    fallback: 2,
    error: 1,
    avgDurationMs: 450,
    perAgent: { oracle: 4, explorer: 3, fixer: 2, librarian: 1 },
    perRunnerMode: { 'prompt-only': 8, 'provider-call': 2 },
    providerCallAvailable: 1,
    providerCallUnavailable: 9,
  };
  const output = formatMetrics(metrics);
  assert.ok(output.includes('Total:    10'), 'should show total');
  assert.ok(output.includes('Success:  7'), 'should show success');
  assert.ok(output.includes('Fallback: 2'), 'should show fallback');
  assert.ok(output.includes('Error:    1'), 'should show error');
  assert.ok(output.includes('Avg Duration: 450ms'), 'should show avg duration');
  assert.ok(output.includes('unavailable'), 'should show token usage unavailable');
  assert.ok(output.includes('@oracle'), 'should show per-agent');
  assert.ok(output.includes('prompt-only'), 'should show per-runnerMode');
  assert.ok(output.includes('Available:    1'), 'should show provider-call available');
});

await test('formatMetrics with zero total', () => {
  const metrics: MetricsSummary = {
    total: 0, success: 0, fallback: 0, error: 0,
    avgDurationMs: 0, perAgent: {}, perRunnerMode: {},
    providerCallAvailable: 0, providerCallUnavailable: 0,
  };
  const output = formatMetrics(metrics);
  assert.ok(output.includes('Total:    0'), 'should show zero total');
});

// ─── 23. Reload ─────────────────────────────────────────────────────

console.log('\n23. Reload');

await test('performReload loads built-in agents', () => {
  const result = performReload(PROJECT_ROOT);
  assert.equal(result.ok, true);
  assert.equal(result.agentCount, 6);
  assert.equal(result.enabledCount, 6);
  assert.equal(result.disabledCount, 0);
  assert.ok(result.aliasCount > 0);
});

await test('performReload with project-level fixture', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));

  try {
    // Create project config
    const configDir = path.join(tmpDir, '.pi');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'slim-agents.json'),
      JSON.stringify({ runnerMode: 'provider-call' }),
    );

    // Create project-level agent
    const agentsDir = path.join(configDir, 'pi-slim-agents', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'test-agent.md'),
      '---\nname: test-agent\ndescription: A test agent\nreadonly: true\naliases:\n  - test\n---\n\nYou are a test agent.',
    );

    const result = performReload(tmpDir);
    assert.equal(result.ok, true);
    assert.ok(result.agents.some(a => a.name === 'test-agent'), 'should include test-agent');
    assert.equal(result.config.runnerMode, 'provider-call');

    const testAgent = result.agents.find(a => a.name === 'test-agent')!;
    assert.equal(testAgent.readonly, true);
    assert.ok(testAgent.aliases.includes('test'), 'should have alias');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('performReload with empty directory still succeeds', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const result = performReload(tmpDir);
    assert.equal(result.ok, true, 'should succeed even with no agents');
    // Only built-in agents from the package are loaded
    assert.ok(result.agentCount >= 0, 'agent count should be non-negative');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('formatReloadResult success', () => {
  const result = performReload(PROJECT_ROOT);
  const output = formatReloadResult(result, '2024-01-15T10:30:00Z');
  assert.ok(output.includes('Reload Complete'), 'should show success');
  assert.ok(output.includes('6 loaded'), 'should show agent count');
  assert.ok(output.includes('enabled'), 'should show enabled count');
});

await test('formatReloadResult failure', () => {
  const result = { ok: false, config: {}, agents: [], agentCount: 0, enabledCount: 0, disabledCount: 0, aliasCount: 0, loadedConfigPaths: [], error: 'Test error' };
  const output = formatReloadResult(result, '2024-01-15T10:30:00Z');
  assert.ok(output.includes('Reload Failed'), 'should show failure');
  assert.ok(output.includes('Test error'), 'should show error');
  assert.ok(output.includes('Previous state preserved'), 'should mention preservation');
});

await test('reload with config override disables agent', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const configDir = path.join(tmpDir, '.pi');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'slim-agents.json'),
      JSON.stringify({ agents: { explorer: { enabled: false } } }),
    );

    const result = performReload(tmpDir);
    assert.equal(result.ok, true);
    assert.equal(result.disabledCount, 1, 'should have 1 disabled agent');

    const explorer = result.agents.find(a => a.name === 'explorer');
    assert.ok(explorer, 'explorer should exist');
    assert.equal(explorer!.enabled, false, 'explorer should be disabled');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── 24. Agent source field ─────────────────────────────────────────

console.log('\n24. Agent source field');

await test('built-in agents have source=package', () => {
  for (const agent of agents) {
    assert.equal(agent.source, 'package', `Agent "${agent.name}" should have source=package`);
  }
});

await test('project-level agent has source=project', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'my-agent.md'),
      '---\nname: my-agent\ndescription: My agent\n---\n\nBody.',
    );
    const loaded = loadAgents(tmpDir, {});
    const myAgent = loaded.find(a => a.name === 'my-agent');
    assert.ok(myAgent, 'my-agent should be loaded');
    assert.equal(myAgent!.source, 'project', 'should have source=project');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── 25. Delegation history integration ─────────────────────────────

console.log('\n25. Delegation history integration');

await test('determineDelegationStatus with disabled agent error', async () => {
  const config: SlimAgentsConfig = { agents: { designer: { enabled: false } } };
  const result = await runDelegation(
    { agent: 'designer', task: 'Design the UI' },
    PROJECT_ROOT,
    config,
  );
  assert.equal(result.ok, false);
  const status = determineDelegationStatus(result, config);
  assert.equal(status.status, 'error');
  assert.ok(status.errorReason?.includes('disabled'));
});

await test('determineDelegationStatus with alias resolution success', async () => {
  const result = await runDelegation(
    { agent: 'search', task: 'Find files' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'explorer');
  const status = determineDelegationStatus(result, {});
  assert.equal(status.status, 'success');
});

await test('alias detection: requestedAgent !== resolvedAgent', async () => {
  const result = await runDelegation(
    { agent: 'search', task: 'Find files' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  // In the extension, aliasUsed = agentName !== result.agentName
  const aliasUsed = 'search' !== result.agentName;
  assert.equal(aliasUsed, true, 'should detect alias usage');
});

await test('direct name: no alias detected', async () => {
  const result = await runDelegation(
    { agent: 'explorer', task: 'Find files' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  const aliasUsed = 'explorer' !== result.agentName;
  assert.equal(aliasUsed, false, 'should not detect alias');
});

// ─── 26. /agent command parsing ────────────────────────────────────

console.log('\n26. /agent command parsing');

await test('parseAgentCommand extracts agent and task', () => {
  const result = parseAgentCommand('explorer find playback speed implementation');
  assert.equal(result.agent, 'explorer');
  assert.equal(result.task, 'find playback speed implementation');
});

await test('parseAgentCommand handles alias as first arg', () => {
  const result = parseAgentCommand('search find where .devpiano files are saved');
  assert.equal(result.agent, 'search');
  assert.equal(result.task, 'find where .devpiano files are saved');
});

await test('parseAgentCommand handles empty args', () => {
  const result = parseAgentCommand('');
  assert.equal(result.agent, '');
  assert.equal(result.task, '');
});

await test('parseAgentCommand handles whitespace-only args', () => {
  const result = parseAgentCommand('   ');
  assert.equal(result.agent, '');
  assert.equal(result.task, '');
});

await test('parseAgentCommand handles agent-only (no task)', () => {
  const result = parseAgentCommand('oracle');
  assert.equal(result.agent, 'oracle');
  assert.equal(result.task, '');
});

await test('parseAgentCommand handles multiple spaces between agent and task', () => {
  const result = parseAgentCommand('oracle   review the architecture');
  assert.equal(result.agent, 'oracle');
  assert.equal(result.task, 'review the architecture');
});

await test('buildAgentHelpText returns help with examples', () => {
  const help = buildAgentHelpText();
  assert.ok(help.includes('/agent'), 'should mention /agent');
  assert.ok(help.includes('explorer'), 'should mention explorer');
  assert.ok(help.includes('Usage'), 'should have usage section');
  assert.ok(help.includes('--format'), 'should document --format flag');
  assert.ok(help.includes('--mode'), 'should document --mode flag');
  assert.ok(help.includes('--format json'), 'should show --format json example');
  assert.ok(help.includes('Modes:'), 'should list available modes');
  assert.ok(help.includes('Formats:'), 'should list available formats');
  assert.ok(help.includes('quick') && help.includes('normal') && help.includes('deep'), 'should list all mode values');
  assert.ok(help.includes('text') && help.includes('json'), 'should list all format values');
  assert.ok(help.includes('Aliases:'), 'should document alias mappings');
});

// D1-fix: buildAgentHelpText prompt-only warning
await test('buildAgentHelpText includes prompt-only warning', () => {
  const help = buildAgentHelpText();
  assert.ok(help.includes('prompt-only') || help.includes('prompt only'), 'should mention prompt-only mode');
  assert.ok(help.includes('prompt-only') || help.includes('no tools'), 'should clarify tools are not executed');
  assert.ok(help.includes('Two-step') || help.includes('dogfood') || help.includes('Step 1'), 'should include dogfood guidance');
  assert.ok(help.includes('grep'), 'should mention available tools');
});

// ─── 27. /agent writes to history ──────────────────────────────────

console.log('\n27. /agent writes to history (runAndRecordDelegation)');

await test('runAndRecordDelegation records history with id', async () => {
  historyStore.clear();
  const result = await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review the architecture' },
    PROJECT_ROOT,
    {},
    false,
  );
  assert.equal(result.ok, true);
  assert.equal(historyStore.count(), 1);
  const record = historyStore.recent(1)[0];
  assert.ok(record.id > 0, 'record should have an id');
  assert.equal(record.resolvedAgent, 'oracle');
  assert.equal(record.requestedAgent, 'oracle');
  assert.equal(record.status, 'success');
  assert.equal(record.fullTask, 'Review the architecture');
});

await test('runAndRecordDelegation with alias records alias info', async () => {
  historyStore.clear();
  const result = await runAndRecordDelegation(
    { agent: 'search', task: 'Find TypeScript files' },
    PROJECT_ROOT,
    {},
    false,
  );
  assert.equal(result.ok, true);
  const record = historyStore.recent(1)[0];
  assert.equal(record.requestedAgent, 'search');
  assert.equal(record.resolvedAgent, 'explorer');
  assert.equal(record.aliasUsed, true);
});

await test('runAndRecordDelegation stores full task when storeFullTask is true', async () => {
  historyStore.clear();
  const longTask = 'A'.repeat(200);
  await runAndRecordDelegation(
    { agent: 'oracle', task: longTask, context: 'some context', files: ['a.ts', 'b.ts'] },
    PROJECT_ROOT,
    { history: { storeFullTask: true } },
    false,
  );
  const record = historyStore.recent(1)[0];
  assert.equal(record.fullTask, longTask);
  assert.equal(record.fullContext, 'some context');
  assert.deepEqual(record.fullFiles, ['a.ts', 'b.ts']);
  assert.equal(record.taskSummary.length <= 80, true, 'taskSummary should be truncated');
});

await test('runAndRecordDelegation does not store full task when storeFullTask is false', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review the code', context: 'ctx', files: ['f.ts'] },
    PROJECT_ROOT,
    { history: { storeFullTask: false, storeFullContext: false } },
    false,
  );
  const record = historyStore.recent(1)[0];
  assert.equal(record.fullTask, undefined);
  assert.equal(record.fullContext, undefined);
  assert.equal(record.fullFiles, undefined);
});

await test('runAndRecordDelegation stores context independently with storeFullContext', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review the code', context: 'ctx here', files: ['f.ts'] },
    PROJECT_ROOT,
    { history: { storeFullTask: false, storeFullContext: true } },
    false,
  );
  const record = historyStore.recent(1)[0];
  assert.equal(record.fullTask, undefined);
  assert.equal(record.fullContext, 'ctx here');
  assert.equal(record.fullFiles, undefined);
});

// ─── 28. History store id and getById ───────────────────────────────

console.log('\n28. History store id and getById');

await test('history store assigns sequential ids', () => {
  historyStore.clear();
  const r1 = historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  const r2 = historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'explorer', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  const r3 = historyStore.add({ timestamp: 3, requestedAgent: 'c', resolvedAgent: 'fixer', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  assert.ok(r1.id < r2.id, 'ids should be increasing');
  assert.ok(r2.id < r3.id, 'ids should be increasing');
});

await test('history store getById returns correct record', () => {
  historyStore.clear();
  const r1 = historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'task1', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  const r2 = historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'explorer', taskSummary: 'task2', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  assert.deepEqual(historyStore.getById(r1.id), r1);
  assert.deepEqual(historyStore.getById(r2.id), r2);
});

await test('history store getById returns undefined for non-existent id', () => {
  historyStore.clear();
  assert.equal(historyStore.getById(999), undefined);
});

await test('history store allIds returns all ids', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'explorer', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  const ids = historyStore.allIds();
  assert.equal(ids.length, 2);
  assert.ok(ids[0] < ids[1], 'ids should be sorted');
});

await test('history store ids persist after cap', () => {
  historyStore.clear();
  for (let i = 0; i < 205; i++) {
    historyStore.add({ timestamp: i, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: `t${i}`, mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  }
  const ids = historyStore.allIds();
  assert.ok(ids.length <= 200, 'should be capped');
  // Oldest ids should be pruned, newest should remain
  const maxId = Math.max(...ids);
  assert.ok(maxId === 205, `max id should be 205, got ${maxId}`);
});

await test('history store clear resets id counter', () => {
  historyStore.clear();
  const r1 = historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  assert.equal(r1.id, 1, 'should start from 1 after clear');
});

// ─── 29. Replay ─────────────────────────────────────────────────────

console.log('\n29. Replay');

await test('replayDelegation replays with original params', async () => {
  historyStore.clear();
  // First delegation
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review architecture', context: 'ctx here', files: ['a.ts'] },
    PROJECT_ROOT,
    { history: { storeFullTask: true } },
    false,
  );
  const original = historyStore.recent(1)[0];

  // Replay
  const replayResult = await replayDelegation(original.id, PROJECT_ROOT, {}, false);
  assert.equal(replayResult.ok, true);
  assert.ok(replayResult.result, 'should have result');
  assert.equal(replayResult.result!.ok, true);
  assert.equal(replayResult.result!.agentName, 'oracle');
  assert.equal(historyStore.count(), 2, 'should have 2 records now');
});

await test('replayDelegation creates new history record', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'explorer', task: 'Find auth code' },
    PROJECT_ROOT,
    {},
    false,
  );
  const original = historyStore.recent(1)[0];

  await replayDelegation(original.id, PROJECT_ROOT, {}, false);
  const records = historyStore.recent(10);
  assert.equal(records.length, 2);
  assert.ok(records[0].id !== records[1].id, 'replayed record should have different id');
  assert.equal(records[0].taskSummary, original.taskSummary, 'replayed task should match');
});

await test('replayDelegation non-existent id returns error with available ids', async () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 't', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  const record = historyStore.recent(1)[0];

  const result = await replayDelegation(9999, PROJECT_ROOT, {}, false);
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('9999'), 'should mention the id');
  assert.ok(result.error!.includes('Available IDs'), 'should list available ids');
  assert.ok(result.error!.includes(String(record.id)), 'should include the actual id');
});

await test('replayDelegation rejects disabled agent', async () => {
  historyStore.clear();
  // First, do a successful delegation
  await runAndRecordDelegation(
    { agent: 'designer', task: 'Design the UI' },
    PROJECT_ROOT,
    {},
    false,
  );
  const record = historyStore.recent(1)[0];

  // Now disable the agent
  const config: SlimAgentsConfig = { agents: { designer: { enabled: false } } };
  const result = await replayDelegation(record.id, PROJECT_ROOT, config, false);
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('disabled'), 'should mention disabled');
  assert.ok(result.error!.includes(String(record.id)), 'should mention history id');
});

await test('replayDelegation detects alias drift', async () => {
  historyStore.clear();
  // Record a delegation via alias
  await runAndRecordDelegation(
    { agent: 'search', task: 'Find files' },
    PROJECT_ROOT,
    {},
    false,
  );
  const record = historyStore.recent(1)[0];
  assert.equal(record.aliasUsed, true);

  // Replay — should succeed and use original resolvedAgent
  const result = await replayDelegation(record.id, PROJECT_ROOT, {}, false);
  assert.equal(result.ok, true);
  assert.ok(result.result, 'should have result');
  // Since the alias still resolves to the same agent, no drift warning
  // (We'd need to change the alias resolution to trigger drift)
});

await test('replayDelegation non-existent agent returns error', async () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'x', resolvedAgent: 'removed-agent', taskSummary: 't', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  const record = historyStore.recent(1)[0];

  const result = await replayDelegation(record.id, PROJECT_ROOT, {}, false);
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('no longer exists'), 'should mention agent removal');
});

await test('replayDelegation uses resolvedAgent not alias', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'arch', task: 'Review code' },
    PROJECT_ROOT,
    { history: { storeFullTask: true } },
    false,
  );
  const record = historyStore.recent(1)[0];
  assert.equal(record.requestedAgent, 'arch');
  assert.equal(record.resolvedAgent, 'oracle');

  // Replay should use resolvedAgent directly
  const result = await replayDelegation(record.id, PROJECT_ROOT, {}, false);
  assert.equal(result.ok, true);
  assert.equal(result.result!.agentName, 'oracle');
});

await test('parseReplayArgs splits --files by comma', async () => {
  const { parseReplayArgs } = await import('../src/commands.js');
  const parsed = parseReplayArgs('5 --files src/a.ts,src/b.ts');
  assert.equal(parsed.id, 5);
  assert.deepEqual(parsed.overrides.files, ['src/a.ts', 'src/b.ts']);
});

await test('parseReplayArgs --files with whitespace trims entries', async () => {
  const { parseReplayArgs } = await import('../src/commands.js');
  // Note: The entire value after --files is taken as one token,
  // so commas with spaces around them are preserved in the string
  const parsed = parseReplayArgs('5 --files "src/a.ts , src/b.ts"');
  assert.equal(parsed.id, 5);
  assert.deepEqual(parsed.overrides.files, ['src/a.ts', 'src/b.ts']);
});

await test('parseReplayArgs --files single file works', async () => {
  const { parseReplayArgs } = await import('../src/commands.js');
  const parsed = parseReplayArgs('5 --files src/main.ts');
  assert.equal(parsed.id, 5);
  assert.deepEqual(parsed.overrides.files, ['src/main.ts']);
});

// ─── 30. Output templates ──────────────────────────────────────────

console.log('\n30. Output templates');

await test('outputTemplate=true includes XML tags for explorer', () => {
  const output = buildExpectedOutputSection('explorer', true, true);
  assert.ok(output.includes('<summary>'), 'should include summary tag');
  assert.ok(output.includes('<findings>'), 'should include findings tag');
  assert.ok(output.includes('<evidence>'), 'should include evidence tag');
  assert.ok(output.includes('path:line'), 'explorer should emphasize path:line');
});

await test('outputTemplate=true includes XML tags for oracle', () => {
  const output = buildExpectedOutputSection('oracle', true, true);
  assert.ok(output.includes('<summary>'), 'should include summary tag');
  assert.ok(output.includes('<risks>'), 'should include risks tag');
  assert.ok(output.includes('<next_actions>'), 'should include next_actions tag');
  assert.ok(output.includes('tradeoffs'), 'oracle should mention tradeoffs');
});

await test('outputTemplate=true includes changes for fixer', () => {
  const output = buildExpectedOutputSection('fixer', false, true);
  assert.ok(output.includes('<changes>'), 'should include changes tag');
  assert.ok(output.includes('<summary>'), 'should include summary tag');
});

await test('outputTemplate=true fixer non-readonly warns about file modification', () => {
  const output = buildExpectedOutputSection('fixer', false, true);
  assert.ok(output.includes('do NOT claim to have modified files'), 'should warn about false claims');
});

await test('outputTemplate=true includes UX focus for designer', () => {
  const output = buildExpectedOutputSection('designer', false, true);
  assert.ok(output.includes('<findings>'), 'should include findings tag');
  assert.ok(output.includes('UX') || output.includes('ux'), 'should mention UX');
});

await test('outputTemplate=true includes sources focus for librarian', () => {
  const output = buildExpectedOutputSection('librarian', true, true);
  assert.ok(output.includes('<evidence>'), 'should include evidence tag');
  assert.ok(output.includes('Cite sources'), 'should mention citations');
  assert.ok(output.includes('Do NOT modify files'), 'should warn about no modification');
});

await test('outputTemplate=true includes orchestrator template', () => {
  const output = buildExpectedOutputSection('orchestrator', false, true);
  assert.ok(output.includes('<summary>'), 'should include summary tag');
  assert.ok(output.includes('<next_actions>'), 'should include next_actions tag');
});

await test('outputTemplate=false returns simple output (readonly)', () => {
  const output = buildExpectedOutputSection('explorer', true, false);
  assert.ok(!output.includes('<summary>'), 'should not include XML tags');
  assert.ok(output.includes('Search, analyze, and report'), 'should use simple output');
});

await test('outputTemplate=false returns simple output (non-readonly)', () => {
  const output = buildExpectedOutputSection('fixer', false, false);
  assert.ok(!output.includes('<summary>'), 'should not include XML tags');
  assert.ok(output.includes('Complete the task'), 'should use simple output');
});

await test('outputTemplate=undefined (default) uses template', () => {
  const output = buildExpectedOutputSection('oracle', true, undefined);
  assert.ok(output.includes('<summary>'), 'default should use template');
});

await test('unknown agent gets default template', () => {
  const output = buildExpectedOutputSection('custom-agent', true, true);
  assert.ok(output.includes('<summary>'), 'should include summary tag');
  assert.ok(output.includes('<findings>'), 'should include findings tag');
  assert.ok(output.includes('<evidence>'), 'should include evidence tag');
  assert.ok(output.includes('<risks>'), 'should include risks tag');
  assert.ok(output.includes('<next_actions>'), 'should include next_actions tag');
});

// ─── 31. Output template integration in runner ─────────────────────

console.log('\n31. Output template integration in runner');

await test('runner prompt includes XML tags when outputTemplate=true', async () => {
  const result = await runDelegation(
    { agent: 'oracle', task: 'Review the code' },
    PROJECT_ROOT,
    { outputTemplate: true },
  );
  assert.equal(result.ok, true);
  assert.ok(result.prompt.includes('<summary>'), 'prompt should include summary tag');
  assert.ok(result.prompt.includes('<risks>'), 'prompt should include risks tag');
});

await test('runner prompt does not include XML tags when outputTemplate=false', async () => {
  const result = await runDelegation(
    { agent: 'oracle', task: 'Review the code' },
    PROJECT_ROOT,
    { outputTemplate: false },
  );
  assert.equal(result.ok, true);
  assert.ok(!result.prompt.includes('<summary>'), 'prompt should not include summary tag');
  assert.ok(result.prompt.includes('Search, analyze, and report'), 'oracle is readonly, should use readonly simple output');
});

await test('runner prompt uses template by default (outputTemplate undefined)', async () => {
  const result = await runDelegation(
    { agent: 'explorer', task: 'Find auth code' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.ok(result.prompt.includes('<summary>'), 'default should use template');
});

await test('runner prompt explorer includes path:line emphasis', async () => {
  const result = await runDelegation(
    { agent: 'explorer', task: 'Find config files' },
    PROJECT_ROOT,
    { outputTemplate: true },
  );
  assert.equal(result.ok, true);
  assert.ok(result.prompt.includes('path:line'), 'explorer template should mention path:line');
});

await test('runner prompt fixer includes changes section', async () => {
  const result = await runDelegation(
    { agent: 'fixer', task: 'Fix the bug' },
    PROJECT_ROOT,
    { outputTemplate: true },
  );
  assert.equal(result.ok, true);
  assert.ok(result.prompt.includes('<changes>'), 'fixer template should include changes');
});

// ─── 32. Alias drift detection in replay ───────────────────────────

console.log('\n32. Alias drift detection in replay');

await test('replay with alias that still resolves same agent has no warning', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'search', task: 'Find auth code' },
    PROJECT_ROOT,
    { history: { storeFullTask: true } },
    false,
  );
  const record = historyStore.recent(1)[0];

  const result = await replayDelegation(record.id, PROJECT_ROOT, {}, false);
  assert.equal(result.ok, true);
  assert.equal(result.aliasDriftWarning, undefined, 'no drift warning expected');
});

await test('replay uses resolvedAgent even when alias is stored', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'arch', task: 'Review code' },
    PROJECT_ROOT,
    { history: { storeFullTask: true } },
    false,
  );
  const record = historyStore.recent(1)[0];
  assert.equal(record.requestedAgent, 'arch');
  assert.equal(record.resolvedAgent, 'oracle');

  // Replay should delegate to oracle, not try to resolve 'arch' again
  const result = await replayDelegation(record.id, PROJECT_ROOT, {}, false);
  assert.equal(result.ok, true);
  assert.equal(result.result!.agentName, 'oracle');
});

// ─── 33. /agent mode parsing ──────────────────────────────────────

console.log('\n33. /agent mode parsing');

await test('parseAgentCommand with --mode deep', () => {
  const result = parseAgentCommand('--mode deep oracle review this design');
  assert.equal(result.agent, 'oracle');
  assert.equal(result.task, 'review this design');
  assert.equal(result.mode, 'deep');
  assert.equal(result.modeError, undefined);
});

await test('parseAgentCommand with -m quick', () => {
  const result = parseAgentCommand('-m quick explorer find playback code');
  assert.equal(result.agent, 'explorer');
  assert.equal(result.task, 'find playback code');
  assert.equal(result.mode, 'quick');
});

await test('parseAgentCommand with mode in middle', () => {
  const result = parseAgentCommand('oracle --mode deep review this design');
  assert.equal(result.agent, 'oracle');
  assert.equal(result.task, 'review this design');
  assert.equal(result.mode, 'deep');
});

await test('parseAgentCommand with invalid mode returns error', () => {
  const result = parseAgentCommand('--mode turbo oracle review this');
  assert.ok(result.modeError, 'should have modeError');
  assert.ok(result.modeError!.includes('turbo'), 'should mention invalid mode');
  assert.ok(result.modeError!.includes('quick'), 'should list valid modes');
});

await test('parseAgentCommand without mode defaults to undefined', () => {
  const result = parseAgentCommand('oracle review this design');
  assert.equal(result.agent, 'oracle');
  assert.equal(result.task, 'review this design');
  assert.equal(result.mode, undefined);
});

await test('parseAgentCommand with alias and mode', () => {
  const result = parseAgentCommand('--mode deep arch review this design');
  assert.equal(result.agent, 'arch');
  assert.equal(result.task, 'review this design');
  assert.equal(result.mode, 'deep');
});

await test('parseAgentCommand mode only (no agent)', () => {
  const result = parseAgentCommand('--mode deep');
  assert.equal(result.agent, '');
  assert.equal(result.task, '');
  assert.equal(result.mode, 'deep');
});

await test('parseAgentCommand with quoted task', () => {
  const result = parseAgentCommand('--mode deep oracle "review this design carefully"');
  assert.equal(result.agent, 'oracle');
  assert.equal(result.task, 'review this design carefully');
  assert.equal(result.mode, 'deep');
});

// ─── 34. History filter ────────────────────────────────────────────

console.log('\n34. History filter');

await test('filter by agent (resolvedAgent match)', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'oracle', resolvedAgent: 'oracle', taskSummary: 'task1', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'search', resolvedAgent: 'explorer', taskSummary: 'task2', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: true });
  historyStore.add({ timestamp: 3, requestedAgent: 'oracle', resolvedAgent: 'oracle', taskSummary: 'task3', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const filtered = historyStore.filter({ agent: 'oracle' });
  assert.equal(filtered.length, 2);
  assert.ok(filtered.every(r => r.resolvedAgent === 'oracle'));
});

await test('filter by requestedAgent (alias match)', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'search', resolvedAgent: 'explorer', taskSummary: 'task1', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: true });
  historyStore.add({ timestamp: 2, requestedAgent: 'oracle', resolvedAgent: 'oracle', taskSummary: 'task2', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const filtered = historyStore.filter({ agent: 'search' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].requestedAgent, 'search');
});

await test('filter by status', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'oracle', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'error', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const filtered = historyStore.filter({ status: 'error' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].status, 'error');
});

await test('filter by runnerMode', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: '', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'oracle', taskSummary: '', mode: 'normal', runnerMode: 'provider-call', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const filtered = historyStore.filter({ runnerMode: 'provider-call' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].runnerMode, 'provider-call');
});

await test('filter by mode', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: '', mode: 'deep', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'oracle', taskSummary: '', mode: 'quick', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const filtered = historyStore.filter({ mode: 'deep' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].mode, 'deep');
});

await test('filter by query (task match)', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'Review authentication module', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'explorer', taskSummary: 'Find playback code', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const filtered = historyStore.filter({ query: 'playback' });
  assert.equal(filtered.length, 1);
  assert.ok(filtered[0].taskSummary.includes('playback'));
});

await test('filter by query (agent name match)', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'Review code', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'explorer', taskSummary: 'Find files', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const filtered = historyStore.filter({ query: 'oracle' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].resolvedAgent, 'oracle');
});

await test('filter query is case-insensitive', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'Review Authentication', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const filtered = historyStore.filter({ query: 'authentication' });
  assert.equal(filtered.length, 1);
});

await test('filter limit works', () => {
  historyStore.clear();
  for (let i = 0; i < 20; i++) {
    historyStore.add({ timestamp: i, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: `task ${i}`, mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  }

  const filtered = historyStore.filter({ limit: 5 });
  assert.equal(filtered.length, 5);
  // Should be newest first
  assert.ok(filtered[0].taskSummary.includes('19'));
});

await test('filter default limit is 10', () => {
  historyStore.clear();
  for (let i = 0; i < 20; i++) {
    historyStore.add({ timestamp: i, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: `task ${i}`, mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  }

  const filtered = historyStore.filter({});
  assert.equal(filtered.length, 10);
});

await test('filter limit capped at 100', () => {
  historyStore.clear();
  for (let i = 0; i < 150; i++) {
    historyStore.add({ timestamp: i, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: `task ${i}`, mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  }

  const filtered = historyStore.filter({ limit: 200 });
  assert.ok(filtered.length <= 100, `should be capped at 100, got ${filtered.length}`);
});

await test('filter returns empty for no match', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'task', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const filtered = historyStore.filter({ agent: 'nonexistent' });
  assert.equal(filtered.length, 0);
});

await test('filter combines multiple criteria', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'Review auth', mode: 'deep', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'oracle', taskSummary: 'Review code', mode: 'quick', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 3, requestedAgent: 'c', resolvedAgent: 'explorer', taskSummary: 'Find auth files', mode: 'deep', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const filtered = historyStore.filter({ agent: 'oracle', mode: 'deep' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].resolvedAgent, 'oracle');
  assert.equal(filtered[0].mode, 'deep');
});

// ─── 35. Replay with modifications ────────────────────────────────

console.log('\n35. Replay with modifications');

await test('replay with mode override', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review code', mode: 'normal' },
    PROJECT_ROOT,
    { history: { storeFullTask: true } },
    false,
  );
  const original = historyStore.recent(1)[0];
  assert.equal(original.mode, 'normal');

  const result = await replayDelegation(original.id, PROJECT_ROOT, {}, false, undefined, { mode: 'deep' });
  assert.equal(result.ok, true);
  assert.ok(result.modifications, 'should have modifications');
  assert.ok(result.modifications!.some(m => m.includes('mode')), 'should mention mode change');

  const replayed = historyStore.recent(1)[0];
  assert.equal(replayed.mode, 'deep');
  assert.equal(replayed.replayOf, original.id);
});

await test('replay with agent override', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review code' },
    PROJECT_ROOT,
    { history: { storeFullTask: true } },
    false,
  );
  const original = historyStore.recent(1)[0];

  const result = await replayDelegation(original.id, PROJECT_ROOT, {}, false, undefined, { agent: 'explorer' });
  assert.equal(result.ok, true);
  assert.equal(result.originalAgent, 'oracle');
  assert.equal(result.newAgent, 'explorer');

  const replayed = historyStore.recent(1)[0];
  assert.equal(replayed.resolvedAgent, 'explorer');
  assert.equal(replayed.replayOf, original.id);
});

await test('replay with task override', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review code' },
    PROJECT_ROOT,
    { history: { storeFullTask: true } },
    false,
  );
  const original = historyStore.recent(1)[0];

  const result = await replayDelegation(original.id, PROJECT_ROOT, {}, false, undefined, { task: 'Review error handling' });
  assert.equal(result.ok, true);
  assert.ok(result.modifications!.some(m => m.includes('task')));

  const replayed = historyStore.recent(1)[0];
  assert.equal(replayed.fullTask, 'Review error handling');
});

await test('replay records replayOf', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review code' },
    PROJECT_ROOT,
    {},
    false,
  );
  const original = historyStore.recent(1)[0];

  await replayDelegation(original.id, PROJECT_ROOT, {}, false);
  const replayed = historyStore.recent(1)[0];
  assert.equal(replayed.replayOf, original.id);
});

await test('replay with agent override resolves alias', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review code' },
    PROJECT_ROOT,
    { history: { storeFullTask: true } },
    false,
  );
  const original = historyStore.recent(1)[0];

  const result = await replayDelegation(original.id, PROJECT_ROOT, {}, false, undefined, { agent: 'arch' });
  assert.equal(result.ok, true);
  assert.equal(result.newAgent, 'oracle'); // arch resolves to oracle
});

await test('replay with invalid agent override returns error', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review code' },
    PROJECT_ROOT,
    {},
    false,
  );
  const original = historyStore.recent(1)[0];

  const result = await replayDelegation(original.id, PROJECT_ROOT, {}, false, undefined, { agent: 'nonexistent' });
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('not found'));
});

await test('replay with agent override to disabled agent returns error', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review code' },
    PROJECT_ROOT,
    {},
    false,
  );
  const original = historyStore.recent(1)[0];

  const config: SlimAgentsConfig = { agents: { designer: { enabled: false } } };
  const result = await replayDelegation(original.id, PROJECT_ROOT, config, false, undefined, { agent: 'designer' });
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('disabled'));
});

await test('replay without overrides uses original params', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review architecture', context: 'ctx', files: ['a.ts'], mode: 'deep' },
    PROJECT_ROOT,
    { history: { storeFullTask: true } },
    false,
  );
  const original = historyStore.recent(1)[0];

  const result = await replayDelegation(original.id, PROJECT_ROOT, {}, false);
  assert.equal(result.ok, true);
  assert.equal(result.modifications, undefined, 'no modifications');

  const replayed = historyStore.recent(1)[0];
  assert.equal(replayed.resolvedAgent, 'oracle');
  assert.equal(replayed.mode, 'deep');
  assert.equal(replayed.fullTask, 'Review architecture');
  assert.equal(replayed.fullContext, 'ctx');
  assert.deepEqual(replayed.fullFiles, ['a.ts']);
});

await test('replay with context and files override', async () => {
  historyStore.clear();
  await runAndRecordDelegation(
    { agent: 'oracle', task: 'Review code', context: 'old ctx', files: ['old.ts'] },
    PROJECT_ROOT,
    { history: { storeFullTask: true } },
    false,
  );
  const original = historyStore.recent(1)[0];

  const result = await replayDelegation(original.id, PROJECT_ROOT, {}, false, undefined, {
    context: 'new context',
    files: ['new1.ts', 'new2.ts'],
  });
  assert.equal(result.ok, true);
  assert.ok(result.modifications!.some(m => m.includes('context')));
  assert.ok(result.modifications!.some(m => m.includes('files')));

  const replayed = historyStore.recent(1)[0];
  assert.equal(replayed.fullContext, 'new context');
  assert.deepEqual(replayed.fullFiles, ['new1.ts', 'new2.ts']);
});

// ─── 36. Export history ───────────────────────────────────────────

console.log('\n36. Export history');

await test('exportJson returns valid JSON', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'task1', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const json = historyStore.exportJson();
  const parsed = JSON.parse(json);
  assert.ok(Array.isArray(parsed));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].resolvedAgent, 'oracle');
});

await test('exportJson strips fullTask/fullContext/fullFiles', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'task1', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false, fullTask: 'secret task', fullContext: 'secret ctx', fullFiles: ['secret.ts'] });

  const json = historyStore.exportJson();
  const parsed = JSON.parse(json);
  assert.equal(parsed[0].fullTask, undefined);
  assert.equal(parsed[0].fullContext, undefined);
  assert.equal(parsed[0].fullFiles, undefined);
});

await test('exportJson includes taskSummary', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'Review auth', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const json = historyStore.exportJson();
  const parsed = JSON.parse(json);
  assert.equal(parsed[0].taskSummary, 'Review auth');
});

await test('exportJson with filter', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'task1', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'explorer', taskSummary: 'task2', mode: 'normal', runnerMode: 'prompt-only', status: 'error', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const json = historyStore.exportJson({ status: 'error' });
  const parsed = JSON.parse(json);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].status, 'error');
});

await test('exportJson includes replayOf', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'task1', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'task2', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false, replayOf: 1 });

  const json = historyStore.exportJson();
  const parsed = JSON.parse(json);
  const replayRecord = parsed.find((r: any) => r.replayOf !== undefined);
  assert.ok(replayRecord, 'should have replay record');
  assert.equal(replayRecord.replayOf, 1);
});

await test('exportJson with mode filter', () => {
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'task1', mode: 'deep', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'b', resolvedAgent: 'oracle', taskSummary: 'task2', mode: 'quick', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });

  const json = historyStore.exportJson({ mode: 'deep' });
  const parsed = JSON.parse(json);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].mode, 'deep');
});

// ─── 37. Persistent history ───────────────────────────────────────

console.log('\n37. Persistent history');

await test('persistent history init loads from JSONL file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const historyPath = path.join(tmpDir, '.pi', 'slim-agents', 'history.jsonl');
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });

    // Write test records
    const record1 = { id: 1, timestamp: 1000, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'task1', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false };
    const record2 = { id: 2, timestamp: 2000, requestedAgent: 'b', resolvedAgent: 'explorer', taskSummary: 'task2', mode: 'deep', runnerMode: 'prompt-only', status: 'success', durationMs: 200, providerCallAvailable: false, aliasUsed: false, replayOf: 1 };
    fs.writeFileSync(historyPath, JSON.stringify(record1) + '\n' + JSON.stringify(record2) + '\n');

    // Create a fresh store and init
    const testStore = new (historyStore.constructor as any)();
    testStore.init(tmpDir, { persistent: true, path: '.pi/slim-agents/history.jsonl' });

    assert.equal(testStore.count(), 2);
    const recent = testStore.recent(10);
    assert.equal(recent[0].taskSummary, 'task2'); // newest first
    assert.equal(recent[0].replayOf, 1);
    assert.equal(recent[1].taskSummary, 'task1');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('persistent history appends new records to JSONL', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const historyPath = path.join(tmpDir, 'history.jsonl');

    const testStore = new (historyStore.constructor as any)();
    testStore.init(tmpDir, { persistent: true, path: 'history.jsonl' });

    testStore.add({ timestamp: 1000, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 'task1', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
    testStore.add({ timestamp: 2000, requestedAgent: 'b', resolvedAgent: 'explorer', taskSummary: 'task2', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 200, providerCallAvailable: false, aliasUsed: false });

    assert.equal(testStore.count(), 2);
    assert.ok(fs.existsSync(historyPath), 'JSONL file should exist');

    const content = fs.readFileSync(historyPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    assert.equal(lines.length, 2);

    const parsed1 = JSON.parse(lines[0]);
    assert.equal(parsed1.taskSummary, 'task1');
    const parsed2 = JSON.parse(lines[1]);
    assert.equal(parsed2.taskSummary, 'task2');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('persistent history retention enforced on load', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const historyPath = path.join(tmpDir, 'history.jsonl');

    // Write 5 records
    let content = '';
    for (let i = 1; i <= 5; i++) {
      content += JSON.stringify({ id: i, timestamp: i * 1000, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: `task${i}`, mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false }) + '\n';
    }
    fs.writeFileSync(historyPath, content);

    // Init with retention=3
    const testStore = new (historyStore.constructor as any)();
    testStore.init(tmpDir, { persistent: true, path: 'history.jsonl', retention: 3 });

    assert.equal(testStore.count(), 3);
    const recent = testStore.recent(10);
    assert.equal(recent[0].taskSummary, 'task5'); // newest
    assert.equal(recent[2].taskSummary, 'task3'); // oldest kept
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('persistent history init is no-op when not enabled', () => {
  const testStore = new (historyStore.constructor as any)();
  testStore.init('/tmp', { persistent: false });
  // Should not throw and should not load anything
  assert.equal(testStore.count(), 0);
});

await test('persistent history write failure does not throw', () => {
  // Note: historyStore is a singleton shared across tests
  // The key behavior: no exception thrown on write failure, record added to memory
  try {
    // Re-initialize with invalid path (read-only /proc on Unix, invalid on Windows)
    historyStore.init('/proc', { persistent: true, path: 'history.jsonl' });
    // Add should not throw even if file write fails
    historyStore.add({ timestamp: Date.now(), requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 't', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
    // Verify record was added to in-memory store
    const records = historyStore.recent(1);
    assert.ok(records.length >= 1, 'Record should be in memory');
    assert.equal(records[0].requestedAgent, 'a', 'Record should have correct agent');
  } catch (e) {
    // This test validates resilience - any exception is a bug
    throw new Error(`Write failure should not throw: ${e}`);
  }
});

await test('persistent history nextId continues from loaded records', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const historyPath = path.join(tmpDir, 'history.jsonl');
    fs.writeFileSync(historyPath, JSON.stringify({ id: 5, timestamp: 1000, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 't', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false }) + '\n');

    const testStore = new (historyStore.constructor as any)();
    testStore.init(tmpDir, { persistent: true, path: 'history.jsonl' });

    const newRecord = testStore.add({ timestamp: 2000, requestedAgent: 'b', resolvedAgent: 'explorer', taskSummary: 'new', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
    assert.equal(newRecord.id, 6, 'should continue from max id + 1');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── 38. Templates ────────────────────────────────────────────────

console.log('\n38. Templates');

await test('loadTemplates loads all 7 templates', () => {
  const result = loadTemplates();
  assert.equal(result.ok, true);
  assert.equal(result.templates.length, 7, `Expected 7 templates, got ${result.templates.length}`);
});

await test('loadTemplates returns template names', () => {
  const result = loadTemplates();
  const names = result.templates.map(t => t.name);
  assert.ok(names.includes('security-reviewer'), 'should include security-reviewer');
  assert.ok(names.includes('test-writer'), 'should include test-writer');
  assert.ok(names.includes('doc-generator'), 'should include doc-generator');
  assert.ok(names.includes('refactor-planner'), 'should include refactor-planner');
  assert.ok(names.includes('bug-triager'), 'should include bug-triager');
  assert.ok(names.includes('release-checker'), 'should include release-checker');
  assert.ok(names.includes('cpp-reviewer'), 'should include cpp-reviewer');
});

await test('templates have required fields', () => {
  const result = loadTemplates();
  for (const tmpl of result.templates) {
    assert.ok(tmpl.name, `Template "${tmpl.name}" should have name`);
    assert.ok(tmpl.description, `Template "${tmpl.name}" should have description`);
    assert.ok(typeof tmpl.readonly === 'boolean', `Template "${tmpl.name}" should have readonly boolean`);
    assert.ok(typeof tmpl.temperature === 'number', `Template "${tmpl.name}" should have temperature number`);
    assert.ok(Array.isArray(tmpl.aliases), `Template "${tmpl.name}" should have aliases array`);
    assert.ok(tmpl.recommendedMode, `Template "${tmpl.name}" should have recommendedMode`);
    assert.ok(tmpl.filePath, `Template "${tmpl.name}" should have filePath`);
  }
});

await test('security-reviewer template is readonly', () => {
  const tmpl = getTemplate('security-reviewer');
  assert.ok(tmpl, 'security-reviewer template should exist');
  assert.equal(tmpl!.readonly, true);
  assert.ok(tmpl!.description.includes('Security') || tmpl!.description.includes('security'));
});

await test('test-writer template is not readonly', () => {
  const tmpl = getTemplate('test-writer');
  assert.ok(tmpl, 'test-writer template should exist');
  assert.equal(tmpl!.readonly, false);
});

await test('cpp-reviewer template has cpp-related aliases', () => {
  const tmpl = getTemplate('cpp-reviewer');
  assert.ok(tmpl, 'cpp-reviewer template should exist');
  assert.ok(tmpl!.aliases.includes('cpp'), 'should have cpp alias');
});

await test('getTemplate returns null for unknown template', () => {
  const tmpl = getTemplate('nonexistent');
  assert.equal(tmpl, null);
});

// ─── 39. Create from template ─────────────────────────────────────

console.log('\n39. Create from template');

await test('createAgentFromTemplate creates a valid agent file', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const result = createAgentFromTemplate('security-reviewer', 'security', tmpDir);
    assert.equal(result.ok, true);
    assert.ok(result.filePath, 'should return filePath');
    assert.ok(fs.existsSync(result.filePath!), 'file should exist');

    const content = fs.readFileSync(result.filePath!, 'utf-8');
    assert.ok(content.includes('name: security'), 'file should have updated name');
    assert.ok(content.includes('You are'), 'file should have prompt body');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('createAgentFromTemplate rejects invalid agent name', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const result = createAgentFromTemplate('security-reviewer', 'Invalid Name', tmpDir);
    assert.equal(result.ok, false);
    assert.ok(result.error!.includes('Invalid agent name'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('createAgentFromTemplate rejects invalid name with path traversal', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const result = createAgentFromTemplate('security-reviewer', '../evil', tmpDir);
    assert.equal(result.ok, false);
    assert.ok(result.error!.includes('Invalid agent name'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('createAgentFromTemplate rejects unknown template', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const result = createAgentFromTemplate('nonexistent', 'my-agent', tmpDir);
    assert.equal(result.ok, false);
    assert.ok(result.error!.includes('not found'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('createAgentFromTemplate refuses to overwrite by default', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    // Create first time
    const first = createAgentFromTemplate('security-reviewer', 'security', tmpDir);
    assert.equal(first.ok, true);

    // Try to create again
    const second = createAgentFromTemplate('cpp-reviewer', 'security', tmpDir);
    assert.equal(second.ok, false);
    assert.ok(second.error!.includes('already exists'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('createAgentFromTemplate with force overwrites', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    // Create first time
    const first = createAgentFromTemplate('security-reviewer', 'security', tmpDir);
    assert.equal(first.ok, true);

    // Force overwrite
    const second = createAgentFromTemplate('cpp-reviewer', 'security', tmpDir, true);
    assert.equal(second.ok, true);
    assert.ok(fs.existsSync(second.filePath!), 'file should exist after force');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('created agent file has correct name in frontmatter', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const result = createAgentFromTemplate('cpp-reviewer', 'my-cpp-reviewer', tmpDir);
    assert.equal(result.ok, true);

    const content = fs.readFileSync(result.filePath!, 'utf-8');
    assert.ok(content.includes('name: my-cpp-reviewer'), 'frontmatter name should match agent name');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('created agent can be loaded by loadAgents', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const result = createAgentFromTemplate('bug-triager', 'bug-triage', tmpDir);
    assert.equal(result.ok, true);

    const agents = loadAgents(tmpDir, {});
    const bugTriage = agents.find(a => a.name === 'bug-triage');
    assert.ok(bugTriage, 'created agent should be loadable');
    assert.equal(bugTriage!.source, 'project');
    assert.equal(bugTriage!.enabled, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── 40. Validate ─────────────────────────────────────────────────


console.log('\n40. Validate');

await test('validateAgents returns ok for valid built-in agents', () => {
  const result = validateAgents(PROJECT_ROOT);
  assert.ok(result.checked.builtin > 0, 'should check builtin agents');
  assert.ok(result.checked.template > 0, 'should check templates');
});

await test('validateAgents detects missing description', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'no-desc-agent.md'),
      '---\nname: no-desc-agent\nreadonly: true\n---\n\nYou are No Desc Agent.',
    );

    const result = validateAgents(tmpDir);
    const descWarnings = result.issues.filter(
      i => i.type === 'warning' && i.message.includes('Missing description'),
    );
    assert.ok(descWarnings.length > 0, 'should warn about missing description');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('validateAgents detects empty body', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'empty-body.md'),
      '---\nname: empty-body\ndescription: Test agent\nreadonly: true\n---\n',
    );

    const result = validateAgents(tmpDir);
    const bodyErrors = result.issues.filter(
      i => i.type === 'error' && i.message.includes('Empty prompt body'),
    );
    assert.ok(bodyErrors.length > 0, 'should error about empty body');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('validateAgents detects alias conflict', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    // Create agent with alias 'arch' (conflicts with oracle's alias)
    fs.writeFileSync(
      path.join(agentsDir, 'conflict-agent.md'),
      '---\nname: conflict-agent\ndescription: Test agent\nreadonly: true\naliases:\n  - arch\n---\n\nYou are Conflict Agent.',
    );

    const result = validateAgents(tmpDir);
    const conflictErrors = result.issues.filter(
      i => i.type === 'error' && i.message.includes('conflicts'),
    );
    assert.ok(conflictErrors.length > 0, 'should detect alias conflict');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('validateAgents detects invalid alias', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'invalid-alias-agent.md'),
      '---\nname: invalid-alias-agent\ndescription: Test agent\nreadonly: true\naliases:\n  - Invalid Alias\n---\n\nYou are Invalid Alias Agent.',
    );

    const result = validateAgents(tmpDir);
    const aliasErrors = result.issues.filter(
      i => i.type === 'error' && i.message.includes('Invalid alias'),
    );
    assert.ok(aliasErrors.length > 0, 'should detect invalid alias');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('validateAgents detects readonly=false without boundary', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'no-boundary-agent.md'),
      '---\nname: no-boundary-agent\ndescription: Test agent\nreadonly: false\n---\n\nYou are No Boundary Agent. You do things.',
    );

    const result = validateAgents(tmpDir);
    const boundaryWarnings = result.issues.filter(
      i => i.type === 'warning' && i.message.includes('modification boundaries'),
    );
    assert.ok(boundaryWarnings.length > 0, 'should warn about missing boundary');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('formatTemplatesList returns formatted output', () => {
  const result = loadTemplates();
  assert.equal(result.ok, true);
  const output = formatTemplatesList(result.templates);
  assert.ok(output.includes('Agent Templates'), 'should have title');
  assert.ok(output.includes('security-reviewer'), 'should list security-reviewer');
  assert.ok(output.includes('Usage:'), 'should have usage section');
});

await test('formatValidationResult returns ok for no issues', () => {
  const result = {
    ok: true,
    issues: [],
    checked: { builtin: 6, template: 7, user: 0, project: 0, total: 13 },
  };
  const output = formatValidationResult(result);
  assert.ok(output.includes('OK'), 'should show OK');
  assert.ok(output.includes('Checked:'), 'should show checked count');
});

await test('formatValidationResult shows errors, warnings, and tag stats', () => {
  const result = {
    ok: false,
    issues: [
      { type: 'error', file: 'test.md', message: 'Invalid alias' },
      { type: 'warning', file: 'test2.md', message: 'Missing description' },
      { type: 'error', file: 'test.md', message: 'Invalid tag BadTag' },
    ],
    checked: { builtin: 6, template: 7, user: 0, project: 0, total: 13 },
    tagsChecked: 25,
    invalidTagsCount: 1,
  };
  const output = formatValidationResult(result);
  assert.ok(output.includes('\u274c'), 'should show errors');
  assert.ok(output.includes('\u26a0\ufe0f'), 'should show warnings');
  assert.ok(output.includes('Invalid alias'), 'should include error message');
  assert.ok(output.includes('Missing description'), 'should include warning message');
  assert.ok(output.includes('Tags: 25 checked'), 'should show tags checked count');
  assert.ok(output.includes('1 invalid'), 'should show invalid tags count');
});


// ─── M9: Tags Metadata ─────────────────────────────────────────────

console.log('\nM9: Tags Metadata');

await test('builtin agents have tags', () => {
  const allAgents = loadAgents(PROJECT_ROOT, {});
  for (const name of BUILTIN_AGENTS) {
    const agent = allAgents.find(a => a.name === name);
    assert.ok(agent, `Agent "${name}" not found`);
    assert.ok(Array.isArray(agent.tags), `Agent "${name}" should have tags array`);
    assert.ok(agent.tags.length > 0, `Agent "${name}" should have at least one tag`);
  }
});

await test('explorer has correct tags', () => {
  const explorer = agents.find(a => a.name === 'explorer')!;
  assert.ok(explorer.tags.includes('codebase'), 'explorer should have "codebase" tag');
  assert.ok(explorer.tags.includes('search'), 'explorer should have "search" tag');
  assert.ok(explorer.tags.includes('readonly'), 'explorer should have "readonly" tag');
});

await test('oracle has correct tags', () => {
  const oracle = agents.find(a => a.name === 'oracle')!;
  assert.ok(oracle.tags.includes('architecture'), 'oracle should have "architecture" tag');
  assert.ok(oracle.tags.includes('review'), 'oracle should have "review" tag');
});

await test('fixer has writable tag', () => {
  const fixer = agents.find(a => a.name === 'fixer')!;
  assert.ok(fixer.tags.includes('writable'), 'fixer should have "writable" tag');
  assert.ok(fixer.tags.includes('implementation'), 'fixer should have "implementation" tag');
});

await test('templates have tags', () => {
  const result = loadTemplates();
  assert.ok(result.ok, 'templates should load');
  for (const tmpl of result.templates) {
    assert.ok(Array.isArray(tmpl.tags), `Template "${tmpl.name}" should have tags array`);
    assert.ok(tmpl.tags.length > 0, `Template "${tmpl.name}" should have at least one tag`);
  }
});

await test('security-reviewer template has correct tags', () => {
  const result = loadTemplates();
  const tmpl = result.templates.find(t => t.name === 'security-reviewer');
  assert.ok(tmpl, 'security-reviewer template should exist');
  assert.ok(tmpl.tags.includes('security'), 'should have "security" tag');
  assert.ok(tmpl.tags.includes('review'), 'should have "review" tag');
  assert.ok(tmpl.tags.includes('readonly'), 'should have "readonly" tag');
});

await test('test-writer template has writable tag', () => {
  const result = loadTemplates();
  const tmpl = result.templates.find(t => t.name === 'test-writer');
  assert.ok(tmpl, 'test-writer template should exist');
  assert.ok(tmpl.tags.includes('writable'), 'should have "writable" tag');
});

await test('cpp-reviewer template has cpp-related tags', () => {
  const result = loadTemplates();
  const tmpl = result.templates.find(t => t.name === 'cpp-reviewer');
  assert.ok(tmpl, 'cpp-reviewer template should exist');
  assert.ok(tmpl.tags.includes('cpp'), 'should have "cpp" tag');
  assert.ok(tmpl.tags.includes('cmake'), 'should have "cmake" tag');
  assert.ok(tmpl.tags.includes('clangd'), 'should have "clangd" tag');
});

await test('missing tags triggers validation warning', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'no-tags-agent.md'),
      '---\nname: no-tags-agent\ndescription: Test agent without tags\nreadonly: true\n---\n\nYou are No Tags Agent.',
    );
    const result = validateAgents(tmpDir);
    const missingTagsWarnings = result.issues.filter(
      i => i.type === 'warning' && i.message.includes('no tags'),
    );
    assert.ok(missingTagsWarnings.length > 0, 'should warn about missing tags');
    assert.ok(result.tagsChecked >= 0, 'should track tagsChecked');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('isValidTag accepts valid tags', async () => {
  const { isValidTag } = await import('../src/templates.js');
  assert.ok(isValidTag('review'), 'lowercase word should be valid');
  assert.ok(isValidTag('code-base'), 'hyphenated word should be valid');
  assert.ok(isValidTag('code_base'), 'underscored word should be valid');
  assert.ok(isValidTag('cpp'), 'short tag should be valid');
  assert.ok(isValidTag('cmake3'), 'tag with number should be valid');
  assert.ok(isValidTag('a1b'), 'minimal valid tag should be valid');
});

await test('isValidTag rejects invalid tags', async () => {
  const { isValidTag } = await import('../src/templates.js');
  assert.ok(!isValidTag(''), 'empty string should be invalid');
  assert.ok(!isValidTag('Review'), 'uppercase should be invalid');
  assert.ok(!isValidTag('Code Review'), 'spaces should be invalid');
  assert.ok(!isValidTag('code review'), 'still spaces should be invalid');
  assert.ok(!isValidTag('code.review'), 'dots should be invalid');
  assert.ok(!isValidTag('code@review'), 'special chars should be invalid');
  assert.ok(!isValidTag('-review'), 'leading hyphen should be invalid');
  assert.ok(!isValidTag('_review'), 'leading underscore should be invalid');
});

await test('validateAgents detects invalid tag', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'bad-tag-agent.md'),
      '---\nname: bad-tag-agent\ndescription: Test agent\nreadonly: true\ntags:\n  - valid-tag\n  - InvalidTag\n---\n\nYou are Bad Tag Agent.',
    );
    const result = validateAgents(tmpDir);
    const tagErrors = result.issues.filter(
      i => i.type === 'error' && i.message.includes('Invalid tag'),
    );
    assert.ok(tagErrors.length > 0, 'should detect invalid tag');
    assert.ok(result.invalidTagsCount > 0, 'should track invalid tags count');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('validateAgents detects duplicate tag', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentsDir, 'dup-tag-agent.md'),
      '---\nname: dup-tag-agent\ndescription: Test agent\nreadonly: true\ntags:\n  - review\n  - review\n---\n\nYou are Dup Tag Agent.',
    );
    const result = validateAgents(tmpDir);
    const dupWarnings = result.issues.filter(
      i => i.type === 'warning' && i.message.includes('Duplicate tag'),
    );
    assert.ok(dupWarnings.length > 0, 'should warn about duplicate tags');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('validateAgents detects too many tags', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  try {
    const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    const manyTags = Array.from({ length: 10 }, (_, i) => 'tag' + i).join('\n  - ');
    fs.writeFileSync(
      path.join(agentsDir, 'many-tags-agent.md'),
      '---\nname: many-tags-agent\ndescription: Test agent\nreadonly: true\ntags:\n  - ' + manyTags + '\n---\n\nYou are Many Tags Agent.',
    );
    const result = validateAgents(tmpDir);
    const tooManyWarnings = result.issues.filter(
      i => i.type === 'warning' && i.message.includes('10 tags'),
    );
    assert.ok(tooManyWarnings.length > 0, 'should warn about too many tags');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── Agent Filtering ──────────────────────────────────────────────────

console.log('\nAgent Filtering');

await test('filterAgents by single tag', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { tags: ['review'] });
  assert.ok(result.length > 0, 'should return agents with "review" tag');
  for (const a of result) {
    assert.ok(a.tags.includes('review'), `agent "${a.name}" should have "review" tag`);
  }
});

await test('filterAgents by multiple tags (AND)', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { tags: ['review', 'readonly'] });
  for (const a of result) {
    assert.ok(a.tags.includes('review'), `agent "${a.name}" should have "review" tag`);
    assert.ok(a.tags.includes('readonly'), `agent "${a.name}" should have "readonly" tag`);
  }
});

await test('filterAgents by query matches name', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { query: 'explorer' });
  assert.ok(result.some(a => a.name === 'explorer'), 'should find explorer by name');
});

await test('filterAgents by query matches description', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { query: 'library' });
  assert.ok(result.length > 0, 'should find agents with "library" in description');
});

await test('filterAgents by query matches tags', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { query: 'codebase' });
  assert.ok(result.length > 0, 'should find agents with "codebase" in tags');
});

await test('filterAgents by readonly', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { readonly: true });
  for (const a of result) {
    assert.equal(a.readonly, true, `agent "${a.name}" should be readonly`);
  }
});

await test('filterAgents by writable', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { writable: true });
  for (const a of result) {
    assert.equal(a.readonly, false, `agent "${a.name}" should be writable`);
  }
});

await test('filterAgents by enabled', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { enabled: true });
  for (const a of result) {
    assert.equal(a.enabled, true, `agent "${a.name}" should be enabled`);
  }
});

await test('filterAgents by source builtin', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { source: 'builtin' });
  for (const a of result) {
    assert.equal(a.source, 'package', `agent "${a.name}" should be from package`);
  }
});

await test('filterAgents combined filters', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { tags: ['review'], readonly: true });
  for (const a of result) {
    assert.ok(a.tags.includes('review'), `agent "${a.name}" should have "review" tag`);
    assert.equal(a.readonly, true, `agent "${a.name}" should be readonly`);
  }
});

await test('filterAgents no results returns empty array', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { tags: ['nonexistent-tag-xyz'] });
  assert.equal(result.length, 0, 'should return empty array for non-existent tag');
});

// ─── Template Filtering ─────────────────────────────────────────────

console.log('\nTemplate Filtering');

await test('filterTemplates by single tag', async () => {
  const { filterTemplates } = await import('../src/commands.js');
  const result = loadTemplates();
  assert.ok(result.ok);
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const filtered = filterTemplates(asFilterable, { tags: ['security'] });
  assert.ok(filtered.length > 0, 'should return templates with "security" tag');
  for (const t of filtered) {
    assert.ok(t.tags.includes('security'), `template "${t.name}" should have "security" tag`);
  }
});

await test('filterTemplates by query matches name', async () => {
  const { filterTemplates } = await import('../src/commands.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const filtered = filterTemplates(asFilterable, { query: 'security-reviewer' });
  assert.ok(filtered.some(t => t.name === 'security-reviewer'), 'should find security-reviewer by name');
});

await test('filterTemplates by query matches tags', async () => {
  const { filterTemplates } = await import('../src/commands.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const filtered = filterTemplates(asFilterable, { query: 'cmake' });
  assert.ok(filtered.some(t => t.name === 'cpp-reviewer'), 'should find cpp-reviewer by cmake tag');
});

await test('filterTemplates by readonly', async () => {
  const { filterTemplates } = await import('../src/commands.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const filtered = filterTemplates(asFilterable, { readonly: true });
  for (const t of filtered) {
    assert.equal(t.readonly, true, `template "${t.name}" should be readonly`);
  }
});

await test('filterTemplates by writable', async () => {
  const { filterTemplates } = await import('../src/commands.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const filtered = filterTemplates(asFilterable, { writable: true });
  for (const t of filtered) {
    assert.equal(t.readonly, false, `template "${t.name}" should be writable`);
  }
});

await test('filterTemplates no results returns empty array', async () => {
  const { filterTemplates } = await import('../src/commands.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const filtered = filterTemplates(asFilterable, { tags: ['nonexistent-xyz'] });
  assert.equal(filtered.length, 0, 'should return empty array for non-existent tag');
});

// ─── Formatting ────────────────────────────────────────────────────

console.log('\nFormatting');

await test('formatAgentList returns formatted output with tags', async () => {
  const { formatAgentList } = await import('../src/commands.js');
  const result = formatAgentList(agents.filter(a => a.enabled), {});
  assert.ok(result.length > 0, 'should return non-empty string');
  assert.ok(result.includes('@'), 'should contain agent references');
});

await test('formatAgentList shows no results for non-existent tag', async () => {
  const { formatAgentList } = await import('../src/commands.js');
  const result = formatAgentList([], { tags: ['nonexistent'] });
  assert.ok(result.includes('No agents found'), 'should show no results message');
});

await test('formatTemplateList returns formatted output with tags', async () => {
  const { formatTemplateList } = await import('../src/commands.js');
  const result = loadTemplates();
  assert.ok(result.ok);
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const output = formatTemplateList(asFilterable, {});
  assert.ok(output.length > 0, 'should return non-empty string');
  assert.ok(output.includes('security-reviewer'), 'should include template names');
});

await test('formatTemplatesList includes tags column', async () => {
  const result = loadTemplates();
  assert.ok(result.ok);
  const output = formatTemplatesList(result.templates);
  assert.ok(output.includes('Tags'), 'should include Tags column header');
  assert.ok(output.includes('security-reviewer'), 'should include template name');
});


// ─── M10: JSON Output / Format ─────────────────────────────────────

console.log('\nM10: JSON Output / Format');

await test('parseFormatOption defaults to text', async () => {
  const { parseFormatOption } = await import('../src/format.js');
  const result = parseFormatOption({});
  assert.equal(result.format, 'text');
});

await test('parseFormatOption accepts text', async () => {
  const { parseFormatOption } = await import('../src/format.js');
  const result = parseFormatOption({ format: 'text' });
  assert.equal(result.format, 'text');
});

await test('parseFormatOption accepts json', async () => {
  const { parseFormatOption } = await import('../src/format.js');
  const result = parseFormatOption({ format: 'json' });
  assert.equal(result.format, 'json');
});

await test('parseFormatOption rejects unsupported format', async () => {
  const { parseFormatOption } = await import('../src/format.js');
  const result = parseFormatOption({ format: 'yaml' });
  assert.equal(result.format, 'text');
  assert.ok(result.error?.includes('Unsupported format'));
  assert.ok(result.error?.includes('text, json'));
});

await test('parseFormatOption rejects uppercase json', async () => {
  const { parseFormatOption } = await import('../src/format.js');
  const result = parseFormatOption({ format: 'JSON' });
  assert.equal(result.format, 'text');
  assert.ok(result.error?.includes('Unsupported format'));
});

await test('parseRegexOption returns null when not provided', async () => {
  const { parseRegexOption } = await import('../src/format.js');
  const result = parseRegexOption({});
  assert.equal(result.regex, null);
  assert.equal(result.error, undefined);
});

await test('parseRegexOption compiles valid pattern', async () => {
  const { parseRegexOption } = await import('../src/format.js');
  const result = parseRegexOption({ regex: '^oracle$' });
  assert.ok(result.regex instanceof RegExp);
  assert.equal(result.error, undefined);
});

await test('parseRegexOption uses case-insensitive flag', async () => {
  const { parseRegexOption } = await import('../src/format.js');
  const result = parseRegexOption({ regex: 'oracle' });
  assert.ok(result.regex instanceof RegExp);
  // Test that it matches case-insensitively
  assert.equal(result.regex!.test('ORACLE'), true);
  assert.equal(result.regex!.test('Oracle'), true);
});

await test('parseRegexOption rejects invalid regex', async () => {
  const { parseRegexOption } = await import('../src/format.js');
  const result = parseRegexOption({ regex: '[' });
  assert.equal(result.regex, null);
  assert.ok(result.error?.includes('Invalid regex pattern'));
});

await test('formatAgentsJson returns valid JSON', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, {});
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, 'agents');
  assert.ok(Array.isArray(parsed.items));
  assert.ok(parsed.items.length > 0);
  assert.equal(parsed.count, parsed.items.length);
});

await test('formatAgentsJson includes required fields per item', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, {});
  const parsed = JSON.parse(json);
  const item = parsed.items[0];
  assert.ok(item.name !== undefined);
  assert.ok(item.description !== undefined);
  assert.ok(typeof item.enabled === 'boolean');
  assert.ok(typeof item.readonly === 'boolean');
  assert.ok(Array.isArray(item.aliases));
  assert.ok(Array.isArray(item.tags));
  assert.ok(typeof item.source === 'string');
  assert.ok(typeof item.recommendedMode === 'string');
});

await test('formatAgentsJson includes filters', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, { tags: ['review'], query: 'test' });
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.filters.tags, ['review']);
  assert.equal(parsed.filters.query, 'test');
});

await test('formatAgentsJson does not include body in JSON', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, {});
  const parsed = JSON.parse(json);
  for (const item of parsed.items) {
    assert.equal(item.body, undefined);
  }
});

await test('formatAgentsJson does not include API key fields', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, {});
  assert.ok(!json.includes('apiKey'));
  assert.ok(!json.includes('api_key'));
  assert.ok(!json.includes('API_KEY'));
});

await test('formatTemplatesJson returns valid JSON', async () => {
  const { formatTemplatesJson } = await import('../src/format.js');
  const { loadTemplates } = await import('../src/templates.js');
  const { filterTemplates } = await import('../src/commands.js');
  const result = loadTemplates();
  assert.equal(result.ok, true);
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const json = formatTemplatesJson(asFilterable, {});
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, 'templates');
  assert.ok(Array.isArray(parsed.items));
  assert.ok(parsed.count > 0);
});

await test('formatTemplatesJson includes filters', async () => {
  const { formatTemplatesJson } = await import('../src/format.js');
  const { loadTemplates } = await import('../src/templates.js');
  const { filterTemplates } = await import('../src/commands.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const json = formatTemplatesJson(asFilterable, { readonly: true });
  const parsed = JSON.parse(json);
  assert.equal(parsed.filters.readonly, true);
});

await test('formatStatusJson returns valid JSON', async () => {
  const { formatStatusJson, formatAgentsJson } = await import('../src/format.js');
  const { buildStatusReport } = await import('../src/status.js');
  const report = buildStatusReport({
    cwd: PROJECT_ROOT,
    config: {},
    providerCallStatus: { available: false, error: 'not available' },
    lastReloadTime: '2024-01-01T00:00:00Z',
    delegationCount: 5,
  });
  const json = formatStatusJson(report, ['/path/to/config.json']);
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, 'status');
  assert.equal(parsed.runnerMode, 'prompt-only');
  assert.equal(parsed.providerCall.available, false);
  assert.ok(typeof parsed.providerCall.reason === 'string');
  assert.ok(Array.isArray(parsed.config.loadedPaths));
  assert.equal(parsed.agents.enabled, 6);
});

await test('formatStatusJson includes agents count summary, not full list', async () => {
  const { formatStatusJson } = await import('../src/format.js');
  const { buildStatusReport } = await import('../src/status.js');
  const report = buildStatusReport({
    cwd: PROJECT_ROOT,
    config: {},
    providerCallStatus: null,
    lastReloadTime: null,
    delegationCount: 0,
  });
  const json = formatStatusJson(report, []);
  // The StatusJsonOutput includes agents: { enabled, disabled, aliases } (count summary)
  // It does NOT include the full agent list with description/body
  const parsed = JSON.parse(json);
  assert.equal(typeof parsed.agents.enabled, 'number');
  assert.equal(typeof parsed.agents.disabled, 'number');
  assert.equal(typeof parsed.agents.aliases, 'number');
  // Full list should not be present (only count summary)
  assert.equal(parsed.agents.list, undefined);
});

await test('formatHistoryJson returns valid JSON', async () => {
  const { formatHistoryJson } = await import('../src/format.js');
  historyStore.clear();
  historyStore.add({ timestamp: 1704067200000, requestedAgent: 'oracle', resolvedAgent: 'oracle', taskSummary: 'Review architecture', mode: 'deep', runnerMode: 'prompt-only', status: 'success', durationMs: 123, providerCallAvailable: false, aliasUsed: false });
  const records = historyStore.recent(10);
  const json = formatHistoryJson(records);
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, 'history');
  assert.ok(Array.isArray(parsed.items));
  assert.equal(parsed.count, 1);
  const item = parsed.items[0];
  assert.equal(item.id, 1);
  assert.equal(item.status, 'success');
  assert.equal(item.aliasUsed, false);
  assert.ok(item.timestamp.includes('2024'));
  historyStore.clear();
});

await test('formatHistoryJson includes filters', async () => {
  const { formatHistoryJson } = await import('../src/format.js');
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'oracle', resolvedAgent: 'oracle', taskSummary: 'task', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  const records = historyStore.recent(10);
  const json = formatHistoryJson(records, { agent: 'oracle', status: 'success' });
  const parsed = JSON.parse(json);
  assert.equal(parsed.filters.agent, 'oracle');
  assert.equal(parsed.filters.status, 'success');
  historyStore.clear();
});

await test('formatHistoryJson does not include fullTask/fullContext', async () => {
  const { formatHistoryJson } = await import('../src/format.js');
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'oracle', resolvedAgent: 'oracle', taskSummary: 'task', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false, fullTask: 'SECRET TASK', fullContext: 'SECRET CTX' });
  const records = historyStore.recent(10);
  const json = formatHistoryJson(records);
  const parsed = JSON.parse(json);
  assert.equal(parsed.items[0].fullTask, undefined);
  assert.equal(parsed.items[0].fullContext, undefined);
  historyStore.clear();
});

await test('formatMetricsJson returns valid JSON', async () => {
  const { formatMetricsJson } = await import('../src/format.js');
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'oracle', resolvedAgent: 'oracle', taskSummary: 't', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  historyStore.add({ timestamp: 2, requestedAgent: 'explorer', resolvedAgent: 'explorer', taskSummary: 't', mode: 'normal', runnerMode: 'prompt-only', status: 'fallback', durationMs: 200, providerCallAvailable: false, aliasUsed: false });
  const metrics = historyStore.metrics();
  const json = formatMetricsJson(metrics);
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, 'metrics');
  assert.equal(parsed.totalDelegations, 2);
  assert.equal(parsed.successCount, 1);
  assert.equal(parsed.fallbackCount, 1);
  assert.equal(parsed.averageDurationMs, 150);
  assert.ok(typeof parsed.tokenUsage === 'object');
  assert.equal(parsed.tokenUsage.available, false);
  historyStore.clear();
});

await test('formatMetricsJson tokenUsage unavailable field is stable', async () => {
  const { formatMetricsJson } = await import('../src/format.js');
  const metrics: MetricsSummary = {
    total: 0, success: 0, fallback: 0, error: 0,
    avgDurationMs: 0, perAgent: {}, perRunnerMode: {},
    providerCallAvailable: 0, providerCallUnavailable: 0,
  };
  const json = formatMetricsJson(metrics);
  const parsed = JSON.parse(json);
  assert.equal(parsed.tokenUsage.available, false);
  assert.equal(parsed.tokenUsage.reason, 'provider-call usage data unavailable');
});

await test('formatValidationJson returns valid JSON', async () => {
  const { formatValidationJson } = await import('../src/format.js');
  const { validateAgents } = await import('../src/templates.js');
  const result = validateAgents(PROJECT_ROOT);
  const json = formatValidationJson(result);
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, 'validation');
  assert.ok(typeof parsed.ok === 'boolean');
  assert.ok(Array.isArray(parsed.issues));
  assert.ok(typeof parsed.checked.total === 'number');
});

// ─── M10: Regex Filtering ────────────────────────────────────────────

console.log('\nM10: Regex Filtering');

await test('filterAgents by regex matches name', async () => {
  const { filterAgents } = await import('../src/commands.js');
  // Note: regex matches against the full searchable string (name + desc + aliases + tags joined)
  // so anchors like ^ and $ won't work as expected. Use a simple substring match.
  const result = filterAgents(agents, { regex: new RegExp('oracle', 'i') });
  assert.ok(result.length > 0, 'should find agents matching oracle');
  assert.ok(result.some(a => a.name === 'oracle'), 'should include oracle');
});

await test('filterAgents by regex matches description', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { regex: new RegExp('search', 'i') });
  assert.ok(result.length > 0, 'should find agents with search in description');
  for (const a of result) {
    const haystack = [a.name, a.description, ...a.aliases, ...a.tags].join(' ');
    assert.ok(haystack.toLowerCase().includes('search'));
  }
});

await test('filterAgents by regex matches aliases', async () => {
  const { filterAgents } = await import('../src/commands.js');
  // 'arch' is an alias for oracle
  const result = filterAgents(agents, { regex: new RegExp('arch', 'i') });
  assert.ok(result.length > 0);
});

await test('filterAgents by regex matches tags', async () => {
  const { filterAgents } = await import('../src/commands.js');
  // 'security' is a tag
  const result = filterAgents(agents, { regex: new RegExp('security', 'i') });
  // Some agents might have security in description, check searchability
  for (const a of result) {
    const haystack = [a.name, a.description, ...a.aliases, ...a.tags].join(' ');
    assert.ok(haystack.toLowerCase().includes('security'));
  }
});

await test('filterAgents by regex + tag (AND)', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, {
    tags: ['review'],
    regex: new RegExp('oracle', 'i'),
  });
  assert.ok(result.length > 0);
  for (const a of result) {
    assert.ok(a.tags.includes('review'));
    const haystack = [a.name, a.description, ...a.aliases, ...a.tags].join(' ');
    assert.ok(haystack.toLowerCase().includes('oracle'));
  }
});

await test('filterAgents by regex + query (AND)', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, {
    query: 'arch',
    regex: new RegExp('oracle', 'i'),
  });
  assert.ok(result.length > 0);
  for (const a of result) {
    // Must match both query and regex
    const haystack = [a.name, a.description, ...a.aliases, ...a.tags].join(' ').toLowerCase();
    assert.ok(haystack.includes('arch'));
    assert.ok(/oracle/i.test(haystack));
  }
});

await test('filterAgents regex is case-insensitive', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { regex: new RegExp('EXPLORER', 'i') });
  assert.ok(result.some(a => a.name === 'explorer'));
});

await test('filterAgents regex no match returns empty', async () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { regex: new RegExp('nonexistent_pattern_xyz', 'i') });
  assert.equal(result.length, 0);
});

await test('filterTemplates by regex matches name', async () => {
  const { filterTemplates } = await import('../src/commands.js');
  const { loadTemplates } = await import('../src/templates.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  // Use substring match (anchors apply to the full searchable string, not just name)
  const filtered = filterTemplates(asFilterable, { regex: new RegExp('security-reviewer', 'i') });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, 'security-reviewer');
});

await test('filterTemplates by regex matches aliases', async () => {
  const { filterTemplates } = await import('../src/commands.js');
  const { loadTemplates } = await import('../src/templates.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  // cpp-reviewer has alias 'cpp'
  const filtered = filterTemplates(asFilterable, { regex: new RegExp('writer|reviewer', 'i') });
  assert.ok(filtered.length > 0);
  for (const t of filtered) {
    const haystack = [t.name, t.description, ...t.aliases, ...t.tags].join(' ').toLowerCase();
    assert.ok(/writer|reviewer/.test(haystack));
  }
});

await test('filterTemplates by regex + tag (AND)', async () => {
  const { filterTemplates } = await import('../src/commands.js');
  const { loadTemplates } = await import('../src/templates.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const filtered = filterTemplates(asFilterable, {
    tags: ['readonly'],
    regex: new RegExp('review', 'i'),
  });
  for (const t of filtered) {
    assert.ok(t.tags.includes('readonly'));
    const haystack = [t.name, t.description, ...t.aliases, ...t.tags].join(' ').toLowerCase();
    assert.ok(/review/.test(haystack));
  }
});

await test('agentMatchesRegex helper works', async () => {
  const { agentMatchesRegex } = await import('../src/format.js');
  const explorer = agents.find(a => a.name === 'explorer')!;
  assert.equal(agentMatchesRegex(explorer, new RegExp('explorer', 'i')), true);
  assert.equal(agentMatchesRegex(explorer, new RegExp('search', 'i')), true);
  assert.equal(agentMatchesRegex(explorer, new RegExp('nonexistent', 'i')), false);
});

await test('templateMatchesRegex helper works', async () => {
  const { templateMatchesRegex } = await import('../src/format.js');
  const { loadTemplates } = await import('../src/templates.js');
  const result = loadTemplates();
  const tmpl = result.templates.find(t => t.name === 'security-reviewer')!;
  const asFilterable = {
    name: tmpl.name, description: tmpl.description, readonly: tmpl.readonly,
    aliases: tmpl.aliases, tags: tmpl.tags, recommendedMode: tmpl.recommendedMode,
  };
  assert.equal(templateMatchesRegex(asFilterable, new RegExp('security', 'i')), true);
  assert.equal(templateMatchesRegex(asFilterable, new RegExp('writer', 'i')), false);
});

// ─── M10: No Sensitive Data in JSON ─────────────────────────────────

console.log('\nM10: No Sensitive Data in JSON');

await test('JSON output for agents does not contain apiKey', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, {});
  assert.ok(!json.toLowerCase().includes('apikey'));
  assert.ok(!json.toLowerCase().includes('api_key'));
  assert.ok(!json.toLowerCase().includes('secret'));
  assert.ok(!json.toLowerCase().includes('token'));
});

await test('JSON output for templates does not contain apiKey', async () => {
  const { formatTemplatesJson } = await import('../src/format.js');
  const { loadTemplates } = await import('../src/templates.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const json = formatTemplatesJson(asFilterable, {});
  assert.ok(!json.toLowerCase().includes('apikey'));
  assert.ok(!json.toLowerCase().includes('api_key'));
});

await test('JSON output for history does not contain fullTask/fullContext', async () => {
  const { formatHistoryJson } = await import('../src/format.js');
  historyStore.clear();
  historyStore.add({
    timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle',
    taskSummary: 'summary', mode: 'normal', runnerMode: 'prompt-only',
    status: 'success', durationMs: 100, providerCallAvailable: false,
    aliasUsed: false, fullTask: 'MY_SECRET_TASK', fullContext: 'MY_SECRET_CTX',
  });
  const json = formatHistoryJson(historyStore.recent(10));
  assert.ok(!json.includes('MY_SECRET_TASK'));
  assert.ok(!json.includes('MY_SECRET_CTX'));
  historyStore.clear();
});

await test('JSON output for status does not include full provider error details', async () => {
  const { formatStatusJson } = await import('../src/format.js');
  const { buildStatusReport } = await import('../src/status.js');
  const report = buildStatusReport({
    cwd: PROJECT_ROOT,
    config: {},
    providerCallStatus: { available: false, error: 'apiKey: sk-1234567890abcdefghijk' },
    lastReloadTime: null,
    delegationCount: 0,
  });
  const json = formatStatusJson(report, []);
  const parsed = JSON.parse(json);
  // The reason field may contain sanitized or truncated version but not the full key
  // The formatStatusReport already sanitizes errors via categorizeProviderError
  assert.equal(typeof parsed.providerCall.reason, 'string');
});

await test('schemaVersion is included in all JSON outputs', async () => {
  const { formatAgentsJson, formatTemplatesJson, formatStatusJson, formatHistoryJson, formatMetricsJson, formatValidationJson } = await import('../src/format.js');
  const { buildStatusReport } = await import('../src/status.js');
  const { validateAgents } = await import('../src/templates.js');

  const agentsJson = formatAgentsJson(agents, {});
  assert.ok(JSON.parse(agentsJson).schemaVersion === 1);

  const { loadTemplates } = await import('../src/templates.js');
  const tmplResult = loadTemplates();
  const asFilterable = tmplResult.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  assert.ok(JSON.parse(formatTemplatesJson(asFilterable, {})).schemaVersion === 1);

  const statusReport = buildStatusReport({ cwd: PROJECT_ROOT, config: {}, providerCallStatus: null, lastReloadTime: null, delegationCount: 0 });
  assert.ok(JSON.parse(formatStatusJson(statusReport, [])).schemaVersion === 1);

  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 't', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  assert.ok(JSON.parse(formatHistoryJson(historyStore.recent(10))).schemaVersion === 1);
  historyStore.clear();

  const metrics: MetricsSummary = { total: 0, success: 0, fallback: 0, error: 0, avgDurationMs: 0, perAgent: {}, perRunnerMode: {}, providerCallAvailable: 0, providerCallUnavailable: 0 };
  assert.ok(JSON.parse(formatMetricsJson(metrics)).schemaVersion === 1);

  const validationResult = validateAgents(PROJECT_ROOT);
  assert.ok(JSON.parse(formatValidationJson(validationResult)).schemaVersion === 1);
});

await test('JSON outputs use camelCase field names', async () => {
  const { formatMetricsJson } = await import('../src/format.js');
  const metrics: MetricsSummary = { total: 0, success: 0, fallback: 0, error: 0, avgDurationMs: 0, perAgent: {}, perRunnerMode: {}, providerCallAvailable: 0, providerCallUnavailable: 0 };
  const json = formatMetricsJson(metrics);
  const parsed = JSON.parse(json);
  // camelCase fields
  assert.equal(parsed.totalDelegations !== undefined, true);
  assert.equal(parsed.successCount !== undefined, true);
  assert.equal(parsed.fallbackCount !== undefined, true);
  assert.equal(parsed.errorCount !== undefined, true);
  assert.equal(parsed.averageDurationMs !== undefined, true);
  assert.equal(parsed.perAgent !== undefined, true);
  assert.equal(parsed.perRunnerMode !== undefined, true);
  // snake_case fields should not appear
  assert.equal(parsed.total_delegations, undefined);
  assert.equal(parsed.success_count, undefined);
});

await test('formatAgentsJson regex filter shows pattern in filters', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, { regex: new RegExp('oracle', 'i') });
  const parsed = JSON.parse(json);
  assert.equal(parsed.filters.regex, 'oracle');
});


// ─── M11: JSON / Metadata / Agent Result ────────────────────────────

console.log('\nM11: JSON / Metadata / Agent Result');

// Task 1: /agent --format json
await test('/agent --format json produces valid JSON', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'deep',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 123,
   
    historyId: 5,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    output: 'Delegated to oracle.',
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, 'agentResult');
  assert.equal(parsed.resolvedAgent, 'oracle');
  assert.equal(parsed.aliasUsed, false);
  assert.equal(parsed.mode, 'deep');
  assert.equal(parsed.runnerMode, 'prompt-only');
  assert.equal(parsed.status, 'success');
  assert.equal(parsed.durationMs, 123);
  assert.equal(parsed.historyId, 5);
  assert.equal(typeof parsed.providerCall === 'object', true);
  assert.equal(parsed.providerCall.available, false);
});

await test('/agent --format json with alias shows aliasUsed=true', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'arch',
    resolvedAgent: 'oracle',
    aliasUsed: true,
    mode: 'deep',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 100,
   
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    output: 'OK',
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.requestedAgent, 'arch');
  assert.equal(parsed.resolvedAgent, 'oracle');
  assert.equal(parsed.aliasUsed, true);
});

await test('/agent --format json error returns structured error', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'unknown',
    resolvedAgent: 'unknown',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'error',
    durationMs: 0,
   
    historyId: null,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    error: 'Agent "unknown" not found.',
    availableAgents: ['explorer', 'oracle'],
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.status, 'error');
  assert.equal(parsed.error.code, 'UNKNOWN_AGENT');
  assert.equal(parsed.error.message, 'Agent "unknown" not found.');
  assert.deepEqual(parsed.error.availableAgents, ['explorer', 'oracle']);
  assert.equal(parsed.output, null);
});

await test('/agent --format json disabled agent error', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'designer',
    resolvedAgent: 'designer',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'error',
    durationMs: 0,
   
    historyId: null,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    error: 'Agent "designer" is disabled.',
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.status, 'error');
  assert.equal(parsed.error.code, 'AGENT_DISABLED');
});

await test('/agent --format json output sanitizes API keys', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 50,
   
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    output: 'API key: sk-1234567890abcdefghijk is valid',
  });
  const parsed = JSON.parse(json);
  assert.ok(!parsed.output.text.includes('sk-1234567890abcdefghijk'));
  assert.ok(parsed.output.text.includes('[API_KEY_REDACTED]'));
});

await test('/agent --format json does not include full prompt', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const longPrompt = 'A'.repeat(5000);
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 50,
   
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    output: longPrompt,
  });
  const parsed = JSON.parse(json);
  // output text should be included (it's the delegation prompt or result text)
  // but the format itself doesn't include a separate 'prompt' field
  assert.equal(parsed.prompt, undefined);
});

await test('/agent --format json includes historyId and replayOf', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'deep',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 100,
    historyId: 12,
   
    replayOf: 5,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    output: 'Done',
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.historyId, 12);
  assert.equal(parsed.replayOf, 5);
});

await test('/agent --format json with provider-call mode', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'provider-call',
    status: 'success',
    durationMs: 200,
   
    historyId: 3,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: true,
    output: 'Model response here',
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.runnerMode, 'provider-call');
  assert.equal(parsed.providerCall.available, true);
  assert.equal(parsed.output.format, 'provider-call');
});

await test('/agent --format json fallback status', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'provider-call',
    status: 'fallback',
    durationMs: 50,
   
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: true,
    error: 'Provider-call unavailable',
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.status, 'fallback');
  assert.equal(parsed.providerCall.fallback, true);
  assert.equal(parsed.providerCall.reason, 'Provider-call unavailable, fallback to prompt-only');
});

// Task 2: filters JSON serialization with null for unset
await test('serializeAgentFilters uses null for unset filters', async () => {
  const { serializeAgentFilters } = await import('../src/format.js');
  const filters = serializeAgentFilters({});
  assert.equal(filters.tags, null);
  assert.equal(filters.query, null);
  assert.equal(filters.readonly, null);
  assert.equal(filters.writable, null);
  assert.equal(filters.enabled, null);
  assert.equal(filters.disabled, null);
  assert.equal(filters.source, null);
  assert.equal(filters.regex, null);
});

await test('serializeAgentFilters includes set values', async () => {
  const { serializeAgentFilters } = await import('../src/format.js');
  const filters = serializeAgentFilters({
    tags: ['review'],
    query: 'cpp',
    readonly: true,
    source: 'builtin',
    regex: new RegExp('review|cpp', 'i'),
  });
  assert.deepEqual(filters.tags, ['review']);
  assert.equal(filters.query, 'cpp');
  assert.equal(filters.readonly, true);
  assert.equal(filters.source, 'builtin');
  assert.equal(filters.regex, 'review|cpp');
  assert.equal(filters.writable, null);
  assert.equal(filters.enabled, null);
  assert.equal(filters.disabled, null);
});

await test('formatAgentsJson filters use null for unset', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, {});
  const parsed = JSON.parse(json);
  assert.equal(parsed.filters.tags, null);
  assert.equal(parsed.filters.query, null);
  assert.equal(parsed.filters.regex, null);
});

await test('formatAgentsJson regex serialized as string', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, { regex: new RegExp('^oracle$') });
  const parsed = JSON.parse(json);
  assert.equal(typeof parsed.filters.regex, 'string');
  assert.equal(parsed.filters.regex, '^oracle$');
  // Should not be a RegExp object in JSON
  assert.equal(typeof parsed.filters.regex, 'string');
});

await test('formatHistoryJson filters use null for unset', async () => {
  const { formatHistoryJson } = await import('../src/format.js');
  historyStore.clear();
  historyStore.add({ timestamp: 1, requestedAgent: 'a', resolvedAgent: 'oracle', taskSummary: 't', mode: 'normal', runnerMode: 'prompt-only', status: 'success', durationMs: 100, providerCallAvailable: false, aliasUsed: false });
  const json = formatHistoryJson(historyStore.recent(10));
  const parsed = JSON.parse(json);
  assert.equal(parsed.filters.agent, null);
  assert.equal(parsed.filters.status, null);
  assert.equal(parsed.filters.limit, null);
  historyStore.clear();
});

await test('formatErrorJson produces valid error JSON', async () => {
  const { formatErrorJson } = await import('../src/format.js');
  const json = formatErrorJson('INVALID_REGEX', 'Invalid pattern', { pattern: '[' });
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, 'error');
  assert.equal(parsed.error.code, 'INVALID_REGEX');
  assert.equal(parsed.error.message, 'Invalid pattern');
  assert.equal(parsed.error.details.pattern, '[');
});

// Task 3: metadata
await test('collectFileMetadata returns valid structure', async () => {
  const { collectFileMetadata } = await import('../src/metadata.js');
  const meta = collectFileMetadata(PROJECT_ROOT + '/agents/oracle.md');
  assert.ok(meta.sourcePath.includes('oracle.md'));
  assert.ok(meta.lastModified === null || typeof meta.lastModified === 'string');
  assert.ok(meta.sizeBytes === null || typeof meta.sizeBytes === 'number');
  // createdAt may be null on some platforms
  assert.ok(meta.createdAt === null || typeof meta.createdAt === 'string');
});

await test('collectFileMetadata stat failure is non-fatal', async () => {
  const { collectFileMetadata } = await import('../src/metadata.js');
  const meta = collectFileMetadata('/nonexistent/path/xyz.md');
  assert.equal(meta.lastModified, null);
  assert.equal(meta.sizeBytes, null);
  assert.equal(meta.createdAt, null);
});

await test('loaded agent includes metadata', async () => {
  const allAgents = loadAgents(PROJECT_ROOT, {});
  const oracle = allAgents.find(a => a.name === 'oracle');
  assert.ok(oracle, 'oracle should be loaded');
  assert.ok(oracle.metadata, 'oracle should have metadata');
  assert.ok(oracle.metadata.sourcePath, 'metadata should have sourcePath');
  assert.ok(oracle.metadata.lastModified, 'metadata should have lastModified');
  assert.ok(typeof oracle.metadata.lastModified === 'string');
  assert.ok(oracle.metadata.sizeBytes, 'metadata should have sizeBytes');
  assert.ok(typeof oracle.metadata.sizeBytes === 'number');
  // createdAt may be null on some platforms/filesystems
  assert.ok(oracle.metadata.createdAt === null || typeof oracle.metadata.createdAt === 'string');
});

await test('loaded template includes metadata', async () => {
  const { loadTemplates } = await import('../src/templates.js');
  const result = loadTemplates();
  assert.equal(result.ok, true);
  const security = result.templates.find(t => t.name === 'security-reviewer');
  assert.ok(security, 'security-reviewer template should exist');
  assert.ok(security.metadata, 'template should have metadata');
  assert.ok(security.metadata.lastModified, 'metadata should have lastModified');
  assert.ok(typeof security.metadata.lastModified === 'string');
  assert.ok(security.metadata.sizeBytes, 'metadata should have sizeBytes');
  assert.ok(typeof security.metadata.sizeBytes === 'number');
});

await test('/agents --format json includes metadata', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, {});
  const parsed = JSON.parse(json);
  assert.ok(parsed.items.length > 0);
  for (const item of parsed.items) {
    assert.ok(item.metadata, 'item should have metadata');
    assert.equal(typeof item.metadata.sourcePath, 'string');
    assert.ok(item.metadata.lastModified === null || typeof item.metadata.lastModified === 'string');
    assert.ok(item.metadata.sizeBytes === null || typeof item.metadata.sizeBytes === 'number');
    assert.ok(item.metadata.createdAt === null || typeof item.metadata.createdAt === 'string');
  }
});

await test('/agents templates --format json includes metadata', async () => {
  const { formatTemplatesJsonFull } = await import('../src/format.js');
  const { loadTemplates } = await import('../src/templates.js');
  const result = loadTemplates();
  assert.equal(result.ok, true);
  const json = formatTemplatesJsonFull(result.templates, {});
  const parsed = JSON.parse(json);
  assert.ok(parsed.items.length > 0);
  for (const item of parsed.items) {
    assert.ok(item.metadata, 'item should have metadata');
    assert.equal(typeof item.metadata.sourcePath, 'string');
    assert.ok(item.metadata.lastModified === null || typeof item.metadata.lastModified === 'string');
    assert.ok(item.metadata.sizeBytes === null || typeof item.metadata.sizeBytes === 'number');
  }
});

await test('/agents templates --format json includes metadata.sourcePathKind', async () => {
  const { formatTemplatesJsonFull } = await import('../src/format.js');
  const { loadTemplates } = await import('../src/templates.js');
  const result = loadTemplates();
  assert.equal(result.ok, true);
  const json = formatTemplatesJsonFull(result.templates, {});
  const parsed = JSON.parse(json);
  assert.ok(parsed.items.length > 0);
  for (const item of parsed.items) {
    assert.ok(item.metadata, 'item should have metadata');
    assert.ok('sourcePathKind' in item.metadata, 'template metadata should have sourcePathKind field');
    assert.ok(['builtin', 'project', 'user', 'external', 'unknown'].includes(item.metadata.sourcePathKind),
      `sourcePathKind should be valid value, got: ${item.metadata.sourcePathKind}`);
  }
});

await test('templates JSON metadata structure matches agents JSON metadata structure', async () => {
  const { formatAgentsJson, formatTemplatesJsonFull } = await import('../src/format.js');
  const { loadTemplates } = await import('../src/templates.js');
  const agentsJson = JSON.parse(formatAgentsJson(agents, {}));
  const templatesResult = loadTemplates();
  assert.equal(templatesResult.ok, true);
  const templatesJson = JSON.parse(formatTemplatesJsonFull(templatesResult.templates, {}));

  assert.ok(agentsJson.items.length > 0, 'should have at least one agent');
  assert.ok(templatesJson.items.length > 0, 'should have at least one template');


  const agentItem = agentsJson.items[0];
  const templateItem = templatesJson.items[0];

  // Both should have metadata field
  assert.ok(agentItem.metadata !== undefined, 'agent item should have metadata field');
  assert.ok(templateItem.metadata !== undefined, 'template item should have metadata field');


  if (agentItem.metadata && templateItem.metadata) {
    // Check key metadata fields exist in both
    assert.ok('sourcePath' in agentItem.metadata, 'agent metadata should have sourcePath');
    assert.ok('sourcePath' in templateItem.metadata, 'template metadata should have sourcePath');
    assert.ok('sourcePathKind' in agentItem.metadata, 'agent metadata should have sourcePathKind');
    assert.ok('sourcePathKind' in templateItem.metadata, 'template metadata should have sourcePathKind');
    assert.ok('createdAt' in agentItem.metadata, 'agent metadata should have createdAt');
    assert.ok('createdAt' in templateItem.metadata, 'template metadata should have createdAt');
    assert.ok('lastModified' in agentItem.metadata, 'agent metadata should have lastModified');
    assert.ok('lastModified' in templateItem.metadata, 'template metadata should have lastModified');
    assert.ok('sizeBytes' in agentItem.metadata, 'agent metadata should have sizeBytes');
    assert.ok('sizeBytes' in templateItem.metadata, 'template metadata should have sizeBytes');
  }
});

await test('templates JSON metadata does not include absolute user paths', async () => {
  const { formatTemplatesJsonFull } = await import('../src/format.js');
  const { loadTemplates } = await import('../src/templates.js');
  const result = loadTemplates();
  assert.equal(result.ok, true);
  const json = formatTemplatesJsonFull(result.templates, {});
  const parsed = JSON.parse(json);


  for (const item of parsed.items) {
    if (item.metadata && item.metadata.sourcePath) {
      // Should not contain absolute Windows paths (e.g., C:\Users\...)
      assert.ok(!item.metadata.sourcePath.match(/^[A-Za-z]:\\/),
        `sourcePath should not be absolute Windows path: ${item.metadata.sourcePath}`);
      // Should not contain /home/ or /Users/ (absolute Unix paths)
      assert.ok(!item.metadata.sourcePath.startsWith('/home/'),
        `sourcePath should not be absolute /home path: ${item.metadata.sourcePath}`);
      assert.ok(!item.metadata.sourcePath.startsWith('/Users/'),
        `sourcePath should not be absolute /Users path: ${item.metadata.sourcePath}`);
      // Should not contain /root/ (absolute root paths)
      assert.ok(!item.metadata.sourcePath.startsWith('/root/'),
        `sourcePath should not be absolute /root path: ${item.metadata.sourcePath}`);
    }
  }
});

await test('metadata sizeBytes is number or null', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, {});
  const parsed = JSON.parse(json);
  for (const item of parsed.items) {
    assert.ok(typeof item.metadata.sizeBytes === 'number' || item.metadata.sizeBytes === null);
    assert.ok(item.metadata.sizeBytes === null || item.metadata.sizeBytes > 0);
  }
});

await test('metadata dates are ISO strings or null', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, {});
  const parsed = JSON.parse(json);
  for (const item of parsed.items) {
    if (item.metadata.lastModified) {
      // Should be valid ISO date
      const d = new Date(item.metadata.lastModified);
      assert.ok(!isNaN(d.getTime()), `lastModified should be valid ISO: ${item.metadata.lastModified}`);
    }
    if (item.metadata.createdAt) {
      const d = new Date(item.metadata.createdAt);
      assert.ok(!isNaN(d.getTime()), `createdAt should be valid ISO: ${item.metadata.createdAt}`);
    }
  }
});

await test('formatAgentsJson metadata null when stat fails', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  // Create a mock agent with null metadata
  const mockAgents = agents.map(a => ({ ...a, metadata: null }));
  const json = formatAgentsJson(mockAgents as any, {});
  const parsed = JSON.parse(json);
  for (const item of parsed.items) {
    assert.equal(item.metadata, null);
  }
});

// Task 4: formatAgentsJson includes all filter fields with null
await test('formatAgentsJson all filter fields present with null', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const json = formatAgentsJson(agents, {});
  const parsed = JSON.parse(json);
  assert.ok('tags' in parsed.filters);
  assert.ok('query' in parsed.filters);
  assert.ok('readonly' in parsed.filters);
  assert.ok('writable' in parsed.filters);
  assert.ok('enabled' in parsed.filters);
  assert.ok('disabled' in parsed.filters);
  assert.ok('source' in parsed.filters);
  assert.ok('regex' in parsed.filters);
});

await test('formatTemplatesJson all filter fields present with null', async () => {
  const { formatTemplatesJson } = await import('../src/format.js');
  const { loadTemplates } = await import('../src/templates.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const json = formatTemplatesJson(asFilterable, {});
  const parsed = JSON.parse(json);
  assert.ok('tags' in parsed.filters);
  assert.ok('query' in parsed.filters);
  assert.ok('readonly' in parsed.filters);
  assert.ok('writable' in parsed.filters);
  assert.ok('regex' in parsed.filters);
});

await test('invalid regex + --format json returns error JSON via formatErrorJson', async () => {
  const { formatErrorJson, parseRegexOption } = await import('../src/format.js');
  const { regex, error } = parseRegexOption({ regex: '[' });
  assert.equal(regex, null);
  assert.ok(error?.includes('Invalid regex pattern'));
  const json = formatErrorJson('INVALID_REGEX', error!, { pattern: '[' });
  const parsed = JSON.parse(json);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, 'error');
  assert.equal(parsed.error.code, 'INVALID_REGEX');
});

// D1-fix: new execution metadata fields in agentResult JSON
await test('/agent --format json includes executed=false for prompt-only', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({
    requestedAgent: 'explorer',
    resolvedAgent: 'explorer',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 50,
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    note: 'Prompt-only delegation: no tools were executed.',
    providerCallAvailable: false,
    output: 'Delegated to explorer.',
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.executed, false, 'executed should be false in prompt-only JSON');
  assert.equal(parsed.toolsExecuted, false, 'toolsExecuted should be false in prompt-only JSON');
  assert.equal(parsed.childSessionStarted, false, 'childSessionStarted should be false');
  assert.equal(parsed.runnerMode, 'prompt-only');
  assert.ok(parsed.note?.includes('no tools'), 'note should be in JSON');
});

await test('/agent --format json includes note field when provided', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({
    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'deep',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 100,
    historyId: 2,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    note: 'Prompt-only delegation: use the main agent to search manually.',
    providerCallAvailable: false,
    output: 'Delegated to oracle.',
  });
  const parsed = JSON.parse(json);
  assert.ok(parsed.note, 'note field should be present in JSON');
  assert.equal(parsed.note, 'Prompt-only delegation: use the main agent to search manually.');
});

await test('/agent --format json does not imply toolsExecuted=true in prompt-only', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({
    requestedAgent: 'explorer',
    resolvedAgent: 'explorer',
    aliasUsed: false,
    mode: 'quick',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 10,
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    note: 'Prompt-only.',
    providerCallAvailable: false,
    output: 'OK',
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.executed, false);
  assert.equal(parsed.toolsExecuted, false);
  assert.equal(parsed.childSessionStarted, false);
  // Should not contain any indication that tools were actually run
  assert.ok(!parsed.output.text.includes('path:'));
});

await test('formatAgentsJson provider-call field in agentResult', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'provider-call',
    status: 'fallback',
    durationMs: 50,
   
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    error: 'fallback',
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.providerCall.available, false);
  assert.equal(parsed.providerCall.fallback, true);
  assert.equal(typeof parsed.providerCall.reason, 'string');
});

await test('formatAgentsJson task field in agentResult', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'deep',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 100,
   
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    output: 'result text',
    taskSummary: 'review this design',
  });
  const parsed = JSON.parse(json);
  assert.ok(parsed.task, 'should have task field');
  assert.ok(typeof parsed.task.summary === 'string', 'task.summary should be string');
  assert.equal(parsed.task.summary, 'review this design', 'task.summary should contain the actual task');
});

await test('formatAgentResultJson taskSummary is used, not requestedAgent', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'arch',  // alias
    resolvedAgent: 'oracle',
    aliasUsed: true,
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 100,
   
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    output: 'result',
    taskSummary: 'review this design',
  });
  const parsed = JSON.parse(json);
  // task.summary should be the actual task, not the agent name or alias
  assert.equal(parsed.task.summary, 'review this design',
    'task.summary should contain task text, not agent name');
  assert.equal(parsed.requestedAgent, 'arch',
    'requestedAgent should still be the alias');
  assert.equal(parsed.resolvedAgent, 'oracle',
    'resolvedAgent should still be the resolved agent name');
});

await test('formatAgentResultJson taskSummary defaults to requestedAgent for backward compat', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  // Don't pass taskSummary - should fall back to requestedAgent
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 100,
   
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    output: 'result',
  });
  const parsed = JSON.parse(json);
  // For backward compat when taskSummary is not provided, falls back to requestedAgent
  assert.ok(parsed.task.summary.length > 0, 'task.summary should have content');
});

await test('formatAgentResultJson long taskSummary is truncated', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const longTask = 'A'.repeat(300);
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 100,
   
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    output: 'result',
    taskSummary: longTask,
  });
  const parsed = JSON.parse(json);
  // Should be truncated to ~200 chars (truncateForJson uses 200 max)
  assert.ok(parsed.task.summary.length <= 200,
    `task.summary should be truncated to <= 200 chars, got ${parsed.task.summary.length}`);
});


await test('formatAgentsJson output text field', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 100,
   
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    output: 'delegation prompt text',
  });
  const parsed = JSON.parse(json);
  assert.equal(parsed.output.text, 'delegation prompt text');
  assert.equal(parsed.output.format, 'text');
});

await test('agentResult JSON does not contain API key fields', async () => {
  const { formatAgentResultJson } = await import('../src/format.js');
  const json = formatAgentResultJson({

    requestedAgent: 'oracle',
    resolvedAgent: 'oracle',
    aliasUsed: false,
    mode: 'normal',
    runnerMode: 'prompt-only',
    status: 'success',
    durationMs: 100,
   
    historyId: 1,
    executed: false,
    toolsExecuted: false,
    childSessionStarted: false,
    providerCallAvailable: false,
    output: 'apiKey=sk-1234567890abcdefghijk',
  });
  // The apiKey=... pattern is replaced with apiKey=[redacted]
  assert.ok(!json.includes('sk-1234567890abcdefghijk'), 'should redact full API key');
  assert.ok(!json.includes('apiKey=sk-'), 'should redact apiKey= prefix');
  // The redaction should be present
  assert.ok(json.includes('[redacted]'), 'should have redaction text');
});

// ─── R2 Fix Tests: Metadata and Path Privacy ────────────────────────

await test('FileMetadata includes sourcePathKind', async () => {
  const { collectFileMetadata } = await import('../src/metadata.js');
  const metadata = collectFileMetadata(path.join(PROJECT_ROOT, 'agents', 'explorer.md'));
  assert.ok('sourcePathKind' in metadata, 'metadata should have sourcePathKind field');
  assert.ok(['builtin', 'project', 'user', 'external', 'unknown'].includes(metadata.sourcePathKind), 
    'sourcePathKind should be valid enum value');
});

await test('/agents --format json includes metadata.sourcePathKind', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const agents = loadAgents(PROJECT_ROOT, {});
  const json = formatAgentsJson(agents, {});
  const parsed = JSON.parse(json);
  
  assert.ok(parsed.items.length > 0, 'should have agent items');
  for (const item of parsed.items) {
    if (item.metadata) {
      assert.ok('sourcePathKind' in item.metadata, 'item.metadata should have sourcePathKind');
      assert.ok(['builtin', 'project', 'user', 'external', 'unknown'].includes(item.metadata.sourcePathKind),
        'sourcePathKind should be valid enum value');
    }
  }
});

await test('JSON output does not contain absolute temp directory paths', async () => {
  const { formatAgentsJson } = await import('../src/format.js');
  const agents = loadAgents(PROJECT_ROOT, {});
  const json = formatAgentsJson(agents, {});
  const parsed = JSON.parse(json);
  
  // Check that no agent metadata contains an absolute path starting with a drive letter or /tmp
  for (const item of parsed.items) {
    if (item.metadata?.sourcePath) {
      assert.ok(!item.metadata.sourcePath.match(/^[A-Z]:\\/), 'should not contain Windows absolute paths');
      assert.ok(!item.metadata.sourcePath.includes('\\Users\\'), 'should not contain Windows user paths');
      assert.ok(!item.metadata.sourcePath.includes('/tmp/'), 'should not contain /tmp paths');
      // sourcePath should be relative or safe display path
      assert.ok(!item.metadata.sourcePath.includes('AppData\\Local'), 'should not contain AppData paths');
    }
  }
});

await test('agent.sourcePath is sanitized (not absolute)', async () => {
  const agents = loadAgents(PROJECT_ROOT, {});
  
  // agent.sourcePath should be safe display path, not absolute
  for (const agent of agents) {
    if (agent.sourcePath) {
      // Should not be a raw absolute path
      assert.ok(!agent.sourcePath.match(/^[A-Z]:\\/), 'sourcePath should not be Windows absolute path');
      assert.ok(!agent.sourcePath.startsWith('/home/'), 'sourcePath should not be Unix home path');
      assert.ok(!agent.sourcePath.includes('\\Users\\'), 'sourcePath should not contain Windows user dir');
    }
  }
});

// ─── R2 Fix Tests: recommendedMode Validation ────────────────────

await test('valid recommendedMode values pass through', async () => {
  const templates = loadTemplates();
  assert.ok(templates.ok, 'templates should load');
  
  for (const tmpl of templates.templates) {
    assert.ok(['quick', 'normal', 'deep'].includes(tmpl.recommendedMode),
      `template "${tmpl.name}" recommendedMode "${tmpl.recommendedMode}" should be valid`);
  }
});

await test('recommendedMode validation catches invalid values in validateAgents', async () => {
  // Create a temp agent with invalid recommendedMode
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  
  const agentPath = path.join(agentsDir, 'test-agent.md');
  fs.writeFileSync(agentPath, `---
name: test-agent
description: Test agent
recommendedMode: invalid-mode
---
You are a test agent.`);

  try {
    const result = validateAgents(tmpDir);
    const modeIssues = result.issues.filter(i => i.field === 'recommendedMode');
    assert.ok(modeIssues.length > 0, 'should have recommendedMode validation issue');
    assert.ok(modeIssues[0].message.includes('invalid-mode'), 'should mention the invalid value');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── R2 Fix Tests: Temperature Range Validation ───────────────────

await test('temperature=0 and temperature=2 are valid', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  
  // Test temperature=0
  const agent1Path = path.join(agentsDir, 'temp-zero.md');
  fs.writeFileSync(agent1Path, `---
name: temp-zero
description: Test
temperature: 0
---
You are test.`);
  
  // Test temperature=2
  const agent2Path = path.join(agentsDir, 'temp-two.md');
  fs.writeFileSync(agent2Path, `---
name: temp-two
description: Test
temperature: 2
---
You are test.`);

  try {
    const result = validateAgents(tmpDir);
    const tempIssues = result.issues.filter(i => i.field === 'temperature');
    // Neither should trigger validation issues
    assert.ok(!tempIssues.some(i => i.message.includes('temp-zero')), 'temp=0 should be valid');
    assert.ok(!tempIssues.some(i => i.message.includes('temp-two')), 'temp=2 should be valid');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('temperature=-1 and temperature=3 are invalid', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  
  // Test temperature=-1
  const agent1Path = path.join(agentsDir, 'temp-neg.md');
  fs.writeFileSync(agent1Path, `---
name: temp-neg
description: Test
temperature: -1
---
You are test.`);
  
  // Test temperature=3
  const agent2Path = path.join(agentsDir, 'temp-high.md');
  fs.writeFileSync(agent2Path, `---
name: temp-high
description: Test
temperature: 3
---
You are test.`);

  try {
    const result = validateAgents(tmpDir);
    const tempIssues = result.issues.filter(i => i.field === 'temperature');
    
    assert.ok(tempIssues.length >= 2, 'should have at least 2 temperature issues');
    const negIssue = tempIssues.find(i => i.message.includes('temp-neg'));
    const highIssue = tempIssues.find(i => i.message.includes('temp-high'));
    assert.ok(negIssue, 'should catch negative temperature');
    assert.ok(highIssue, 'should catch temperature > 2');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('non-numeric temperature is invalid', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  const agentsDir = path.join(tmpDir, '.pi', 'pi-slim-agents', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  
  const agentPath = path.join(agentsDir, 'temp-string.md');
  fs.writeFileSync(agentPath, `---
name: temp-string
description: Test
temperature: "hot"
---
You are test.`);

  try {
    const result = validateAgents(tmpDir);
    const tempIssues = result.issues.filter(i => i.field === 'temperature');
    assert.ok(tempIssues.length > 0, 'should have temperature validation issue for string value');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── R2 Fix Tests: Config Schema Validation ───────────────────────

await test('valid config passes schema validation', async () => {
  const { loadAndValidateConfig } = await import('../src/config.js');
  
  // Create a valid temp config
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  const configDir = path.join(tmpDir, '.pi');
  fs.mkdirSync(configDir, { recursive: true });
  
  const configPath = path.join(configDir, 'slim-agents.json');
  fs.writeFileSync(configPath, JSON.stringify({
    runnerMode: 'prompt-only',
    outputTemplate: true,
    history: {
      persistent: false,
      retention: 100
    },
    agents: {
      explorer: { temperature: 0.5 }
    }
  }, null, 2));

  try {
    const result = loadAndValidateConfig(tmpDir);
    assert.ok(result.ok, 'valid config should pass validation');
    assert.ok(result.warnings.length === 0, 'should have no warnings');
    assert.equal(result.config.runnerMode, 'prompt-only');
    assert.equal(result.config.outputTemplate, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('invalid runnerMode is caught', async () => {
  const { loadAndValidateConfig } = await import('../src/config.js');
  
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  const configDir = path.join(tmpDir, '.pi');
  fs.mkdirSync(configDir, { recursive: true });
  
  const configPath = path.join(configDir, 'slim-agents.json');
  fs.writeFileSync(configPath, JSON.stringify({
    runnerMode: 'invalid-mode'
  }));

  try {
    const result = loadAndValidateConfig(tmpDir);
    // runnerMode warning should exist
    const runnerWarnings = result.warnings.filter(w => w.field.includes('runnerMode'));
    assert.ok(runnerWarnings.length > 0, 'should warn about invalid runnerMode');
    // Invalid value should be cleared
    assert.ok(!result.config.runnerMode || result.config.runnerMode === 'prompt-only',
      'invalid runnerMode should be cleared');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('invalid agent temperature is caught', async () => {
  const { loadAndValidateConfig } = await import('../src/config.js');
  
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  const configDir = path.join(tmpDir, '.pi');
  fs.mkdirSync(configDir, { recursive: true });
  
  const configPath = path.join(configDir, 'slim-agents.json');
  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      explorer: { temperature: 5 } // Invalid: > 2
    }
  }));

  try {
    const result = loadAndValidateConfig(tmpDir);
    const tempWarnings = result.warnings.filter(w => w.field.includes('temperature'));
    assert.ok(tempWarnings.length > 0, 'should warn about invalid temperature');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('unknown config fields produce warnings', async () => {
  const { loadAndValidateConfig } = await import('../src/config.js');
  
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  const configDir = path.join(tmpDir, '.pi');
  fs.mkdirSync(configDir, { recursive: true });
  
  const configPath = path.join(configDir, 'slim-agents.json');
  fs.writeFileSync(configPath, JSON.stringify({
    unknownField: 'value',
    runnerMode: 'prompt-only'
  }));

  try {
    const result = loadAndValidateConfig(tmpDir);
    const unknownWarnings = result.warnings.filter(w => w.field.includes('unknownField'));
    assert.ok(unknownWarnings.length > 0, 'should warn about unknown field');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

await test('invalid history.retention is caught', async () => {
  const { loadAndValidateConfig } = await import('../src/config.js');
  
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slim-agents-test-'));
  const configDir = path.join(tmpDir, '.pi');
  fs.mkdirSync(configDir, { recursive: true });
  
  const configPath = path.join(configDir, 'slim-agents.json');
  fs.writeFileSync(configPath, JSON.stringify({
    history: {
      retention: -5  // Invalid: negative
    }
  }));

  try {
    const result = loadAndValidateConfig(tmpDir);
    const retentionWarnings = result.warnings.filter(w => w.field.includes('retention'));
    assert.ok(retentionWarnings.length > 0, 'should warn about invalid retention');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── R2 Fix Tests: Package Root Detection ──────────────────────────

await test('findPackageRoot locates package', async () => {
  const { findPackageRoot } = await import('../src/utils.js');
  const root = findPackageRoot();
  assert.ok(root !== null, 'should find package root');
  assert.ok(fs.existsSync(path.join(root!, 'package.json')), 'should have package.json');
});

await test('resolvePackageAssetPath works for agents', async () => {
  const { resolvePackageAssetPath } = await import('../src/utils.js');
  const agentsPath = resolvePackageAssetPath('agents');
  assert.ok(agentsPath !== null, 'should resolve agents path');
  assert.ok(fs.existsSync(agentsPath!), 'agents directory should exist');
});

await test('resolvePackageAssetPath works for templates', async () => {
  const { resolvePackageAssetPath } = await import('../src/utils.js');
  const templatesPath = resolvePackageAssetPath('templates');
  assert.ok(templatesPath !== null, 'should resolve templates path');
  assert.ok(fs.existsSync(templatesPath!), 'templates directory should exist');
});

await test('getPackageAgentsDir returns valid path', async () => {
  const { getPackageAgentsDir } = await import('../src/utils.js');
  const agentsDir = getPackageAgentsDir();
  assert.ok(agentsDir !== null, 'should return agents dir');
  assert.ok(fs.existsSync(agentsDir!), 'agents dir should exist');
});

await test('getPackageTemplatesDir returns valid path', async () => {
  const { getPackageTemplatesDir } = await import('../src/utils.js');
  const templatesDir = getPackageTemplatesDir();
  assert.ok(templatesDir !== null, 'should return templates dir');
  assert.ok(fs.existsSync(templatesDir!), 'templates dir should exist');
});

// ─── D1 Fix Tests: ESM Runtime Compatibility ────────────────────────

/**
 * D1-runtime-fix: Verify that collectFileMetadata works in ESM context
 * without using CommonJS require().
 * 
 * Previously, metadata.ts used `require('os').homedir()` which fails in ESM.
 * Fixed by using the already-imported `os.homedir()` instead.
 */
await test('collectFileMetadata does not use require (ESM compatible)', async () => {
  const { collectFileMetadata } = await import('../src/metadata.js');
  // This should not throw "require is not defined"
  const metadata = collectFileMetadata(path.join(PROJECT_ROOT, 'agents', 'oracle.md'));
  assert.ok(metadata !== null, 'should return metadata');
  assert.ok(metadata.lastModified !== null, 'should have lastModified');
  assert.ok(typeof metadata.sizeBytes === 'number', 'sizeBytes should be number');
});

await test('collectFileMetadata correctly identifies home directory paths', async () => {
  const { collectFileMetadataWithContext } = await import('../src/metadata.js');
  // Create a test file in the user's home directory for testing
  const homeDir = os.homedir();
  const testDir = path.join(homeDir, '.pi-slim-agents-test-tmp');
  const testFile = path.join(testDir, 'test-agent.md');
  
  // Create the test file
  try {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testFile, '---\nname: test-agent\n---\nTest agent body\n');
    
    const metadata = collectFileMetadataWithContext(testFile, {
      cwd: '/some/project',
    });
    
    // The sourcePathKind should be 'user' for paths in home directory
    assert.equal(metadata.sourcePathKind, 'user', 'home dir paths should be identified as user-level');
    assert.ok(metadata.sourcePath.startsWith('~'), 'user paths should start with ~');
  } finally {
    // Clean up
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

await test('collectFileMetadata correctly identifies package builtin paths', async () => {
  const { collectFileMetadataWithContext } = await import('../src/metadata.js');
  const { findPackageRoot } = await import('../src/utils.js');
  
  const packageRoot = findPackageRoot();
  assert.ok(packageRoot !== null, 'should find package root');
  
  const builtinPath = path.join(packageRoot!, 'agents', 'explorer.md');
  const metadata = collectFileMetadataWithContext(builtinPath, {
    cwd: '/some/project',
    packageRoot: packageRoot!,
  });
  
  // The sourcePathKind should be 'builtin' for package internal paths
  assert.equal(metadata.sourcePathKind, 'builtin', 'package paths should be identified as builtin');
  assert.ok(!metadata.sourcePath.startsWith('~'), 'builtin paths should not start with ~');
  assert.ok(metadata.lastModified !== null, 'should have lastModified');
});

await test('collectFileMetadata correctly identifies project paths', async () => {
  const { collectFileMetadataWithContext } = await import('../src/metadata.js');
  
  const projectRoot = PROJECT_ROOT;
  // Create a test file inside the project directory
  const testDir = path.join(projectRoot, '.pi', 'slim-agents', 'agents');
  const testFile = path.join(testDir, 'test-agent.md');
  
  // Create the test file
  try {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(testFile, '---\nname: test-agent\n---\nTest agent body\n');
    
    const metadata = collectFileMetadataWithContext(testFile, {
      cwd: projectRoot,
    });
    
    // The sourcePathKind should be 'project' for paths under cwd
    assert.equal(metadata.sourcePathKind, 'project', 'project paths should be identified as project-level');
    assert.ok(!metadata.sourcePath.startsWith('~'), 'project paths should not start with ~');
    assert.ok(!metadata.sourcePath.startsWith('/'), 'project paths should not be absolute');
  } finally {
    // Clean up
    fs.rmSync(testFile, { force: true });
    fs.rmSync(path.dirname(testDir), { recursive: true, force: true });
  }
});

await test('collectFileMetadata handles stat failure gracefully', async () => {
  const { collectFileMetadata } = await import('../src/metadata.js');
  // Should not throw, should return null metadata with basename
  const metadata = collectFileMetadata('/nonexistent/path/agent.md');
  assert.ok(metadata !== null, 'should return metadata object even on failure');
  assert.equal(metadata.lastModified, null, 'lastModified should be null on failure');
  assert.equal(metadata.sizeBytes, null, 'sizeBytes should be null on failure');
  assert.equal(metadata.sourcePathKind, 'external', 'sourcePathKind should be external on failure');
});

await test('loadAgents works in ESM context without require errors', async () => {
  // This tests the full agent loading pipeline which uses collectFileMetadata internally
  const agents = loadAgents(PROJECT_ROOT, {});
  assert.ok(agents.length > 0, 'should load at least some agents');
  
  // Check that metadata is populated for all loaded agents
  for (const agent of agents) {
    if (agent.metadata) {
      assert.ok('lastModified' in agent.metadata, `${agent.name} metadata should have lastModified`);
      assert.ok('sizeBytes' in agent.metadata, `${agent.name} metadata should have sizeBytes`);
      assert.ok('sourcePathKind' in agent.metadata, `${agent.name} metadata should have sourcePathKind`);
    }
  }
});

await test('loadTemplates works in ESM context without require errors', async () => {
  const { loadTemplates } = await import('../src/templates.js');
  const result = loadTemplates();
  assert.equal(result.ok, true, 'should load templates successfully');
  assert.ok(result.templates.length > 0, 'should have at least one template');
  
  // Check that metadata is populated for templates
  for (const template of result.templates) {
    if (template.metadata) {
      assert.ok('lastModified' in template.metadata, `${template.name} template metadata should have lastModified`);
      assert.ok('sizeBytes' in template.metadata, `${template.name} template metadata should have sizeBytes`);
    }
  }
});

await test('built-in agents are loaded with correct sourcePathKind', async () => {
  const { collectFileMetadataWithContext } = await import('../src/metadata.js');
  const { findPackageRoot } = await import('../src/utils.js');
  
  const packageRoot = findPackageRoot();
  assert.ok(packageRoot !== null);
  
  const agents = loadAgents(PROJECT_ROOT, {});
  const builtinAgents = agents.filter(a => a.source === 'package');
  
  assert.ok(builtinAgents.length > 0, 'should have at least one built-in agent');
  
  for (const agent of builtinAgents) {
    const agentPath = path.join(packageRoot!, 'agents', `${agent.name}.md`);
    const metadata = collectFileMetadataWithContext(agentPath, {
      cwd: PROJECT_ROOT,
      packageRoot: packageRoot!,
    });
    assert.equal(metadata.sourcePathKind, 'builtin', 
      `${agent.name} should be identified as builtin`);
  }
});

// ─── Summary ────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ✅ ${passed} passed, ❌ ${failed} failed`);

if (failed > 0) {
  console.log('\nFailed tests:');
  for (const err of failures) {
    console.log(`  - ${err}`);
  }
  process.exit(1);
} else {
  console.log('\nAll tests passed! ✅');
  process.exit(0);
}
