// pmVPN SFTP Handler — real filesystem operations
// MIT License
//
// Path-sandboxed file operations for authenticated users.
// All paths resolved relative to user home. No traversal.

import { readdir, stat, readFile, writeFile, mkdir, rm, access } from 'node:fs/promises';
import { join, resolve, relative, basename } from 'node:path';
import { logger } from '../utils/logger.js';

export interface FileEntry {
  name: string;
  size: number;
  modified: string;
  type: 'file' | 'directory';
  permissions: string;
}

export interface SftpResult {
  ok: boolean;
  error?: string;
  entries?: FileEntry[];
  data?: string;        // base64 for file content
  path?: string;
}

/**
 * Resolve a path safely within the user's home directory.
 * Prevents directory traversal (.. escaping the sandbox).
 */
function safePath(homeDir: string, requestedPath: string): string | null {
  const resolved = resolve(homeDir, requestedPath.replace(/^\/+/, ''));
  const rel = relative(homeDir, resolved);
  if (rel.startsWith('..') || resolve(homeDir, rel) !== resolved) {
    return null; // traversal attempt
  }
  return resolved;
}

/**
 * List directory contents.
 */
export async function sftpLs(homeDir: string, path: string): Promise<SftpResult> {
  const fullPath = safePath(homeDir, path || '.');
  if (!fullPath) return { ok: false, error: 'path outside home directory' };

  try {
    const items = await readdir(fullPath, { withFileTypes: true });
    const entries: FileEntry[] = [];

    for (const item of items) {
      if (item.name.startsWith('.') && item.name !== '..') continue; // skip hidden by default
      try {
        const itemPath = join(fullPath, item.name);
        const st = await stat(itemPath);
        entries.push({
          name: item.name,
          size: st.size,
          modified: st.mtime.toISOString(),
          type: item.isDirectory() ? 'directory' : 'file',
          permissions: (st.mode & 0o777).toString(8),
        });
      } catch {
        // Skip unreadable entries
      }
    }

    // Sort: directories first, then by name
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { ok: true, entries, path };
  } catch (e: any) {
    return { ok: false, error: e.code === 'ENOENT' ? 'directory not found' : e.message };
  }
}

/**
 * Read file contents (base64 encoded).
 */
export async function sftpGet(homeDir: string, path: string): Promise<SftpResult> {
  const fullPath = safePath(homeDir, path);
  if (!fullPath) return { ok: false, error: 'path outside home directory' };

  try {
    const st = await stat(fullPath);
    if (st.size > 50 * 1024 * 1024) {
      return { ok: false, error: 'file too large (max 50MB)' };
    }
    const content = await readFile(fullPath);
    return { ok: true, data: content.toString('base64'), path };
  } catch (e: any) {
    return { ok: false, error: e.code === 'ENOENT' ? 'file not found' : e.message };
  }
}

/**
 * Write file (from base64 data).
 */
export async function sftpPut(homeDir: string, path: string, data: string): Promise<SftpResult> {
  const fullPath = safePath(homeDir, path);
  if (!fullPath) return { ok: false, error: 'path outside home directory' };

  try {
    const buffer = Buffer.from(data, 'base64');
    if (buffer.length > 50 * 1024 * 1024) {
      return { ok: false, error: 'file too large (max 50MB)' };
    }
    await writeFile(fullPath, buffer);
    logger.info({ path: fullPath, size: buffer.length }, 'file written');
    return { ok: true, path };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/**
 * Create directory.
 */
export async function sftpMkdir(homeDir: string, path: string): Promise<SftpResult> {
  const fullPath = safePath(homeDir, path);
  if (!fullPath) return { ok: false, error: 'path outside home directory' };

  try {
    await mkdir(fullPath, { recursive: true });
    return { ok: true, path };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/**
 * Remove file or directory.
 */
export async function sftpRm(homeDir: string, path: string): Promise<SftpResult> {
  const fullPath = safePath(homeDir, path);
  if (!fullPath) return { ok: false, error: 'path outside home directory' };

  // Never allow removing home directory itself
  if (resolve(fullPath) === resolve(homeDir)) {
    return { ok: false, error: 'cannot remove home directory' };
  }

  try {
    await rm(fullPath, { recursive: true });
    logger.info({ path: fullPath }, 'removed');
    return { ok: true, path };
  } catch (e: any) {
    return { ok: false, error: e.code === 'ENOENT' ? 'not found' : e.message };
  }
}

/**
 * File/directory info.
 */
export async function sftpStat(homeDir: string, path: string): Promise<SftpResult> {
  const fullPath = safePath(homeDir, path);
  if (!fullPath) return { ok: false, error: 'path outside home directory' };

  try {
    const st = await stat(fullPath);
    return {
      ok: true,
      entries: [{
        name: basename(fullPath),
        size: st.size,
        modified: st.mtime.toISOString(),
        type: st.isDirectory() ? 'directory' : 'file',
        permissions: (st.mode & 0o777).toString(8),
      }],
      path,
    };
  } catch (e: any) {
    return { ok: false, error: e.code === 'ENOENT' ? 'not found' : e.message };
  }
}
