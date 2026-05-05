/**
 * Minimal test suite for pi-slim-agents.
 *
 * Uses Node built-in assert — no test framework needed.
 * Run with: pnpm test  (or: tsx tests/agents.test.ts)
 */

import assert from 'node:assert/strict';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadAgents, resolveAgentName, getAgent } from '../src/agents.js';
import { isSafeAgentName, parseAgentFrontmatter } from '../src/utils.js';
import { isAgentDisabled } from '../src/config.js';
import { runDelegation } from '../src/runner.js';
import type { AgentDefinition, SlimAgentsConfig } from '../src/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
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
  test(`${name} loads`, () => {
    const agent = agents.find(a => a.name === name);
    assert.ok(agent, `Agent "${name}" not found in loaded agents`);
    assert.ok(agent.description, `Agent "${name}" has no description`);
    assert.ok(agent.body.length > 10, `Agent "${name}" body is too short`);
  });
}

test('exactly 6 built-in agents loaded', () => {
  assert.equal(agents.length, 6);
});

// ─── 2. Frontmatter parsing ─────────────────────────────────────────

console.log('\n2. Frontmatter parsing');

test('explorer has correct name, description, readonly, temperature', () => {
  const explorer = agents.find(a => a.name === 'explorer')!;
  assert.equal(explorer.name, 'explorer');
  assert.equal(explorer.readonly, true);
  assert.ok(explorer.description.includes('search') || explorer.description.includes('Search'));
  assert.equal(explorer.temperature, 0.1);
});

test('aliases are parsed from frontmatter', () => {
  const explorer = agents.find(a => a.name === 'explorer')!;
  assert.ok(Array.isArray(explorer.aliases), 'aliases should be an array');
  assert.ok(explorer.aliases.includes('search'), 'should include alias "search"');
  assert.ok(explorer.aliases.includes('find'), 'should include alias "find"');
  assert.ok(explorer.aliases.includes('locate'), 'should include alias "locate"');
});

test('enabled defaults to true for non-disabled agents', () => {
  for (const agent of agents) {
    assert.equal(agent.enabled, true, `Agent "${agent.name}" should be enabled by default`);
  }
});

test('designer has higher temperature', () => {
  const designer = agents.find(a => a.name === 'designer')!;
  assert.ok(designer.temperature > 0.2, `Expected temperature > 0.2, got ${designer.temperature}`);
});

// ─── 3. Invalid agent names ─────────────────────────────────────────

console.log('\n3. Invalid agent names');

test('name with spaces is rejected', () => {
  assert.equal(isSafeAgentName('my agent'), false);
});

test('name with slash is rejected', () => {
  assert.equal(isSafeAgentName('my/agent'), false);
});

test('path traversal ../evil is rejected', () => {
  assert.equal(isSafeAgentName('../evil'), false);
});

test('uppercase name is rejected', () => {
  assert.equal(isSafeAgentName('Explorer'), false);
});

test('empty string is rejected', () => {
  assert.equal(isSafeAgentName(''), false);
});

test('name starting with number is rejected', () => {
  assert.equal(isSafeAgentName('1agent'), false);
});

test('valid lowercase names are accepted', () => {
  assert.equal(isSafeAgentName('explorer'), true);
  assert.equal(isSafeAgentName('my-agent'), true);
  assert.equal(isSafeAgentName('my_agent'), true);
  assert.equal(isSafeAgentName('agent1'), true);
});

// ─── 4. Unknown agent error ─────────────────────────────────────────

console.log('\n4. Unknown agent error');

