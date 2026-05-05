/**
 * Utility functions for pi-slim-agents.
 */

import * as path from 'node:path';
import * as os from 'node:os';

// ─── Constants ──────────────────────────────────────────────────────

export const PACKAGE_NAME = 'pi-slim-agents';
export const CONFIG_FILENAME = 'slim-agents.json';
export const AGENTS_DIR_NAME = 'agents';

/** Project-level config directory. */
export const PROJECT_CONFIG_DIR = '.pi';
/** Project-level agents directory. */
export const PROJECT_AGENTS_DIR = path.join(PROJECT_CONFIG_DIR, PACKAGE_NAME, AGENTS_DIR_NAME);

/** User-level config directory. */
export const USER_CONFIG_DIR = path.join(os.homedir(), '.pi', 'agent');
/** User-level agents directory. */
export const USER_AGENTS_DIR = path.join(os.homedir(), '.pi', 'agent', PACKAGE_NAME, AGENTS_DIR_NAME);

// ─── Path Helpers ───────────────────────────────────────────────────

/** Get the project-level config file path. */
export function projectConfigPath(cwd: string): string {
  return path.join(cwd, PROJECT_CONFIG_DIR, CONFIG_FILENAME);
}

/** Get the user-level config file path. */
export function userConfigPath(): string {
  return path.join(USER_CONFIG_DIR, CONFIG_FILENAME);
}

// ─── Agent Name Validation ──────────────────────────────────────────

const SAFE_NAME_RE = /^[a-z][a-z0-9_-]*$/;

/** Check if a name is safe for use as an agent identifier. */
export function isSafeAgentName(name: string): boolean {
  return SAFE_NAME_RE.test(name);
}

/** Derive agent name from filename (strip .md extension). */
export function nameFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '');
}

// ─── Frontmatter Parsing ────────────────────────────────────────────

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;

/**
 * Parse YAML-like frontmatter from a markdown string.
 *
 * This is a minimal parser that handles simple key: value pairs.
 * For complex YAML, users should keep frontmatter simple.
 */
export function parseAgentFrontmatter(raw: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const [, yamlBlock, body] = match;
  const frontmatter: Record<string, unknown> = {};

  const lines = yamlBlock.split('\n');
  let currentListKey: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (currentListKey && trimmed.startsWith('- ')) {
      const list = frontmatter[currentListKey];
      if (Array.isArray(list)) list.push(parseScalar(trimmed.slice(2).trim()));
      continue;
    }

    currentListKey = undefined;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const rawValue = trimmed.slice(colonIdx + 1).trim();

    if (rawValue === '') {
      frontmatter[key] = [];
      currentListKey = key;
      continue;
    }

    frontmatter[key] = parseScalar(rawValue);
  }

  return { frontmatter, body: body.trim() };
}

function parseScalar(raw: string): unknown {
  const value = raw.replace(/^["']|["']$/g, '');

  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }

  return value;
}

// ─── Text Helpers ───────────────────────────────────────────────────

/** Truncate text to a maximum length, adding ellipsis. */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/** Indent every line of text. */
export function indent(text: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').map(line => prefix + line).join('\n');
}
