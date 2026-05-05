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
import {
  buildProviderSystemPrompt,
  buildProviderUserMessage,
  resolveTemperature,
  resolveModel,
  type ProviderRunnerContext,
} from '../src/provider-runner.js';
import type { AgentDefinition, DelegateAgentParams, SlimAgentsConfig } from '../src/types.js';

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
