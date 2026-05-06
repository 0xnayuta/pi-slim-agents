/**
 * check-package.ts
 * 
 * Validates the package contents before publishing.
 * Run: pnpm check:package
 */

import { readFileSync, statSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

interface CheckResult {
  passed: boolean;
  message: string;
}

function checkExists(file: string): CheckResult {
  const path = join(root, file);
  if (!existsSync(path)) {
    return { passed: false, message: `MISSING: ${file}` };
  }
  return { passed: true, message: `OK: ${file}` };
}

function checkNotExists(file: string): CheckResult {
  const path = join(root, file);
  if (existsSync(path)) {
    return { passed: false, message: `UNEXPECTED: ${file} should not be in package` };
  }
  return { passed: true, message: `OK: no ${file} in root` };
}

function checkDistEntry(): CheckResult {
  const path = join(root, 'dist', 'index.js');
  if (!existsSync(path)) {
    return { passed: false, message: 'MISSING: dist/index.js (run pnpm build first)' };
  }
  const content = readFileSync(path, 'utf-8');
  if (!content.includes('export') && !content.includes('registerAgentCommands')) {
    return { passed: false, message: 'UNEXPECTED: dist/index.js may not be a valid entry' };
  }
  return { passed: true, message: 'OK: dist/index.js exists and looks valid' };
}

function checkAgents(): CheckResult {
  const agentsDir = join(root, 'agents');
  if (!existsSync(agentsDir)) {
    return { passed: false, message: 'MISSING: agents/ directory' };
  }
  const files = readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    return { passed: false, message: 'MISSING: No agent files in agents/' };
  }
  return { passed: true, message: `OK: ${files.length} agent files in agents/` };
}

function checkTemplates(): CheckResult {
  const templatesDir = join(root, 'templates');
  if (!existsSync(templatesDir)) {
    return { passed: false, message: 'MISSING: templates/ directory' };
  }
  const files = readdirSync(templatesDir).filter(f => f.endsWith('.md'));
  if (files.length === 0) {
    return { passed: false, message: 'MISSING: No template files in templates/' };
  }
  return { passed: true, message: `OK: ${files.length} template files in templates/` };
}

function checkSkill(): CheckResult {
  const skillPath = join(root, 'skills', 'use-slim-agents', 'SKILL.md');
  if (!existsSync(skillPath)) {
    return { passed: false, message: 'MISSING: skills/use-slim-agents/SKILL.md' };
  }
  const content = readFileSync(skillPath, 'utf-8');
  if (!content.includes('name:') || !content.includes('description:')) {
    return { passed: false, message: 'UNEXPECTED: skills/use-slim-agents/SKILL.md missing frontmatter' };
  }
  return { passed: true, message: 'OK: skills/use-slim-agents/SKILL.md exists with frontmatter' };
}

function checkPackageJson(): CheckResult {
  const pkgPath = join(root, 'package.json');
  if (!existsSync(pkgPath)) {
    return { passed: false, message: 'MISSING: package.json' };
  }
  
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  
  // Check name
  if (!pkg.name || !pkg.name.includes('pi-slim-agents')) {
    return { passed: false, message: `INVALID: package name should contain "pi-slim-agents", got "${pkg.name}"` };
  }
  
  // Check version
  if (!pkg.version || !pkg.version.match(/^\d+\.\d+\.\d+/)) {
    return { passed: false, message: `INVALID: package version should be semver, got "${pkg.version}"` };
  }
  
  // Check pi manifest
  if (!pkg.pi || !pkg.pi.extensions || !pkg.pi.extensions[0]) {
    return { passed: false, message: 'INVALID: package.json missing pi.extensions' };
  }
  if (!pkg.pi || !pkg.pi.skills || !pkg.pi.skills[0]) {
    return { passed: false, message: 'INVALID: package.json missing pi.skills' };
  }
  
  // Check files field
  if (!pkg.files || !Array.isArray(pkg.files)) {
    return { passed: false, message: 'INVALID: package.json missing files array' };
  }
  
  const requiredFiles = ['dist', 'agents', 'templates', 'skills', 'README.md', 'LICENSE'];
  const missing = requiredFiles.filter(f => !pkg.files.includes(f));
  if (missing.length > 0) {
    return { passed: false, message: `INVALID: package.json files missing: ${missing.join(', ')}` };
  }
  
  // Check scripts
  if (!pkg.scripts || !pkg.scripts.build || !pkg.scripts.typecheck) {
    return { passed: false, message: 'INVALID: package.json missing required scripts (build, typecheck)' };
  }
  
  return { passed: true, message: `OK: package.json valid (name=${pkg.name}, version=${pkg.version})` };
}

function checkReadme(): CheckResult {
  const readmePath = join(root, 'README.md');
  if (!existsSync(readmePath)) {
    return { passed: false, message: 'MISSING: README.md' };
  }
  const content = readFileSync(readmePath, 'utf-8');
  
  const requiredSections = ['Installation', 'Quick Start', 'Limitations'];
  const missing = requiredSections.filter(s => !content.includes(s));
  if (missing.length > 0) {
    return { passed: false, message: `WARNING: README.md missing sections: ${missing.join(', ')}` };
  }
  
  return { passed: true, message: 'OK: README.md exists with required sections' };
}

