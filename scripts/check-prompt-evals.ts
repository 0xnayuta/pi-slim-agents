#!/usr/bin/env tsx
/**
 * Static prompt eval checker.
 * 
 * Validates:
 * 1. All eval files exist
 * 2. Each agent has at least 3 eval cases
 * 3. Each eval case has required fields
 * 4. Built-in agent files are non-empty
 * 5. Agent prompts contain boundary constraints
 * 6. docs/prompt-tuning.md exists and contains checklist
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

interface EvalCase {
  name: string;
  agent: string;
  mode: string;
  task: string;
  expectedBehavior: string[];
}

interface EvalFile {
  path: string;
  cases: EvalCase[];
}

// Built-in agents that need eval files
const BUILTIN_AGENTS = ['explorer', 'librarian', 'oracle', 'fixer', 'designer', 'orchestrator'];

// Required fields for each eval case
const REQUIRED_FIELDS = ['Agent:', 'Task:', 'Expected behavior:'];

function readFile(path: string): string {
  return readFileSync(path, 'utf-8');
}

function parseEvalFile(path: string): EvalFile {
  const content = readFile(path);
  const cases: EvalCase[] = [];
  
  // Split by Case headers
  const caseMatches = content.split(/(?=## Case:)/);
  
  for (const caseBlock of caseMatches) {
    if (!caseBlock.trim() || !caseBlock.startsWith('## Case:')) continue;
    
    const lines = caseBlock.split('\n');
    let agent = '';
    let mode = '';
    let task = '';
    let name = '';
    const expectedBehavior: string[] = [];
    let inExpected = false;
    let currentKey = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('## Case:')) {
        name = trimmed.replace('## Case:', '').trim();
      } else if (trimmed === 'Agent:' || trimmed.startsWith('Agent:')) {
        currentKey = 'agent';
        // Handle inline value: "Agent: explorer"
        const inline = trimmed.replace('Agent:', '').trim();
        if (inline) agent = inline.toLowerCase();
      } else if (trimmed === 'Mode:' || trimmed.startsWith('Mode:')) {
        currentKey = 'mode';
        const inline = trimmed.replace('Mode:', '').trim();
        if (inline) mode = inline;
      } else if (trimmed === 'Task:' || trimmed.startsWith('Task:')) {
        currentKey = 'task';
        const inline = trimmed.replace('Task:', '').trim();
        if (inline) task = inline;
      } else if (trimmed === 'Expected behavior:' || trimmed.startsWith('Expected behavior:')) {
        currentKey = 'expected';
        inExpected = true;
      } else if (inExpected) {
        if (trimmed.startsWith('- ')) {
          expectedBehavior.push(trimmed);
        } else if (trimmed && !trimmed.startsWith('Good output') && !trimmed.startsWith('Bad output') && !trimmed.startsWith('**')) {
          // End of expected behavior section
          inExpected = false;
          currentKey = '';
        }
      } else if (currentKey === 'agent' && trimmed && !trimmed.startsWith('-') && !trimmed.startsWith('#')) {
        agent = trimmed.toLowerCase();
        currentKey = '';
      } else if (currentKey === 'mode' && trimmed && !trimmed.startsWith('-') && !trimmed.startsWith('#')) {
        mode = trimmed;
        currentKey = '';
      } else if (currentKey === 'task' && trimmed && !trimmed.startsWith('-') && !trimmed.startsWith('#')) {
        task = trimmed;
        currentKey = '';
      }
    }
    
    if (name && agent && task) {
      cases.push({ name, agent, mode, task, expectedBehavior });
    }
  }
  
  return { path, cases };
}

function checkEvalFilesExist(): { pass: boolean; errors: string[] } {
  const errors: string[] = [];
  const evalDir = join(ROOT, 'examples', 'prompt-evals');
  
  if (!existsSync(evalDir)) {
    errors.push('examples/prompt-evals/ directory does not exist');
    return { pass: false, errors };
  }
  
  const evalFiles = [
    'explorer.eval.md',
    'librarian.eval.md',
    'oracle.eval.md',
    'fixer.eval.md',
    'designer.eval.md',
    'orchestrator.eval.md',
    'template-evals.md'
  ];
  
  for (const file of evalFiles) {
    const path = join(evalDir, file);
    if (!existsSync(path)) {
      errors.push(`Missing eval file: examples/prompt-evals/${file}`);
    } else if (statSync(path).size === 0) {
      errors.push(`Empty eval file: examples/prompt-evals/${file}`);
    }
  }
  
  return { pass: errors.length === 0, errors };
}

function checkAgentEvalCount(): { pass: boolean; errors: string[]; details: Record<string, number> } {
  const errors: string[] = [];
  const details: Record<string, number> = {};
  const evalDir = join(ROOT, 'examples', 'prompt-evals');
  
  for (const agent of BUILTIN_AGENTS) {
    const evalFile = join(evalDir, `${agent}.eval.md`);
    if (!existsSync(evalFile)) {
      errors.push(`No eval file for agent: ${agent}`);
      details[agent] = 0;
      continue;
    }
    
    const parsed = parseEvalFile(evalFile);
    details[agent] = parsed.cases.length;
    
    if (parsed.cases.length < 3) {
      errors.push(`Agent "${agent}" has only ${parsed.cases.length} eval cases (minimum: 3)`);
    }
  }
  
  return { pass: errors.length === 0, errors, details };
}

function checkEvalCaseFields(): { pass: boolean; errors: string[] } {
  const errors: string[] = [];
  const evalDir = join(ROOT, 'examples', 'prompt-evals');
  
  for (const agent of BUILTIN_AGENTS) {
    const evalFile = join(evalDir, `${agent}.eval.md`);
    if (!existsSync(evalFile)) continue;
    
    const parsed = parseEvalFile(evalFile);
    
    for (const cas of parsed.cases) {
      // Check required fields
      const content = readFile(evalFile);
      const caseSection = content.split(`## Case: ${cas.name}`)[1]?.split('## Case:')[0] || '';
      
      for (const field of REQUIRED_FIELDS) {
        if (!caseSection.includes(field)) {
          errors.push(`Case "${cas.name}" in ${agent}.eval.md missing field: ${field}`);
        }
      }
    }
  }
  
  return { pass: errors.length === 0, errors };
}

function checkAgentFiles(): { pass: boolean; errors: string[] } {
  const errors: string[] = [];
  const agentsDir = join(ROOT, 'agents');
  
  for (const agent of BUILTIN_AGENTS) {
    const agentFile = join(agentsDir, `${agent}.md`);
    if (!existsSync(agentFile)) {
      errors.push(`Missing agent file: agents/${agent}.md`);
    } else {
      const content = readFile(agentFile);
      if (content.length < 100) {
        errors.push(`Agent file too small: agents/${agent}.md`);
      }
    }
  }
  
  return { pass: errors.length === 0, errors };
}

function checkAgentBoundaries(): { pass: boolean; errors: string[] } {
  const errors: string[] = [];
  const agentsDir = join(ROOT, 'agents');
  
  // Patterns that indicate boundary constraints
  const boundaryPatterns = [
    /do not/i,
    /avoid/i,
    /do not claim/i,
    /read-only/i,
    /readonly/i,
    /only when/i,
    /constrained/i
  ];
  
  for (const agent of BUILTIN_AGENTS) {
    const agentFile = join(agentsDir, `${agent}.md`);
    if (!existsSync(agentFile)) continue;
    
    const content = readFile(agentFile).toLowerCase();
    const hasBoundary = boundaryPatterns.some(p => p.test(content));
    
    if (!hasBoundary) {
      errors.push(`Agent "${agent}" does not contain clear boundary constraints`);
    }
  }
  
  return { pass: errors.length === 0, errors };
}

function checkPromptTuningDoc(): { pass: boolean; errors: string[] } {
  const errors: string[] = [];
  const docPath = join(ROOT, 'docs', 'prompt-tuning.md');
  
  if (!existsSync(docPath)) {
    errors.push('docs/prompt-tuning.md does not exist');
    return { pass: false, errors };
  }
  
  const content = readFile(docPath);
  
  // Check for checklist presence
  if (!content.includes('checklist') && !content.includes('Checklist')) {
    errors.push('docs/prompt-tuning.md does not contain a checklist section');
  }
  
  // Check for key questions
  const checklistItems = [
    'narrow role',
    'not do',
    'avoid',
    'evidence',
    'bounded',
    'duplicate',
    'modes?',
    'short'
  ];
  
  const foundItems = checklistItems.filter(item => 
    content.toLowerCase().includes(item.toLowerCase())
  );
  
  if (foundItems.length < 4) {
    errors.push(`docs/prompt-tuning.md missing key checklist items (found ${foundItems.length}/8)`);
  }
  
  return { pass: errors.length === 0, errors };
}

function checkTemplateEvals(): { pass: boolean; errors: string[]; details: string[] } {
  const errors: string[] = [];
  const details: string[] = [];
  const evalPath = join(ROOT, 'examples', 'prompt-evals', 'template-evals.md');
  
  if (!existsSync(evalPath)) {
    errors.push('template-evals.md does not exist');
    return { pass: false, errors, details };
  }
  
  const content = readFile(evalPath);
  
  const expectedTemplates = [
    'security-reviewer',
    'test-writer',
    'doc-generator',
    'refactor-planner',
    'bug-triager',
    'release-checker',
    'cpp-reviewer'
  ];
  
  for (const template of expectedTemplates) {
    if (!content.includes(template)) {
      errors.push(`template-evals.md missing coverage for: ${template}`);
    } else {
      details.push(`✓ ${template}`);
    }
  }
  
  return { pass: errors.length === 0, errors, details };
}

function runChecks(): void {
  console.log('🔍 Running prompt eval static checks...\n');
  
  let allPass = true;
  
  // Check 1: Eval files exist
  console.log('📁 Check 1: Eval files exist');
  const check1 = checkEvalFilesExist();
  if (check1.pass) {
    console.log('  ✅ All eval files present\n');
  } else {
    allPass = false;
    check1.errors.forEach(e => console.log(`  ❌ ${e}`));
    console.log('');
  }
  
  // Check 2: Agent eval count
  console.log('📊 Check 2: Agent eval count (min 3 per agent)');
  const check2 = checkAgentEvalCount();
  if (check2.pass) {
    console.log('  ✅ All agents have >= 3 eval cases');
    Object.entries(check2.details).forEach(([agent, count]) => {
      console.log(`     - ${agent}: ${count} cases`);
    });
    console.log('');
  } else {
    allPass = false;
    check2.errors.forEach(e => console.log(`  ❌ ${e}`));
    console.log('');
  }
  
  // Check 3: Eval case fields
  console.log('📝 Check 3: Eval case required fields');
  const check3 = checkEvalCaseFields();
  if (check3.pass) {
    console.log('  ✅ All eval cases have required fields\n');
  } else {
    allPass = false;
    check3.errors.forEach(e => console.log(`  ❌ ${e}`));
    console.log('');
  }
  
  // Check 4: Agent files non-empty
  console.log('📄 Check 4: Agent files non-empty');
  const check4 = checkAgentFiles();
  if (check4.pass) {
    console.log('  ✅ All agent files exist and non-empty\n');
  } else {
    allPass = false;
    check4.errors.forEach(e => console.log(`  ❌ ${e}`));
    console.log('');
  }
  
  // Check 5: Agent boundaries
  console.log('🚧 Check 5: Agent boundary constraints');
  const check5 = checkAgentBoundaries();
  if (check5.pass) {
    console.log('  ✅ All agents have boundary constraints\n');
  } else {
    allPass = false;
    check5.errors.forEach(e => console.log(`  ❌ ${e}`));
    console.log('');
  }
  
  // Check 6: prompt-tuning.md
  console.log('📚 Check 6: docs/prompt-tuning.md checklist');
  const check6 = checkPromptTuningDoc();
  if (check6.pass) {
    console.log('  ✅ prompt-tuning.md contains checklist\n');
  } else {
    allPass = false;
    check6.errors.forEach(e => console.log(`  ❌ ${e}`));
    console.log('');
  }
  
  // Check 7: Template coverage
  console.log('🎨 Check 7: Template eval coverage');
  const check7 = checkTemplateEvals();
  if (check7.pass) {
    console.log('  ✅ All templates have eval coverage');
    check7.details.forEach(d => console.log(`     ${d}`));
    console.log('');
  } else {
    allPass = false;
    check7.errors.forEach(e => console.log(`  ❌ ${e}`));
    console.log('');
  }
  
  // Summary
  console.log('─'.repeat(50));
  if (allPass) {
    console.log('✅ All checks passed!');
    process.exit(0);
  } else {
    console.log('❌ Some checks failed. See above for details.');
    process.exit(1);
  }
}

runChecks();