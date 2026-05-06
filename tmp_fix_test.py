# -*- coding: utf-8 -*-
with open('tests/agents.test.ts', 'r', encoding='utf-8') as f:
    content = f.read()

old_text = """await test('formatValidationResult shows errors and warnings', () => {
  const result = {
    ok: false,
    issues: [
      { type: 'error', file: 'test.md', message: 'Invalid alias' },
      { type: 'warning', file: 'test2.md', message: 'Missing description' },
    ],
    checked: { builtin: 6, template: 7, user: 0, project: 0, total: 13 },
  };
  const output = formatValidationResult(result);
  assert.ok(output.includes('\\u274c'), 'should show errors');
  assert.ok(output.includes('\\u26a0\\ufe0f'), 'should show warnings');
  assert.ok(output.includes('Invalid alias'), 'should include error message');
  assert.ok(output.includes('Missing description'), 'should include warning message');
});"""

new_text = """await test('formatValidationResult shows errors, warnings, and tag stats', () => {
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
  assert.ok(output.includes('\\u274c'), 'should show errors');
  assert.ok(output.includes('\\u26a0\\ufe0f'), 'should show warnings');
  assert.ok(output.includes('Invalid alias'), 'should include error message');
  assert.ok(output.includes('Missing description'), 'should include warning message');
  assert.ok(output.includes('Tags: 25 checked'), 'should show tags checked count');
  assert.ok(output.includes('1 invalid'), 'should show invalid tags count');
});"""

if old_text not in content:
    print('ERROR: old_text not found in content')
    # Find what's there
    idx = content.find("formatValidationResult shows errors and warnings'")
    seg = content[idx:idx+700]
    print('Segment:')
    print(repr(seg[:300]))
else:
    new_content = content.replace(old_text, new_text, 1)
    with open('tests/agents.test.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Done - replacement made')
