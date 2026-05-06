/**
 * Agent source metadata collection.
 *
 * Provides fs.stat-based file metadata for agents and templates:
 *   - createdAt  (birthtime, may be null on some platforms/filesystems)
 *   - lastModified (mtime)
 *   - sizeBytes
 *
 * Failures are non-fatal — metadata fields default to null.
 * 
 * Security: sourcePath is sanitized for display - absolute paths are converted
 * to relative paths to avoid leaking user directory structure.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { safeDisplayPath } from './security.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface FileMetadata {
  /** Safe display path (relative or sanitized, never absolute user paths) */
  sourcePath: string;
  /** Source kind for API consumers to understand the path origin */
  sourcePathKind: 'builtin' | 'project' | 'user' | 'external' | 'unknown';
  createdAt: string | null;  // ISO 8601 or null if unavailable
  lastModified: string | null;  // ISO 8601 or null if unavailable
  sizeBytes: number | null;  // bytes or null if unavailable
}

/**
 * Path context for sanitizing display paths.
 * Used to determine what kind of relative path to show.
 */
export interface PathContext {
  cwd: string;
  packageRoot?: string;
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Collect file metadata for a given path.
 * Returns null metadata fields on any error (non-fatal).
 *
 * Security: The sourcePath is sanitized to avoid leaking absolute paths.
 * Use the overload with context for proper path sanitization.
 *
 * Note: birthtime may not be available on all platforms/filesystems.
 * Use lastModified as a fallback for sorting/display.
 */
export function collectFileMetadata(filePath: string): FileMetadata {
  return collectFileMetadataWithContext(filePath, {
    cwd: process.cwd(),
  });
}

/**
 * Collect file metadata with path context for safe display.
 * Determines sourcePathKind and sanitizes the display path.
 */
export function collectFileMetadataWithContext(
  filePath: string,
  context: PathContext,
): FileMetadata {
  const result: FileMetadata = {
    sourcePath: path.basename(filePath), // Default to basename (safest)
    sourcePathKind: 'external',
    createdAt: null,
    lastModified: null,
    sizeBytes: null,
  };

  try {
    const stat = fs.statSync(filePath);
    result.lastModified = stat.mtime.toISOString();
    result.sizeBytes = stat.size;

    // birthtime may not be available on Windows or older filesystems
    if (stat.birthtime && stat.birthtime.getTime() > 0) {
      const birthMs = stat.birthtime.getTime();
      // If birthtime equals mtime on a newly created file, it's likely a fallback value
      // Treat very old dates (before 2000) as null
      if (birthMs > 946684800000) { // Jan 1, 2000
        result.createdAt = stat.birthtime.toISOString();
      }
    }

    // Determine source kind and sanitize path
    const normalizedPath = path.normalize(filePath);
    
    // Check if it's a built-in package agent
    if (context.packageRoot) {
      const packageRoot = path.normalize(context.packageRoot);
      if (normalizedPath.startsWith(packageRoot + path.sep)) {
        result.sourcePathKind = 'builtin';
        result.sourcePath = path.relative(packageRoot, normalizedPath).replace(/\\/g, '/');
        return result;
      }
    }
    
    // Check if it's in the project directory
    try {
      const cwdNormalized = path.normalize(context.cwd);
      if (normalizedPath.startsWith(cwdNormalized + path.sep)) {
        result.sourcePathKind = 'project';
        result.sourcePath = path.relative(cwdNormalized, normalizedPath).replace(/\\/g, '/');
        return result;
      }
    } catch {
      // cwd might not be valid, continue with other checks
    }
    
    // Check if it's in the user's home directory
    const homeDir = os.homedir();
    if (normalizedPath.startsWith(homeDir)) {
      result.sourcePathKind = 'user';
      result.sourcePath = '~' + normalizedPath.slice(homeDir.length).replace(/\\/g, '/');
      return result;
    }
    
    // External path - show basename only
    result.sourcePath = path.basename(normalizedPath);
    result.sourcePathKind = 'external';
    
  } catch (err) {
    // Non-fatal: log warning and return null metadata with basename only
    console.warn(`[slim-agents] Failed to stat file "${filePath}": ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}

/**
 * Collect file metadata for multiple paths.
 * Failures are non-fatal — each path gets its own result.
 */
export function collectFileMetadataBatch(filePaths: string[]): FileMetadata[] {
  return filePaths.map(fp => collectFileMetadata(fp));
}

/**
 * Collect file metadata for multiple paths with context.
 * Failures are non-fatal — each path gets its own result.
 */
export function collectFileMetadataBatchWithContext(
  filePaths: string[],
  context: PathContext,
): FileMetadata[] {
  return filePaths.map(fp => collectFileMetadataWithContext(fp, context));
}

/**
 * Get a relative path from cwd, falling back to sanitized path if outside cwd.
 * This is a simpler version that doesn't change the interface.
 * @deprecated Use collectFileMetadataWithContext for proper sanitization
 */
export function toRelativePath(filePath: string, cwd: string): string {
  return safeDisplayPath(filePath, cwd);
}
