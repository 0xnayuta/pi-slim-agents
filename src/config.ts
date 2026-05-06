/**
 * Configuration loading and validation for pi-slim-agents.
 *
 * Reads config from two locations (merged, project overrides user):
 *   - ~/.pi/agent/slim-agents.json   (user-level)
 *   - .pi/slim-agents.json           (project-level, overrides user)
 *
 * Supports basic schema validation with warnings for unknown fields.
 */

import * as fs from 'node:fs';
import type { SlimAgentsConfig, AgentOverride, HistoryConfig, RunnerMode } from './types.js';
import { projectConfigPath, userConfigPath } from './utils.js';

// ─── Validation Constants ───────────────────────────────────────────

const VALID_RUNNER_MODES: RunnerMode[] = ['prompt-only', 'provider-call'];
const VALID_RECOMMENDED_MODES = ['quick', 'normal', 'deep'];
const TEMPERATURE_MIN = 0;
const TEMPERATURE_MAX = 2;

// ─── Config Validation ─────────────────────────────────────────────

export interface ConfigValidationResult {
  ok: boolean;
  config: SlimAgentsConfig;
  warnings: Array<{ field: string; message: string }>;
}

/**
 * Load and validate configuration from user and project level files.
 * Returns validation result with any warnings.
 */
export function loadAndValidateConfig(cwd: string): ConfigValidationResult {
  const warnings: Array<{ field: string; message: string }> = [];
  
  // Load raw config files
  const userCfg = readJsonFile(userConfigPath());
  const projCfg = readJsonFile(projectConfigPath(cwd));

  // Validate user config
  if (userCfg) {
    const userWarnings = validateConfigSchema(userCfg, 'user');
    warnings.push(...userWarnings);
  }

  // Validate project config
  if (projCfg) {
    const projWarnings = validateConfigSchema(projCfg, 'project');
    warnings.push(...projWarnings);
  }

  // Merge configs
  const merged = mergeConfigs(userCfg, projCfg);

  return {
    ok: warnings.filter(w => w.field.startsWith('error.')).length === 0,
    config: merged,
    warnings: warnings.filter(w => !w.field.startsWith('error.')),
  };
}

/**
 * Validate config schema and return warnings.
 */
