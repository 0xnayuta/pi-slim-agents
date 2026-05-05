/**
 * Agent loading and resolution.
 *
 * Discovery priority (highest wins for same name):
 *   1. Project-level  .pi/slim-agents/agents/*.md
 *   2. User-level     ~/.pi/agent/slim-agents/agents/*.md
 *   3. Package built-in  agents/*.md  (bundled with the npm package)
 *
 * Config overrides from slim-agents.json are applied after loading.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AgentDefinition,
  AgentFileEntry,
  AgentFrontmatter,
  AgentSource,
  SlimAgentsConfig,
} from './types.js';
import {
  AGENTS_DIR_NAME,
  isSafeAgentName,
  nameFromFilename,
  parseAgentFrontmatter,
  PROJECT_AGENTS_DIR,
  USER_AGENTS_DIR,
} from './utils.js';
import { getAgentOverride, isAgentDisabled } from './config.js';

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Discover and resolve all available agents.
 * Returns agents sorted by order (ascending), then by name.
 */
export function loadAgents(cwd: string, config: SlimAgentsConfig): AgentDefinition[] {
  const entries = discoverAgentFiles(cwd, config);
  const resolved = resolveAgents(entries, config);
  return resolved.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/**
 * Get a single agent by name.
 */
export function getAgent(
  name: string,
  cwd: string,
  config: SlimAgentsConfig,
): AgentDefinition | undefined {
  const agents = loadAgents(cwd, config);
  return agents.find(a => a.name === name);
}

/**
 * List agent names for display.
 */
export function listAgentNames(cwd: string, config: SlimAgentsConfig): string[] {
  return loadAgents(cwd, config).map(a => a.name);
}

// ─── Discovery ──────────────────────────────────────────────────────

function discoverAgentFiles(cwd: string, config: SlimAgentsConfig): AgentFileEntry[] {
  const seen = new Map<string, AgentFileEntry>();

  // Scan directories in reverse priority order so higher priority overwrites
  const dirs: Array<{ dir: string; source: AgentSource }> = [
    // Extra dirs from config (lowest priority)
    ...(config.extraAgentDirs ?? []).map(d => ({
      dir: path.isAbsolute(d) ? d : path.join(cwd, d),
      source: 'package' as const,
    })),
    // 3. Package built-in
    { dir: getPackageAgentsDir(), source: 'package' },
    // 2. User-level
    { dir: USER_AGENTS_DIR, source: 'user' },
    // 1. Project-level (highest priority)
    { dir: path.join(cwd, PROJECT_AGENTS_DIR), source: 'project' },
  ];

  for (const { dir, source } of dirs) {
    scanAgentDir(dir, source).forEach(entry => {
      seen.set(entry.name, entry); // Higher priority overwrites
    });
  }

  return [...seen.values()];
}

function scanAgentDir(dirPath: string, source: AgentSource): AgentFileEntry[] {
  const entries: AgentFileEntry[] = [];

  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;

      const name = nameFromFilename(file);
      if (!isSafeAgentName(name)) continue;

      entries.push({
        name,
        filePath: path.join(dirPath, file),
        source,
      });
    }
  } catch {
    // Directory doesn't exist — that's fine
  }

  return entries;
}

// ─── Resolution ─────────────────────────────────────────────────────

function resolveAgents(
  entries: AgentFileEntry[],
  config: SlimAgentsConfig,
): AgentDefinition[] {
  const agents: AgentDefinition[] = [];

  for (const entry of entries) {
    if (isAgentDisabled(config, entry.name)) continue;

    try {
      const raw = fs.readFileSync(entry.filePath, 'utf-8');
      const { frontmatter, body } = parseAgentFrontmatter(raw);
      const fm = frontmatter as Record<string, unknown>;

      const override = getAgentOverride(config, entry.name);

      // Build agent definition
      const agent: AgentDefinition = {
        name: entry.name,
        description:
          override?.description ??
          (typeof fm.description === 'string' ? fm.description : `Specialist agent: ${entry.name}`),
        prompt: buildPrompt(body, override?.prompt, override?.appendPrompt),
        temperature: override?.temperature ?? (typeof fm.temperature === 'number' ? fm.temperature : 0.2),
        role: typeof fm.role === 'string' ? fm.role : entry.name,
        readonly: fm.readonly === true,
        tags: override?.tags ?? (Array.isArray(fm.tags) ? fm.tags as string[] : []),
        order: typeof fm.order === 'number' ? fm.order : 100,
        sourcePath: entry.filePath,
      };

      agents.push(agent);
    } catch {
      // Skip unreadable files
    }
  }

  return agents;
}

function buildPrompt(
  body: string,
  overridePrompt?: string,
  appendPrompt?: string,
): string {
  if (overridePrompt) return overridePrompt;
  if (appendPrompt) return `${body}\n\n${appendPrompt}`;
  return body;
}

// ─── Package Built-in Agents Dir ────────────────────────────────────

function getPackageAgentsDir(): string {
  // When running as an installed package, agents/ is relative to package root.
  // import.meta.url points to the compiled .js file in src/.
  const srcDir = path.dirname(new URL(import.meta.url).pathname);
  return path.join(srcDir, '..', AGENTS_DIR_NAME);
}
