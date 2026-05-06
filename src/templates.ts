/**
 * Agent templates service for pi-slim-agents.
 *
 * Provides:
 *   - loadTemplates(): discover and parse all templates
 *   - createAgentFromTemplate(): create a project-level agent from a template
 *   - validateAgents(): validate agent files across all locations
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

import type { AgentDefinition, AgentFrontmatter, FileMetadata, SlimAgentsConfig } from './types.js';
import {
  getPackageTemplatesDir,
  isSafeAgentName,
  nameFromFilename,
  parseAgentFrontmatter,
  PROJECT_AGENTS_DIR,
} from './utils.js';
import { loadConfig } from './config.js';
import { loadAgents } from './agents.js';
import { collectFileMetadata } from './metadata.js';
import { sanitizeErrorMessage, safeDisplayPath } from './security.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface TemplateInfo {
  name: string;
  description: string;
  readonly: boolean;
  temperature: number;
  aliases: string[];
  recommendedMode: string;
  filePath: string;
  tags: string[];
  /** File-level metadata (createdAt, lastModified, sizeBytes). */
  metadata?: FileMetadata | null;
}

export interface TemplateLoadResult {
  ok: boolean;
  templates: TemplateInfo[];
  error?: string;
}

export interface CreateResult {
  ok: boolean;
  /** Absolute file path for internal use and testing */
  filePath?: string;
  /** Safe display path for user-facing output (may differ from filePath) */
  displayPath?: string;
  error?: string;
  warnings?: string[];
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  file: string;
  message: string;
  field?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  checked: {
    builtin: number;
    template: number;
    user: number;
    project: number;
    total: number;
  };
  tagsChecked: number;
  invalidTagsCount: number;
}

// ─── Template Loading ───────────────────────────────────────────────

/**
 * Discover and parse all available templates from the package's templates/ directory.
 */
