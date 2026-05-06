# -*- coding: utf-8 -*-
with open('tests/agents.test.ts', 'r', encoding='utf-8') as f:
    content = f.read()

new_tests = """
// ─── M9: Tags Metadata ─────────────────────────────────────────────

console.log('\\nM9: Tags Metadata');

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
      '---\\nname: no-tags-agent\\ndescription: Test agent without tags\\nreadonly: true\\n---\\n\\nYou are No Tags Agent.',
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

await test('isValidTag accepts valid tags', () => {
  const { isValidTag } = await import('../src/templates.js');
  assert.ok(isValidTag('review'), 'lowercase word should be valid');
  assert.ok(isValidTag('code-base'), 'hyphenated word should be valid');
  assert.ok(isValidTag('code_base'), 'underscored word should be valid');
  assert.ok(isValidTag('cpp'), 'short tag should be valid');
  assert.ok(isValidTag('cmake3'), 'tag with number should be valid');
  assert.ok(isValidTag('a1b'), 'minimal valid tag should be valid');
});

await test('isValidTag rejects invalid tags', () => {
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
      '---\\nname: bad-tag-agent\\ndescription: Test agent\\nreadonly: true\\ntags:\\n  - valid-tag\\n  - InvalidTag\\n---\\n\\nYou are Bad Tag Agent.',
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
      '---\\nname: dup-tag-agent\\ndescription: Test agent\\nreadonly: true\\ntags:\\n  - review\\n  - review\\n---\\n\\nYou are Dup Tag Agent.',
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
    manyTags = Array.from({ length: 10 }, (_, i) => 'tag' + i).join('\\n  - ');
    fs.writeFileSync(
      path.join(agentsDir, 'many-tags-agent.md'),
      '---\\nname: many-tags-agent\\ndescription: Test agent\\nreadonly: true\\ntags:\\n  - ' + manyTags + '\\n---\\n\\nYou are Many Tags Agent.',
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

console.log('\\nAgent Filtering');

await test('filterAgents by single tag', () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { tags: ['review'] });
  assert.ok(result.length > 0, 'should return agents with "review" tag');
  for (const a of result) {
    assert.ok(a.tags.includes('review'), `agent "${a.name}" should have "review" tag`);
  }
});

await test('filterAgents by multiple tags (AND)', () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { tags: ['review', 'readonly'] });
  for (const a of result) {
    assert.ok(a.tags.includes('review'), `agent "${a.name}" should have "review" tag`);
    assert.ok(a.tags.includes('readonly'), `agent "${a.name}" should have "readonly" tag`);
  }
});

await test('filterAgents by query matches name', () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { query: 'explorer' });
  assert.ok(result.some(a => a.name === 'explorer'), 'should find explorer by name');
});

await test('filterAgents by query matches description', () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { query: 'library' });
  assert.ok(result.length > 0, 'should find agents with "library" in description');
});

await test('filterAgents by query matches tags', () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { query: 'codebase' });
  assert.ok(result.length > 0, 'should find agents with "codebase" in tags');
});

await test('filterAgents by readonly', () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { readonly: true });
  for (const a of result) {
    assert.equal(a.readonly, true, `agent "${a.name}" should be readonly`);
  }
});

await test('filterAgents by writable', () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { writable: true });
  for (const a of result) {
    assert.equal(a.readonly, false, `agent "${a.name}" should be writable`);
  }
});

await test('filterAgents by enabled', () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { enabled: true });
  for (const a of result) {
    assert.equal(a.enabled, true, `agent "${a.name}" should be enabled`);
  }
});

await test('filterAgents by source builtin', () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { source: 'builtin' });
  for (const a of result) {
    assert.equal(a.source, 'package', `agent "${a.name}" should be from package`);
  }
});

await test('filterAgents combined filters', () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { tags: ['review'], readonly: true });
  for (const a of result) {
    assert.ok(a.tags.includes('review'), `agent "${a.name}" should have "review" tag`);
    assert.equal(a.readonly, true, `agent "${a.name}" should be readonly`);
  }
});

await test('filterAgents no results returns empty array', () => {
  const { filterAgents } = await import('../src/commands.js');
  const result = filterAgents(agents, { tags: ['nonexistent-tag-xyz'] });
  assert.equal(result.length, 0, 'should return empty array for non-existent tag');
});

// ─── Template Filtering ─────────────────────────────────────────────

console.log('\\nTemplate Filtering');

await test('filterTemplates by single tag', () => {
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

await test('filterTemplates by query matches name', () => {
  const { filterTemplates } = await import('../src/commands.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const filtered = filterTemplates(asFilterable, { query: 'security-reviewer' });
  assert.ok(filtered.some(t => t.name === 'security-reviewer'), 'should find security-reviewer by name');
});

await test('filterTemplates by query matches tags', () => {
  const { filterTemplates } = await import('../src/commands.js');
  const result = loadTemplates();
  const asFilterable = result.templates.map(t => ({
    name: t.name, description: t.description, readonly: t.readonly,
    aliases: t.aliases, tags: t.tags, recommendedMode: t.recommendedMode,
  }));
  const filtered = filterTemplates(asFilterable, { query: 'cmake' });
  assert.ok(filtered.some(t => t.name === 'cpp-reviewer'), 'should find cpp-reviewer by cmake tag');
});

await test('filterTemplates by readonly', () => {
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

await test('filterTemplates by writable', () => {
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

await test('filterTemplates no results returns empty array', () => {
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

console.log('\\nFormatting');

await test('formatAgentList returns formatted output with tags', () => {
  const { formatAgentList } = await import('../src/commands.js');
  const result = formatAgentList(agents.filter(a => a.enabled), {});
  assert.ok(result.length > 0, 'should return non-empty string');
  assert.ok(result.includes('@'), 'should contain agent references');
});

await test('formatAgentList shows no results for non-existent tag', () => {
  const { formatAgentList } = await import('../src/commands.js');
  const result = formatAgentList([], { tags: ['nonexistent'] });
  assert.ok(result.includes('No agents found'), 'should show no results message');
});

await test('formatTemplateList returns formatted output with tags', () => {
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

await test('formatTemplatesList includes tags column', () => {
  const result = loadTemplates();
  assert.ok(result.ok);
  const output = formatTemplatesList(result.templates);
  assert.ok(output.includes('Tags'), 'should include Tags column header');
  assert.ok(output.includes('security-reviewer'), 'should include template name');
});

"""

# Insert before // ─── Summary ───
marker = '// ─── Summary ───'
idx = content.find(marker)
assert idx > 0, f'Marker not found at idx {idx}'
new_content = content[:idx] + new_tests + '\n' + content[idx:]
with open('tests/agents.test.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)
print(f'Added {len(new_tests)} chars of new tests. New file size: {len(new_content)}')
