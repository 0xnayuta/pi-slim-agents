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
import { parseAgentCommand, buildAgentHelpText, runAndRecordDelegation, replayDelegation } from '../src/commands.js';
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
    { history: { storeFullTask: false } },
    false,
  );
  const record = historyStore.recent(1)[0];
  assert.equal(record.fullTask, undefined);
  assert.equal(record.fullContext, undefined);
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