function validateConfigSchema(
  config: SlimAgentsConfig,
  level: 'user' | 'project',
): Array<{ field: string; message: string }> {
  const warnings: Array<{ field: string; message: string }> = [];
  const prefix = level === 'user' ? 'user.' : 'project.';

  // Validate runnerMode
  if (config.runnerMode !== undefined) {
    if (!VALID_RUNNER_MODES.includes(config.runnerMode)) {
      warnings.push({
        field: `${prefix}runnerMode`,
        message: `Invalid runnerMode "${config.runnerMode}". Valid values: ${VALID_RUNNER_MODES.join(', ')}. Using default.`,
      });
      // Clear invalid value to use default
      delete config.runnerMode;
    }
  }

  // Validate outputTemplate
  if (config.outputTemplate !== undefined && typeof config.outputTemplate !== 'boolean') {
    warnings.push({
      field: `${prefix}outputTemplate`,
      message: `outputTemplate must be boolean, got ${typeof config.outputTemplate}. Using default (true).`,
    });
    delete config.outputTemplate;
  }

  // Validate history config
  if (config.history !== undefined) {
    if (typeof config.history !== 'object' || config.history === null) {
      warnings.push({
        field: `${prefix}history`,
        message: `history must be an object. Ignoring.`,
      });
      delete config.history;
    } else {
      const history = config.history;

      if (history.persistent !== undefined && typeof history.persistent !== 'boolean') {
        warnings.push({
          field: `${prefix}history.persistent`,
          message: `history.persistent must be boolean. Ignoring.`,
        });
        delete history.persistent;
      }

      if (history.path !== undefined && typeof history.path !== 'string') {
        warnings.push({
          field: `${prefix}history.path`,
          message: `history.path must be a string. Ignoring.`,
        });
        delete history.path;
      }

      if (history.retention !== undefined) {
        if (typeof history.retention !== 'number' || !Number.isInteger(history.retention) || history.retention < 1) {
          warnings.push({
            field: `${prefix}history.retention`,
            message: `history.retention must be a positive integer. Using default (200).`,
          });
          delete history.retention;
        }
      }

      if (history.storeFullTask !== undefined && typeof history.storeFullTask !== 'boolean') {
        warnings.push({
          field: `${prefix}history.storeFullTask`,
          message: `history.storeFullTask must be boolean. Ignoring.`,
        });
        delete history.storeFullTask;
      }

      if (history.storeFullContext !== undefined && typeof history.storeFullContext !== 'boolean') {
        warnings.push({
          field: `${prefix}history.storeFullContext`,
          message: `history.storeFullContext must be boolean. Ignoring.`,
        });
        delete history.storeFullContext;
      }
    }
  }

  // Validate agent overrides
  if (config.agents !== undefined) {
    if (typeof config.agents !== 'object' || config.agents === null) {
      warnings.push({
        field: `${prefix}agents`,
        message: `agents must be an object. Ignoring.`,
      });
      delete config.agents;
    } else {
      for (const [agentName, override] of Object.entries(config.agents)) {
        if (!override || typeof override !== 'object') {
          warnings.push({
            field: `${prefix}agents.${agentName}`,
            message: `agents.${agentName} must be an object. Ignoring.`,
          });
          continue;
        }

        // Validate enabled/disabled
        if (override.enabled !== undefined && typeof override.enabled !== 'boolean') {
          warnings.push({
            field: `${prefix}agents.${agentName}.enabled`,
            message: `agents.${agentName}.enabled must be boolean. Ignoring.`,
          });
          delete override.enabled;
        }

        if (override.disabled !== undefined && typeof override.disabled !== 'boolean') {
          warnings.push({
            field: `${prefix}agents.${agentName}.disabled`,
            message: `agents.${agentName}.disabled must be boolean. Ignoring.`,
          });
          delete override.disabled;
        }

        // Validate temperature
        if (override.temperature !== undefined) {
          if (typeof override.temperature !== 'number' || 
              override.temperature < TEMPERATURE_MIN || 
              override.temperature > TEMPERATURE_MAX) {
            warnings.push({
              field: `${prefix}agents.${agentName}.temperature`,
              message: `agents.${agentName}.temperature must be a number between ${TEMPERATURE_MIN} and ${TEMPERATURE_MAX}. Ignoring.`,
            });
            delete override.temperature;
          }
        }

        // Validate model
        if (override.model !== undefined && typeof override.model !== 'string') {
          warnings.push({
            field: `${prefix}agents.${agentName}.model`,
            message: `agents.${agentName}.model must be a string. Ignoring.`,
          });
          delete override.model;
        }

        // Validate description
        if (override.description !== undefined && typeof override.description !== 'string') {
          warnings.push({
            field: `${prefix}agents.${agentName}.description`,
            message: `agents.${agentName}.description must be a string. Ignoring.`,
          });
          delete override.description;
        }

        // Validate prompt/appendPrompt
        if (override.prompt !== undefined && typeof override.prompt !== 'string') {
          warnings.push({
            field: `${prefix}agents.${agentName}.prompt`,
            message: `agents.${agentName}.prompt must be a string. Ignoring.`,
          });
          delete override.prompt;
        }

        if (override.appendPrompt !== undefined && typeof override.appendPrompt !== 'string') {
          warnings.push({
            field: `${prefix}agents.${agentName}.appendPrompt`,
            message: `agents.${agentName}.appendPrompt must be a string. Ignoring.`,
          });
          delete override.appendPrompt;
        }

        // Validate tags
        if (override.tags !== undefined) {
          if (!Array.isArray(override.tags)) {
            warnings.push({
              field: `${prefix}agents.${agentName}.tags`,
              message: `agents.${agentName}.tags must be an array. Ignoring.`,
            });
            delete override.tags;
          } else {
            for (let i = 0; i < override.tags.length; i++) {
              if (typeof override.tags[i] !== 'string') {
                warnings.push({
                  field: `${prefix}agents.${agentName}.tags[${i}]`,
                  message: `agents.${agentName}.tags[${i}] must be a string. Ignoring.`,
                });
              }
            }
            // Remove non-string values
            override.tags = override.tags.filter((t): t is string => typeof t === 'string');
          }
        }
      }
    }
  }

  // Check for unknown top-level fields
  const knownFields = ['agents', 'runnerMode', 'defaultModel', 'disabled', 'extraAgentDirs', 'outputTemplate', 'history'];
  for (const key of Object.keys(config)) {
    if (!knownFields.includes(key)) {
      warnings.push({
        field: `${prefix}${key}`,
        message: `Unknown config field "${key}". Ignoring.`,
      });
    }
  }

  return warnings;
}

// ─── Load & Merge ───────────────────────────────────────────────────

/**
 * Load and merge configuration from user-level and project-level files.
 * Project-level values override user-level values.
 */
/**
 * Load and merge configuration from user-level and project-level files.
 * Project-level values override user-level values.
 * Uses schema validation with warnings for unknown/invalid fields.
 */
export function loadConfig(cwd: string): SlimAgentsConfig {
  const result = loadAndValidateConfig(cwd);
  // Log config warnings
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) {
      console.warn(`[slim-agents] Config warning: ${warning.message}`);
    }
  }
  return result.config;
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
  if (!override) return false;
  // Explicit enabled field takes precedence over disabled field
  if (override.enabled !== undefined) return !override.enabled;
  return override.disabled === true;
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
  if (proj.runnerMode !== undefined) merged.runnerMode = proj.runnerMode;
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