test('unknown agent returns clear error with available agents list', () => {
  const result = runDelegation(
    { agent: 'nonexistent', task: 'do something' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('not found'), `Error should mention "not found": ${result.error}`);
  assert.ok(result.error!.includes('Available'), `Error should list available agents: ${result.error}`);
});

test('invalid agent name returns clear error', () => {
  const result = runDelegation(
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
  test(`alias "${alias}" resolves to ${expectedAgent}`, () => {
    const resolved = resolveAgentName(alias, agents);
    assert.equal(resolved, expectedAgent);
  });
}

test('delegate_agent resolves alias "search" to explorer', () => {
  const result = runDelegation(
    { agent: 'search', task: 'Find all TypeScript files' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'explorer');
  assert.ok(result.prompt.includes('explorer'));
});

test('delegate_agent resolves alias "ui" to designer', () => {
  const result = runDelegation(
    { agent: 'ui', task: 'Review the login form styling' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'designer');
});

test('delegate_agent resolves alias "arch" to oracle', () => {
  const result = runDelegation(
    { agent: 'arch', task: 'Review the architecture' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'oracle');
});

test('delegate_agent resolves alias "fix" to fixer', () => {
  const result = runDelegation(
    { agent: 'fix', task: 'Fix the bug in login.ts' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'fixer');
});

test('delegate_agent resolves alias "docs" to librarian', () => {
  const result = runDelegation(
    { agent: 'docs', task: 'Research the pino logging library' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'librarian');
});

test('delegate_agent resolves alias "route" to orchestrator', () => {
  const result = runDelegation(
    { agent: 'route', task: 'Plan the implementation' },
    PROJECT_ROOT,
    {},
  );
  assert.equal(result.ok, true);
  assert.equal(result.agentName, 'orchestrator');
});

test('getAgent resolves alias', () => {
  const agent = getAgent('search', PROJECT_ROOT, {});
  assert.ok(agent);
  assert.equal(agent.name, 'explorer');
});

test('resolveAgentName returns null for unknown name', () => {
  const result = resolveAgentName('nonexistent', agents);
  assert.equal(result, null);
});

// ─── 6. Disabled agents ─────────────────────────────────────────────

console.log('\n6. Disabled agents');

test('disabled agent via enabled:false is marked as disabled', () => {
  const config: SlimAgentsConfig = {
    agents: { designer: { enabled: false } },
  };
  const allAgents = loadAgents(PROJECT_ROOT, config);
  const designer = allAgents.find(a => a.name === 'designer');
  assert.ok(designer, 'designer should still be in the list');
  assert.equal(designer.enabled, false);
});

test('disabled agent via legacy disabled:true', () => {
  const config: SlimAgentsConfig = {
    agents: { designer: { disabled: true } },
  };
  assert.equal(isAgentDisabled(config, 'designer'), true);
});

test('disabled agent via top-level disabled array', () => {
  const config: SlimAgentsConfig = {
    disabled: ['designer'],
  };
  assert.equal(isAgentDisabled(config, 'designer'), true);
});

test('enabled:true overrides disabled:true', () => {
  const config: SlimAgentsConfig = {
    agents: { designer: { disabled: true, enabled: true } },
  };
  assert.equal(isAgentDisabled(config, 'designer'), false);
});

test('delegate_agent rejects disabled agent with clear error', () => {
  const config: SlimAgentsConfig = {
    agents: { designer: { enabled: false } },
  };
  const result = runDelegation(
    { agent: 'designer', task: 'Design the UI' },
    PROJECT_ROOT,
    config,
  );
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('disabled'), `Error should mention "disabled": ${result.error}`);
  assert.ok(result.error!.includes('Available enabled agents'), `Error should list enabled agents: ${result.error}`);
});

test('alias pointing to disabled agent is rejected', () => {
  const config: SlimAgentsConfig = {
    agents: { designer: { enabled: false } },
  };
  const result = runDelegation(
    { agent: 'ui', task: 'Design the UI' },
    PROJECT_ROOT,
    config,
  );
  assert.equal(result.ok, false);
  assert.ok(result.error!.includes('disabled'), `Error should mention "disabled": ${result.error}`);
  assert.ok(result.error!.includes('via alias'), `Error should mention the alias: ${result.error}`);
});

test('enabled agents list does not include disabled agents', () => {
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

test('parses simple key-value pairs', () => {
  const { frontmatter } = parseAgentFrontmatter('---\nname: test\ndescription: A test\n---\nBody');
  assert.equal(frontmatter.name, 'test');
  assert.equal(frontmatter.description, 'A test');
});

test('parses boolean values', () => {
  const { frontmatter } = parseAgentFrontmatter('---\nreadonly: true\n---\nBody');
  assert.equal(frontmatter.readonly, true);
});

test('parses numeric values', () => {
  const { frontmatter } = parseAgentFrontmatter('---\ntemperature: 0.5\n---\nBody');
  assert.equal(frontmatter.temperature, 0.5);
});

test('parses list values', () => {
  const { frontmatter } = parseAgentFrontmatter('---\ntags:\n  - a\n  - b\n---\nBody');
  assert.deepEqual(frontmatter.tags, ['a', 'b']);
});

test('returns empty frontmatter for files without frontmatter', () => {
  const { frontmatter, body } = parseAgentFrontmatter('Just some markdown');
  assert.deepEqual(frontmatter, {});
  assert.equal(body, 'Just some markdown');
});

test('parses body correctly after frontmatter', () => {
  const { body } = parseAgentFrontmatter('---\nname: test\n---\nThis is the body\nWith multiple lines');
  assert.ok(body.includes('This is the body'));
  assert.ok(body.includes('With multiple lines'));
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
