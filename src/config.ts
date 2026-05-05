/**
 * Configuration loading for pi-slim-agents.
 *
 * Reads config from two locations (merged, project overrides user):
 *   - ~/.pi/agent/slim-agents.json   (user-level)
 *   - .pi/slim-agents.json           (project-level, overrides user)
 */

import * as fs from 'node:fs';
import type { SlimAgentsConfig, AgentOverride } from './types.js';
import { projectConfigPath, userConfigPath } from './utils.js';

// ─── Load & Merge ───────────────────────────────────────────────────

/**
 * Load and merge configuration from user-level and project-level files.
 * Project-level values override user-level values.
 */
export function loadConfig(cwd: string): SlimAgentsConfig {
  const userCfg = readJsonFile(userConfigPath());
  const projCfg = readJsonFile(projectConfigPath(cwd));

  return mergeConfigs(userCfg, projCfg);
}

/**
 * Get the override for a specific agent from merged config.
 */
export function getAgentOverride(config: SlimAgentsConfig, agentName: string): AgentOverride | undefined {
  return config.agents?.[agentName];
}

/**
 * Check if an agent is disabled in config.
 */
export function isAgentDisabled(config: SlimAgentsConfig, agentName: string): boolean {
  if (config.disabled?.includes(agentName)) return true;
  const override = getAgentOverride(config, agentName);
  return override?.disabled === true;
}

// ─── Internal ───────────────────────────────────────────────────────

function readJsonFile(filePath: string): SlimAgentsConfig | undefined {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as SlimAgentsConfig;
  } catch {
    return undefined;
  }
}

function mergeConfigs(
  user: SlimAgentsConfig | undefined,
  proj: SlimAgentsConfig | undefined,
): SlimAgentsConfig {
  if (!user && !proj) return {};
  if (!user) return proj!;
  if (!proj) return user;

  const merged: SlimAgentsConfig = { ...user };

  // Project overrides
  if (proj.defaultModel !== undefined) merged.defaultModel = proj.defaultModel;
  if (proj.disabled !== undefined) {
    merged.disabled = [...new Set([...(user.disabled ?? []), ...proj.disabled])];
  }
  if (proj.extraAgentDirs !== undefined) {
    merged.extraAgentDirs = [...new Set([...(user.extraAgentDirs ?? []), ...proj.extraAgentDirs])];
  }

  // Merge agent overrides (project wins per-key)
  if (user.agents || proj.agents) {
    merged.agents = {};
    const allKeys = new Set([
      ...Object.keys(user.agents ?? {}),
      ...Object.keys(proj.agents ?? {}),
    ]);
    for (const key of allKeys) {
      const userOverride = user.agents?.[key];
      const projOverride = proj.agents?.[key];
      if (userOverride && projOverride) {
        merged.agents[key] = { ...userOverride, ...projOverride };
      } else {
        merged.agents[key] = (projOverride ?? userOverride)!;
      }
    }
  }

  return merged;
}