function checkChangelog(): CheckResult {
  const changelogPath = join(root, 'CHANGELOG.md');
  if (!existsSync(changelogPath)) {
    return { passed: false, message: 'MISSING: CHANGELOG.md' };
  }
  const content = readFileSync(changelogPath, 'utf-8');
  if (!content.includes('0.1.0') && !content.includes('[0.1.0]')) {
    return { passed: false, message: 'WARNING: CHANGELOG.md may not mention v0.1.0' };
  }
  return { passed: true, message: 'OK: CHANGELOG.md exists with v0.1.0' };
}

function checkDocs(): CheckResult {
  const docsDir = join(root, 'docs');
  if (!existsSync(docsDir)) {
    return { passed: false, message: 'MISSING: docs/ directory' };
  }
  const files = readdirSync(docsDir).filter(f => f.endsWith('.md'));
  if (files.length < 3) {
    return { passed: false, message: `WARNING: docs/ has only ${files.length} files, expected more` };
  }
  return { passed: true, message: `OK: docs/ has ${files.length} documentation files` };
}

function checkPromptEvals(): CheckResult {
  const evalDir = join(root, 'examples', 'prompt-evals');
  if (!existsSync(evalDir)) {
    return { passed: false, message: 'MISSING: examples/prompt-evals/' };
  }
  const files = readdirSync(evalDir).filter(f => f.endsWith('.md'));
  if (files.length < 6) {
    return { passed: false, message: `WARNING: prompt-evals has only ${files.length} files, expected 6+` };
  }
  return { passed: true, message: `OK: examples/prompt-evals/ has ${files.length} eval files` };
}

function checkGitignore(): CheckResult {
  const gitignorePath = join(root, '.gitignore');
  if (!existsSync(gitignorePath)) {
    return { passed: false, message: 'MISSING: .gitignore' };
  }
  const content = readFileSync(gitignorePath, 'utf-8');
  
  const required = ['node_modules', 'dist'];
  const missing = required.filter(r => !content.includes(r));
  if (missing.length > 0) {
    return { passed: false, message: `WARNING: .gitignore missing: ${missing.join(', ')}` };
  }
  
  // Check for history file ignore
  if (!content.includes('history.jsonl') && !content.includes('.pi/slim-agents')) {
    return { passed: false, message: 'WARNING: .gitignore should ignore .pi/slim-agents/history.jsonl' };
  }
  
  return { passed: true, message: 'OK: .gitignore exists with node_modules, dist, history' };
}

function checkLocalState(): CheckResult {
  const localPaths = [
    '.pi/slim-agents/history.jsonl',
    '.pi/slim-agents/agents',
    '.pi-state'
  ];
  
  for (const p of localPaths) {
    const fullPath = join(root, p);
    if (existsSync(fullPath)) {
      return { passed: true, message: `INFO: Local state found at ${p} (should be in .gitignore)` };
    }
  }
  
  return { passed: true, message: 'OK: No local state files in project root' };
}

function checkTestsNotPackaged(): CheckResult {
  const pkgPath = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  
  // tests/ should NOT be in the files array
  if (pkg.files && Array.isArray(pkg.files) && pkg.files.includes('tests')) {
    return { passed: false, message: 'INVALID: tests/ should not be in package.json files array (tests are for development only)' };
  }
  
  return { passed: true, message: 'OK: tests/ is not in package.json files (correct - tests are development only)' };
}

function checkGitignoreIgnoresTests(): CheckResult {
  const gitignorePath = join(root, '.gitignore');
  const content = readFileSync(gitignorePath, 'utf-8');
  
  // Check for Python temporary files in .gitignore
  if (!content.includes('*.py')) {
    return { passed: false, message: 'WARNING: .gitignore should ignore Python temporary files (*.py, __pycache__, etc.)' };
  }
  
  return { passed: true, message: 'OK: .gitignore includes Python temporary file patterns' };
}

// Run all checks
console.log('='.repeat(60));
console.log('Package Contents Check');
console.log('='.repeat(60));
console.log();

const checks = [
  { name: 'dist/index.js', fn: checkDistEntry },
  { name: 'agents/ directory', fn: checkAgents },
  { name: 'templates/ directory', fn: checkTemplates },
  { name: 'skills/use-slim-agents/SKILL.md', fn: checkSkill },
  { name: 'package.json', fn: checkPackageJson },
  { name: 'README.md', fn: checkReadme },
  { name: 'CHANGELOG.md', fn: checkChangelog },
  { name: 'docs/ directory', fn: checkDocs },
  { name: 'examples/prompt-evals/', fn: checkPromptEvals },
  { name: '.gitignore', fn: checkGitignore },
  { name: 'Local state files', fn: checkLocalState },
  { name: 'tests/ not packaged', fn: checkTestsNotPackaged },
  { name: '.gitignore Python patterns', fn: checkGitignoreIgnoresTests },
];

let passed = 0;
let failed = 0;
let warnings = 0;

for (const check of checks) {
  const result = check.fn();
  const icon = result.passed ? '✓' : '✗';
  const prefix = result.passed ? '  ' : '✗ ';
  
  console.log(`${prefix} ${result.message}`);
  
  if (result.message.includes('WARNING') || result.message.includes('INFO')) {
    warnings++;
  } else if (result.passed) {
    passed++;
  } else {
    failed++;
  }
}

console.log();
console.log('='.repeat(60));
console.log(`Results: ${passed} passed, ${warnings} warnings, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  console.log();
  console.log('❌ Package check FAILED. Please fix the issues above.');
  process.exit(1);
} else {
  console.log();
  console.log('✓ Package check PASSED.');
  process.exit(0);
}