/**
 * Security and sanitization utilities for pi-slim-agents.
 * 
 * Provides:
 *   - Error message sanitization
 *   - Safe display path generation
 *   - API key redaction
 */

import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Sanitize an error message for user-facing output.
 * Removes sensitive information like API keys, file paths, stack traces.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return sanitizeString(error);
  }
  if (error instanceof Error) {
    // Don't expose stack traces to users
    return sanitizeString(error.message);
  }
  return 'An internal error occurred';
}

/**
 * Sanitize a string by removing sensitive patterns.
 */
function sanitizeString(str: string): string {
  if (!str) return str;
  
  return str
    // Remove API keys
    .replace(/(api[_-]?key)\s*[=:]\s*[A-Za-z0-9_\-]{20,}/gi, '$1=[redacted]')
    .replace(/(sk-[A-Za-z0-9_\-]{20,})/g, '[API_KEY_REDACTED]')
    .replace(/(Bearer\s+)([A-Za-z0-9_\-\.]{20,})/gi, '$1[TOKEN_REDACTED]')
    // Remove file paths that might be sensitive (but keep error context)
    .replace(/\/[\w\-\.]+\/[\w\-\.]+\/[\w\-\.\/]+/g, (match) => {
      // Don't redact if it looks like a standard path component
      if (match.includes('node_modules') || match.includes('.pnpm')) {
        return '[module_path]';
      }
      if (match.includes('pi-slim-agents')) {
        return '[pi-slim-agents]';
      }
      return match;
    })
    // Remove potential env var values
    .replace(/([A-Z_]+)\s*[=:]\s*[\w\-\.]{20,}/g, '$1=[redacted]')
    // Truncate very long messages
    .slice(0, 200);
}

/**
 * Generate a safe display path for user-facing output.
 * - Built-in agents: show relative to package root (e.g., "agents/oracle.md")
 * - Project agents: show relative to cwd (e.g., ".pi/slim-agents/agents/foo.md")
 * - User agents: show with home directory abbreviated (e.g., "~/.pi/agent/...")
 * - External/unknown: show basename only (e.g., "foo.md")
 */
export function safeDisplayPath(
  filePath: string,
  cwd: string,
  packageRoot?: string,
): string {
  if (!filePath) return '<unknown>';
  
  try {
    // Normalize path separators
    const normalizedPath = path.normalize(filePath);
    
    // Check if it's a built-in package agent
    if (packageRoot) {
      const packageNormalized = path.normalize(packageRoot);
      if (normalizedPath.startsWith(packageNormalized + path.sep)) {
        const relative = path.relative(packageNormalized, normalizedPath);
        // Don't go above the package root
        if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
          return relative.replace(/\\/g, '/');
        }
      }
    }
    
    // Check if it's in the project directory
    try {
      const cwdNormalized = path.normalize(cwd);
      if (normalizedPath.startsWith(cwdNormalized + path.sep)) {
        const relative = path.relative(cwdNormalized, normalizedPath);
        if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
          return relative.replace(/\\/g, '/');
        }
      }
    } catch {
      // cwd might not be valid
    }
    
    // Check if it's in the user's home directory
    const homeDir = os.homedir();
    if (normalizedPath.startsWith(homeDir)) {
      return '~' + normalizedPath.slice(homeDir.length).replace(/\\/g, '/');
    }
    
    // For all other cases, return basename only
    return path.basename(normalizedPath);
  } catch {
    // If anything fails, return basename
    return path.basename(filePath);
  }
}

/**
 * Sanitize an error for history recording.
 * Similar to sanitizeErrorMessage but may keep more context for debugging.
 */
export function sanitizeErrorForHistory(error: unknown): string {
  if (typeof error === 'string') {
    return sanitizeString(error).slice(0, 100);
  }
  if (error instanceof Error) {
    return sanitizeString(error.message).slice(0, 100);
  }
  return 'Unknown error';
}

/**
 * Get a reason code for provider-call unavailability.
 * Does not include sensitive details.
 */
export function getProviderUnavailableReason(errorType?: string): string {
  switch (errorType) {
    case 'PI_AI_IMPORT_FAILED':
      return 'Provider-call unavailable: pi-ai module not importable';
    case 'PI_AI_NO_COMPLETE':
      return 'Provider-call unavailable: pi-ai does not export complete()';
    case 'NO_MODEL_CONFIGURED':
      return 'Provider-call unavailable: no model configured';
    case 'API_KEY_RESOLUTION_FAILED':
      return 'Provider-call unavailable: could not resolve API key';
    case 'MODEL_CALL_FAILED':
      return 'Provider-call unavailable: model call failed';
    case 'MODEL_EMPTY_RESPONSE':
      return 'Provider-call unavailable: model returned empty response';
    default:
      return 'Provider-call unavailable in current environment';
  }
}