export function loadTemplates(): TemplateLoadResult {
  const templatesDir = getTemplatesDir();

  if (!templatesDir) {
    return {
      ok: false,
      templates: [],
      error: 'Cannot locate package templates directory',
    };
  }

  if (!fs.existsSync(templatesDir)) {
    return {
      ok: false,
      templates: [],
      error: `Templates directory not found: ${templatesDir}`,
    };
  }

  const templates: TemplateInfo[] = [];

  try {
    const files = fs.readdirSync(templatesDir);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(templatesDir, file);
      const name = nameFromFilename(file);

      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { frontmatter } = parseAgentFrontmatter(raw);
        const fm = frontmatter as AgentFrontmatter;

        const templateName = typeof fm.name === 'string' ? fm.name : name;
        const description =
          typeof fm.description === 'string'
            ? fm.description
            : `Template: ${templateName}`;

        // Strip template suffix from name
        const cleanName = templateName.replace(/-template$/, '');

        templates.push({
          name: cleanName,
          description,
          readonly: fm.readonly === true,
          temperature: typeof fm.temperature === 'number' ? fm.temperature : 0.2,
          aliases: Array.isArray(fm.aliases)
            ? fm.aliases.filter((a): a is string => typeof a === 'string')
            : [],
          recommendedMode:
            typeof fm.recommendedMode === 'string' ? fm.recommendedMode : 'normal',
          filePath,
          tags: Array.isArray(fm.tags)
            ? fm.tags.filter((t): t is string => typeof t === 'string')
            : [],
          metadata: collectFileMetadata(filePath),
        });
      } catch (err) {
        // Skip unreadable files
        console.warn(`[slim-agents] Failed to read template "${file}": ${err}`);
      }
    }

    return { ok: true, templates };
  } catch (err) {
    return {
      ok: false,
      templates: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get a single template by name.
 */
export function getTemplate(name: string): TemplateInfo | null {
  const result = loadTemplates();
  if (!result.ok) return null;
  return result.templates.find(t => t.name === name) ?? null;
}

// ─── Agent Creation from Template ──────────────────────────────────

/**
 * Create a project-level agent from a template.
 *
 * Writes to: .pi/slim-agents/agents/<agentName>.md
 *
 * @param templateName - The template name (e.g., "security-reviewer")
 * @param agentName    - The new agent name (e.g., "security")
 * @param cwd          - Project root directory
 * @param force        - Overwrite existing file (default: false)
 */
export function createAgentFromTemplate(
  templateName: string,
  agentName: string,
  cwd: string,
  force = false,
): CreateResult {
  const warnings: string[] = [];

  // Validate agent name
  if (!isSafeAgentName(agentName)) {
    return {
      ok: false,
      error: `Invalid agent name "${agentName}". Use lowercase letters, numbers, hyphens, and underscores only. No spaces or path traversal.`,
    };
  }

  // Load the template
  const template = getTemplate(templateName);
  if (!template) {
    return {
      ok: false,
      error: `Template "${templateName}" not found. Use /agents templates to see available templates.`,
    };
  }

  // Determine target path
  const agentsDir = path.join(cwd, PROJECT_AGENTS_DIR);
  const targetPath = path.join(agentsDir, `${agentName}.md`);

  // Check for existing file
  if (fs.existsSync(targetPath) && !force) {
    const safeDisplay = safeDisplayPath(targetPath, cwd);
    return {
      ok: false,
      error: `Agent file already exists: ${safeDisplay}. Use --force to overwrite.`,
    };
  }

  // Read template content
  let raw: string;
  try {
    raw = fs.readFileSync(template.filePath, 'utf-8');
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read template file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Update frontmatter name
  let newContent = raw.replace(
    /^name:\s*.*$/m,
    `name: ${agentName}`,
  );

  // Load existing agents to check alias conflicts
  const config = loadConfig(cwd);
  const existingAgents = loadAgents(cwd, config);
  const existingNames = new Set(existingAgents.map(a => a.name));
  const existingAliases = new Map<string, string>();

  for (const agent of existingAgents) {
    for (const alias of agent.aliases) {
      existingAliases.set(alias, agent.name);
    }
  }

  // Check for alias conflicts
  const templateAliases: string[] = [];
  const { frontmatter } = parseAgentFrontmatter(raw);
  const fm = frontmatter as AgentFrontmatter;

  if (Array.isArray(fm.aliases)) {
    for (const alias of fm.aliases) {
      if (typeof alias === 'string') {
        templateAliases.push(alias);
      }
    }
  }

  const conflictingAliases: string[] = [];
  const newAliases: string[] = [];

  for (const alias of templateAliases) {
    if (existingNames.has(alias)) {
      conflictingAliases.push(alias);
    } else if (existingAliases.has(alias)) {
      conflictingAliases.push(alias);
    } else {
      newAliases.push(alias);
    }
  }

  if (conflictingAliases.length > 0) {
    warnings.push(
      `Conflicting aliases skipped: ${conflictingAliases.join(', ')}. These aliases are already in use by another agent.`,
    );
  }

  // Generate new aliases line if there are new aliases
  if (newAliases.length > 0) {
    newContent = newContent.replace(
      /^aliases:\s*\n[\s\S]*?^---$/m,
      `aliases:\n${newAliases.map(a => `  - ${a}`).join('\n')}`,
    );
  } else {
    // Remove aliases section entirely if no new aliases
    newContent = newContent.replace(/^aliases:\s*\n[\s\S]*?^---$/m, '');
  }

  // Ensure directory exists
  let dirCreated = false;
  try {
    if (!fs.existsSync(agentsDir)) {
      fs.mkdirSync(agentsDir, { recursive: true });
      dirCreated = true;
    }
  } catch (err) {
    // Provide safe error message without exposing sensitive path details
    const safeDirHint = dirCreated ? ' (directory creation succeeded but verify permissions)' : '';
    return {
      ok: false,
      error: `Failed to create agents directory${safeDirHint}. Check write permissions.`,
    };
  }

  // Write the file
  try {
    fs.writeFileSync(targetPath, newContent, 'utf-8');
  } catch (err) {
    // Sanitize the error message
    const sanitizedError = sanitizeErrorMessage(err);
    // Show safe display path instead of full path in error message
    const fileSafePath = safeDisplayPath(targetPath, cwd);
    return {
      ok: false,
      filePath: targetPath, // Keep absolute path for backward compatibility
      displayPath: fileSafePath, // Safe path for user-facing output
      error: `Failed to write agent file "${fileSafePath}": ${sanitizedError}`,
    };
  }

  // Return both absolute path (for internal use) and safe display path (for user output)
  const resultSafePath = safeDisplayPath(targetPath, cwd);
  return {
    ok: true,
    filePath: targetPath, // Keep absolute path for backward compatibility
    displayPath: resultSafePath, // Safe path for user-facing output
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ─── Agent Validation ───────────────────────────────────────────────

/**
 * Validate agent files across all locations (package built-in, templates, user-level, project-level).
 *
 * Does NOT modify any files.
 */
export function validateAgents(cwd: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const checked = { builtin: 0, template: 0, user: 0, project: 0, total: 0 };
  const tagsCounters = { tagsChecked: 0, invalidTagsCount: 0 };

  // 1. Validate built-in agents
  const config = loadConfig(cwd);
  const builtinAgents = loadAgents(cwd, config).filter(a => a.source === 'package');
  const builtinNames = new Set<string>();
  const builtinAliases = new Map<string, string>();

  for (const agent of builtinAgents) {
    builtinNames.add(agent.name);
    for (const alias of agent.aliases) {
      builtinAliases.set(alias, agent.name);
    }
  }

  for (const agent of builtinAgents) {
    checked.builtin++;
    checked.total++;

    // Check required fields
    if (!agent.description || agent.description === `Specialist agent: ${agent.name}`) {
      issues.push({
        type: 'warning',
        file: agent.sourcePath ?? 'builtin',
        message: `Missing or generic description for agent "${agent.name}"`,
        field: 'description',
      });
    }

    // Check empty body
    if (!agent.body || agent.body.trim().length === 0) {
      issues.push({
        type: 'error',
        file: agent.sourcePath ?? 'builtin',
        message: `Empty prompt body for agent "${agent.name}"`,
        field: 'body',
      });
    }

    // Check readonly=false without boundary
    if (!agent.readonly) {
      const bodyLower = agent.body.toLowerCase();
      const hasBoundary =
        bodyLower.includes('not modify') ||
        bodyLower.includes('do not modify') ||
        bodyLower.includes("don't modify") ||
        bodyLower.includes('do not change') ||
        bodyLower.includes("don't change") ||
        bodyLower.includes('not擅自') ||
        bodyLower.includes('边界') ||
        bodyLower.includes('only when');

      if (!hasBoundary) {
        issues.push({
          type: 'warning',
          file: agent.sourcePath ?? 'builtin',
          message: `Agent "${agent.name}" has readonly=false but prompt does not clearly state modification boundaries`,
          field: 'body',
        });
      }
    }

    // Tags validation
    const tags = agent.tags ?? [];
    tagsCounters.tagsChecked += tags.length;

    if (tags.length === 0) {
      issues.push({
        type: 'warning',
        file: agent.sourcePath ?? 'builtin',
        message: `Agent "${agent.name}" has no tags — consider adding tags for search/filtering`,
        field: 'tags',
      });
    } else if (tags.length > 8) {
      issues.push({
        type: 'warning',
        file: agent.sourcePath ?? 'builtin',
        message: `Agent "${agent.name}" has ${tags.length} tags (recommended: ≤8)`,
        field: 'tags',
      });
    }

    // Validate individual tag safety
    for (const tag of tags) {
      if (!isValidTag(tag)) {
        tagsCounters.invalidTagsCount++;
        issues.push({
          type: 'error',
          file: agent.sourcePath ?? 'builtin',
          message: `Invalid tag "${tag}" for agent "${agent.name}" — only lowercase letters, numbers, hyphens, underscores allowed`,
          field: 'tags',
        });
      }
    }

    // Check for duplicate tags
    const seenTags = new Set<string>();
    for (const tag of tags) {
      if (seenTags.has(tag)) {
        issues.push({
          type: 'warning',
          file: agent.sourcePath ?? 'builtin',
          message: `Duplicate tag "${tag}" in agent "${agent.name}"`,
          field: 'tags',
        });
      }
      seenTags.add(tag);
    }

    // Validate temperature range for builtin agents
    if (agent.temperature !== undefined && (agent.temperature < 0 || agent.temperature > 2)) {
      issues.push({
        type: 'warning',
        file: agent.sourcePath ?? 'builtin',
        message: `Agent "${agent.name}" has temperature ${agent.temperature} outside valid range (0-2)`,
        field: 'temperature',
      });
    }

    // Validate recommendedMode for builtin agents
    const validModes = ['quick', 'normal', 'deep'];
    if (agent.recommendedMode && !validModes.includes(agent.recommendedMode)) {
      issues.push({
        type: 'warning',
        file: agent.sourcePath ?? 'builtin',
        message: `Agent "${agent.name}" has invalid recommendedMode "${agent.recommendedMode}" — valid values: ${validModes.join(', ')}`,
        field: 'recommendedMode',
      });
    }
  }

  // 2. Validate templates
  const templatesResult = loadTemplates();
  const templateNames = new Set<string>();

  if (templatesResult.ok) {
    for (const tmpl of templatesResult.templates) {
      templateNames.add(tmpl.name);
      checked.template++;
      checked.total++;

      // Template name should match filename
      const fileName = nameFromFilename(path.basename(tmpl.filePath));
      if (fileName !== tmpl.name && fileName !== `${tmpl.name}-template`) {
        issues.push({
          type: 'warning',
          file: tmpl.filePath,
          message: `Template name "${tmpl.name}" does not match filename "${fileName}"`,
          field: 'name',
        });
      }

      // Check required fields
      if (!tmpl.description) {
        issues.push({
          type: 'warning',
          file: tmpl.filePath,
          message: `Missing description for template "${tmpl.name}"`,
          field: 'description',
        });
      }

      // Tags validation for templates
      const tags = tmpl.tags ?? [];
      tagsCounters.tagsChecked += tags.length;

      if (tags.length === 0) {
        issues.push({
          type: 'warning',
          file: tmpl.filePath,
          message: `Template "${tmpl.name}" has no tags — consider adding tags for filtering`,
          field: 'tags',
        });
      } else if (tags.length > 8) {
        issues.push({
          type: 'warning',
          file: tmpl.filePath,
          message: `Template "${tmpl.name}" has ${tags.length} tags (recommended: ≤8)`,
          field: 'tags',
        });
      }

      // Validate recommendedMode for templates
      const validModes = ['quick', 'normal', 'deep'];
      if (!validModes.includes(tmpl.recommendedMode)) {
        issues.push({
          type: 'warning',
          file: tmpl.filePath,
          message: `Template "${tmpl.name}" has invalid recommendedMode "${tmpl.recommendedMode}" — valid values: ${validModes.join(', ')}`,
          field: 'recommendedMode',
        });
      }

      for (const tag of tags) {
        if (!isValidTag(tag)) {
          tagsCounters.invalidTagsCount++;
          issues.push({
            type: 'error',
            file: tmpl.filePath,
            message: `Invalid tag "${tag}" for template "${tmpl.name}" — only lowercase letters, numbers, hyphens, underscores allowed`,
            field: 'tags',
          });
        }
      }

      const seenTags = new Set<string>();
      for (const tag of tags) {
        if (seenTags.has(tag)) {
          issues.push({
            type: 'warning',
            file: tmpl.filePath,
            message: `Duplicate tag "${tag}" in template "${tmpl.name}"`,
            field: 'tags',
          });
        }
        seenTags.add(tag);
      }

      // Temperature range validation for templates
      if (typeof tmpl.temperature !== 'number' || tmpl.temperature < 0 || tmpl.temperature > 2) {
        issues.push({
          type: 'warning',
          file: tmpl.filePath,
          message: `Template "${tmpl.name}" has temperature ${tmpl.temperature} outside valid range (0-2)`,
          field: 'temperature',
        });
      }
    }
  }

  // 3. Validate user-level agents
  const userAgentsDir = getUserAgentsDir();
  if (fs.existsSync(userAgentsDir)) {
    validateAgentDir(userAgentsDir, 'user', builtinNames, builtinAliases, issues, checked, tagsCounters);
  }

  // 4. Validate project-level agents
  const projectAgentsDir = path.join(cwd, PROJECT_AGENTS_DIR);
  if (fs.existsSync(projectAgentsDir)) {
    validateAgentDir(
      projectAgentsDir,
      'project',
      new Set([...builtinNames, ...templateNames]),
      builtinAliases,
      issues,
      checked,
      tagsCounters,
    );
  }

  // 5. Check config enabled references
  const enabledAgents = loadAgents(cwd, config).filter(a => a.enabled);
  const enabledNames = new Set(enabledAgents.map(a => a.name));

  if (config.agents) {
    for (const [agentName, override] of Object.entries(config.agents)) {
      if (override.enabled === true && !enabledNames.has(agentName)) {
        // This would be odd — agent enabled but not found
        // This shouldn't happen with current load logic, but warn anyway
      }
    }
  }

  return {
    ok: issues.filter(i => i.type === 'error').length === 0,
    issues,
    checked,
    tagsChecked: tagsCounters.tagsChecked,
    invalidTagsCount: tagsCounters.invalidTagsCount,
  };
}

function validateAgentDir(
  dirPath: string,
  source: 'user' | 'project',
  knownNames: Set<string>,
  knownAliases: Map<string, string>,
  issues: ValidationIssue[],
  checked: ValidationResult['checked'],
  tagsCounters: { tagsChecked: number; invalidTagsCount: number },
): void {
  try {
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const filePath = path.join(dirPath, file);
      const name = nameFromFilename(file);

      // Skip names that don't pass validation
      if (!isSafeAgentName(name)) {
        issues.push({
          type: 'error',
          file: filePath,
          message: `Invalid agent name "${name}" in filename`,
          field: 'name',
        });
        continue;
      }

      checked[source]++;
      checked.total++;

      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const { frontmatter, body } = parseAgentFrontmatter(raw);
        const fm = frontmatter as AgentFrontmatter;

        const frontmatterName = typeof fm.name === 'string' ? fm.name : name;

        // Check name vs filename consistency
        if (frontmatterName !== name) {
          issues.push({
            type: 'warning',
            file: filePath,
            message: `Frontmatter name "${frontmatterName}" differs from filename "${name}"`,
            field: 'name',
          });
        }

        // Check required fields
        if (!fm.description) {
          issues.push({
            type: 'warning',
            file: filePath,
            message: `Missing description for agent "${name}"`,
            field: 'description',
          });
        }

        // Check empty body
        if (!body || body.trim().length === 0) {
          issues.push({
            type: 'error',
            file: filePath,
            message: `Empty prompt body for agent "${name}"`,
            field: 'body',
          });
        }

        // Check aliases
        if (Array.isArray(fm.aliases)) {
          const aliases = fm.aliases.filter((a): a is string => typeof a === 'string');

          for (const alias of aliases) {
            if (!isSafeAgentName(alias)) {
              issues.push({
                type: 'error',
                file: filePath,
                message: `Invalid alias "${alias}" for agent "${name}"`,
                field: 'aliases',
              });
            } else if (knownNames.has(alias)) {
              issues.push({
                type: 'error',
                file: filePath,
                message: `Alias "${alias}" of agent "${name}" conflicts with agent name "${alias}"`,
                field: 'aliases',
              });
            } else if (knownAliases.has(alias)) {
              const existing = knownAliases.get(alias)!;
              issues.push({
                type: 'error',
                file: filePath,
                message: `Alias "${alias}" of agent "${name}" conflicts with alias of agent "${existing}"`,
                field: 'aliases',
              });
            } else {
              // Valid alias — add to known aliases
              knownAliases.set(alias, name);
            }
          }
        }

        // Check readonly=false without boundary
        if (fm.readonly !== true) {
          const bodyLower = (body ?? '').toLowerCase();
          const hasBoundary =
            bodyLower.includes('not modify') ||
            bodyLower.includes('do not modify') ||
            bodyLower.includes("don't modify") ||
            bodyLower.includes('do not change') ||
            bodyLower.includes("don't change") ||
            bodyLower.includes('not擅自') ||
            bodyLower.includes('边界') ||
            bodyLower.includes('only when');

          if (!hasBoundary) {
            issues.push({
              type: 'warning',
              file: filePath,
              message: `Agent "${name}" has readonly=false but prompt does not clearly state modification boundaries`,
              field: 'body',
            });
          }
        }

        // Tags validation for user/project agents
        const tags = Array.isArray(fm.tags)
          ? fm.tags.filter((t): t is string => typeof t === 'string')
          : [];
        tagsCounters.tagsChecked += tags.length;

        if (tags.length === 0) {
          issues.push({
            type: 'warning',
            file: filePath,
            message: `Agent "${name}" has no tags — consider adding tags for search/filtering`,
            field: 'tags',
          });
        } else if (tags.length > 8) {
          issues.push({
            type: 'warning',
            file: filePath,
            message: `Agent "${name}" has ${tags.length} tags (recommended: ≤8)`,
            field: 'tags',
          });
        }

        for (const tag of tags) {
          if (!isValidTag(tag)) {
            tagsCounters.invalidTagsCount++;
            issues.push({
              type: 'error',
              file: filePath,
              message: `Invalid tag "${tag}" for agent "${name}" — only lowercase letters, numbers, hyphens, underscores allowed`,
              field: 'tags',
            });
          }
        }

        const seenTags = new Set<string>();
        for (const tag of tags) {
          if (seenTags.has(tag)) {
            issues.push({
              type: 'warning',
              file: filePath,
              message: `Duplicate tag "${tag}" in agent "${name}"`,
              field: 'tags',
            });
          }
          seenTags.add(tag);
        }

        // Add name to known names
        knownNames.add(name);

        // Validate temperature range
        const tempVal = (fm as Record<string, unknown>).temperature;
        if (tempVal !== undefined) {
          if (typeof tempVal !== 'number' || tempVal < 0 || tempVal > 2) {
            issues.push({
              type: 'warning',
              file: filePath,
              message: `Agent "${name}" has temperature ${tempVal} outside valid range (0-2)`,
              field: 'temperature',
            });
          }
        }

        // Validate recommendedMode
        const modeVal = (fm as Record<string, unknown>).recommendedMode;
        if (modeVal !== undefined) {
          const validModes = ['quick', 'normal', 'deep'];
          if (!validModes.includes(String(modeVal))) {
            issues.push({
              type: 'warning',
              file: filePath,
              message: `Agent "${name}" has invalid recommendedMode "${modeVal}" — valid values: ${validModes.join(', ')}`,
              field: 'recommendedMode',
            });
          }
        }
      } catch (err) {
        issues.push({
          type: 'error',
          file: filePath,
          message: `Failed to read agent file: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  } catch {
    // Directory doesn't exist or is unreadable
  }
}

// ─── Formatting ────────────────────────────────────────────────────

/**
 * Format the templates list for display.
 */
export function formatTemplatesList(templates: TemplateInfo[]): string {
  const lines: string[] = ['# Agent Templates', ''];
  lines.push(`${templates.length} template${templates.length === 1 ? '' : 's'} available. Templates are not enabled by default.`);
  lines.push('');
  lines.push('  Name                 Description                                          RO   Mode    Tags');
  lines.push('  ' + '─'.repeat(100));

  for (const tmpl of templates) {
    const name = tmpl.name.padEnd(18);
    const desc = truncate(tmpl.description, 48).padEnd(48);
    const ro = (tmpl.readonly ? 'yes' : 'no ').padEnd(4);
    const mode = tmpl.recommendedMode.padEnd(7);
    const tags = tmpl.tags.length > 0 ? tmpl.tags.slice(0, 4).join(', ') + (tmpl.tags.length > 4 ? '...' : '') : '—';
    lines.push(`  ${name} ${desc} ${ro} ${mode} ${tags}`);
  }
  lines.push('');
  lines.push('Usage: /agents create <template> <agent-name>');
  lines.push('Example: /agents create security-reviewer security');
  lines.push('');
  lines.push('To create a project-level agent, run:');
  lines.push('  /agents create <template-name> <agent-name>');
  lines.push('Then run: /agents reload');

  return lines.join('\n');
}

/**
 * Format the validation result for display.
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = ['# Agent Validation'];

  lines.push('');
  lines.push(`Checked: ${result.checked.total} agents`);
  lines.push(`  Built-in: ${result.checked.builtin}`);
  lines.push(`  Templates: ${result.checked.template}`);
  lines.push(`  User-level: ${result.checked.user}`);
  lines.push(`  Project-level: ${result.checked.project}`);
  lines.push('');
  lines.push(`Tags: ${result.tagsChecked} checked, ${result.invalidTagsCount} invalid`);
  lines.push('');

  if (result.issues.length === 0) {
    lines.push('✅ OK — No issues found.');
    return lines.join('\n');
  }
  const errors = result.issues.filter(i => i.type === 'error');
  const warnings = result.issues.filter(i => i.type === 'warning');
  if (errors.length > 0) {
    lines.push(`❌ ${errors.length} error${errors.length === 1 ? '' : 's'}:`);
    for (const issue of errors) {
      lines.push(`  - [${issue.file}] ${issue.message}`);
    }
    lines.push('');
  }
  if (warnings.length > 0) {
    lines.push(`⚠️  ${warnings.length} warning${warnings.length === 1 ? '' : 's'}:`);
    for (const issue of warnings) {
      lines.push(`  - [${issue.file}] ${issue.message}`);
    }
  }

  return lines.join('\n');
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

// ─── Tag Validation ────────────────────────────────────────────────

const VALID_TAG_RE = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Check if a tag is valid.
 * Valid: lowercase letters, numbers, hyphens, underscores; starts with letter or number; non-empty.
 */
export function isValidTag(tag: string): boolean {
  return VALID_TAG_RE.test(tag) && tag.length > 0;
}

// ─── Path Helpers ───────────────────────────────────────────────────

function getTemplatesDir(): string | null {
  const templatesDir = getPackageTemplatesDir();
  if (templatesDir) return templatesDir;
  
  // Fallback: derive from module location
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(srcDir, '..', 'templates');
}

function getUserAgentsDir(): string {
  return path.join(os.homedir(), '.pi', 'agent', 'pi-slim-agents', 'agents');
}
