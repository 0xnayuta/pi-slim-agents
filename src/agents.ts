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
import { fileURLToPath } from 'node:url';
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
  const sanitized = validateAndSanitizeAliases(resolved);
  return sanitized.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
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
  const resolved = resolveAgentName(name, agents);
  if (!resolved) return undefined;
  return agents.find(a => a.name === resolved);
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
    try {
      const raw = fs.readFileSync(entry.filePath, 'utf-8');
      const { frontmatter, body } = parseAgentFrontmatter(raw);
      const fm = frontmatter as AgentFrontmatter;
      const agentName = typeof fm.name === 'string' ? fm.name : entry.name;

      if (!isSafeAgentName(agentName)) continue;

      const override = getAgentOverride(config, agentName);
      const tags = Array.isArray(fm.tags)
        ? fm.tags.filter((tag): tag is string => typeof tag === 'string')
        : [];
      const aliases = Array.isArray(fm.aliases)
        ? fm.aliases.filter((a): a is string => typeof a === 'string')
        : [];

      // Build agent definition from frontmatter + markdown body.
      const agent: AgentDefinition = {
        name: agentName,
        description:
          override?.description ??
          (typeof fm.description === 'string' ? fm.description : `Specialist agent: ${agentName}`),
        body: buildPrompt(body, override?.prompt, override?.appendPrompt),
        temperature: override?.temperature ?? (typeof fm.temperature === 'number' ? fm.temperature : 0.2),
        role: typeof fm.role === 'string' ? fm.role : agentName,
        readonly: fm.readonly === true,
        tags: override?.tags ?? tags,
        aliases,
        enabled: !isAgentDisabled(config, agentName),
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

// ─── Alias Resolution ────────────────────────────────────────────

/**
 * Resolve a name or alias to the actual agent name.
 * Returns null if no match found.
 */
export function resolveAgentName(input: string, agents: AgentDefinition[]): string | null {
  // Direct name match
  const direct = agents.find(a => a.name === input);
  if (direct) return direct.name;
  // Alias match
  for (const agent of agents) {
    if (agent.aliases.includes(input)) return agent.name;
  }
  return null;
}

/**
 * Validate aliases for conflicts and sanitize agent alias arrays in-place.
 * Logs warnings for skipped aliases.
 */
function validateAndSanitizeAliases(agents: AgentDefinition[]): AgentDefinition[] {
  const allNames = new Set(agents.map(a => a.name));
  const seenAliases = new Map<string, string>();

  for (const agent of agents) {
    const validAliases: string[] = [];
    for (const alias of agent.aliases) {
      if (!isSafeAgentName(alias)) {
        console.warn(`[slim-agents] Skipping invalid alias "${alias}" for agent "${agent.name}"`);
        continue;
      }
      if (allNames.has(alias)) {
        console.warn(`[slim-agents] Alias "${alias}" of agent "${agent.name}" conflicts with agent name. Skipping.`);
        continue;
      }
      if (seenAliases.has(alias)) {
        const existing = seenAliases.get(alias)!;
        if (existing === agent.name) continue; // duplicate alias in same agent
        console.warn(`[slim-agents] Alias "${alias}" of agent "${agent.name}" conflicts with agent "${existing}". Skipping.`);
        continue;
      }
      seenAliases.set(alias, agent.name);
      validAliases.push(alias);
    }
    agent.aliases = validAliases;
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
  const srcDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(srcDir, '..', AGENTS_DIR_NAME);
}
