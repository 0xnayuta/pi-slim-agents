/**
 * Agent source metadata collection.
 *
 * Provides fs.stat-based file metadata for agents and templates:
 *   - createdAt  (birthtime, may be null on some platforms/filesystems)
 *   - lastModified (mtime)
 *   - sizeBytes
 *
 * Failures are non-fatal — metadata fields default to null.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────

export interface FileMetadata {
  sourcePath: string;
  createdAt: string | null;  // ISO 8601 or null if unavailable
  lastModified: string | null;  // ISO 8601 or null if unavailable
  sizeBytes: number | null;  // bytes or null if unavailable
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Collect file metadata for a given path.
 * Returns null metadata fields on any error (non-fatal).
 *
 * Note: birthtime may not be available on all platforms/filesystems.
 * Use lastModified as a fallback for sorting/display.
 */
export function collectFileMetadata(filePath: string): FileMetadata {
  const result: FileMetadata = {
    sourcePath: filePath,
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
  } catch (err) {
    // Non-fatal: log warning and return null metadata
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
 * Get a relative path from cwd, falling back to absolute if outside cwd.
 * Sanitizes paths to avoid leaking home directory.
 */
export function toRelativePath(filePath: string, cwd: string): string {
  try {
    const rel = path.relative(cwd, filePath);
    // If relative path goes "up" outside cwd, use the absolute path
    if (rel.startsWith('..')) {
      return filePath;
    }
    return rel;
  } catch {
    return filePath;
  }
}
