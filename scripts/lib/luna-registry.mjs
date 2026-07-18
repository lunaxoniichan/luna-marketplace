/**
 * User-level Luna project registry (~/.claude/luna/registry.json).
 * Lists projects that ran doc-init so Studio can build the constellation.
 */

import { homedir } from 'node:os';
import { join, basename, resolve } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { execSync } from 'node:child_process';

export const REGISTRY_VERSION = 1;

export function registryDir() {
  return process.env.LUNA_REGISTRY_DIR || join(homedir(), '.claude', 'luna');
}

export function registryPath() {
  return join(registryDir(), 'registry.json');
}

/**
 * @returns {{ version: number, updated: string, projects: Array<Record<string, unknown>> }}
 */
export function loadRegistry() {
  const path = registryPath();
  if (!existsSync(path)) {
    return { version: REGISTRY_VERSION, updated: new Date().toISOString(), projects: [] };
  }
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!data.projects) data.projects = [];
    if (!data.version) data.version = REGISTRY_VERSION;
    return data;
  } catch (err) {
    throw new Error(`luna-registry: failed to parse ${path}: ${err.message}`);
  }
}

/**
 * Atomic write of registry.json.
 * @param {{ version: number, updated: string, projects: Array<Record<string, unknown>> }} data
 */
export function saveRegistry(data) {
  const dir = registryDir();
  mkdirSync(dir, { recursive: true });
  const path = registryPath();
  const tmp = `${path}.${process.pid}.tmp`;
  const next = {
    version: data.version || REGISTRY_VERSION,
    updated: new Date().toISOString(),
    projects: data.projects || [],
  };
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8');
  renameSync(tmp, path);
  return path;
}

function gitRoot(cwd) {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return resolve(cwd);
  }
}

function detectAgents(root) {
  const agents = [];
  // Claude: native Claude entrypoints — not AGENTS.md alone (shared with Cursor).
  if (existsSync(join(root, 'CLAUDE.md')) || existsSync(join(root, '.claude'))) {
    agents.push('claude');
  }
  // Cursor: tool-specific tree only.
  if (existsSync(join(root, '.cursor'))) {
    agents.push('cursor');
  }
  return [...new Set(agents)];
}

/**
 * Register or refresh a project path in the user registry.
 * @param {string} projectRoot
 * @param {{ status?: string, name?: string }} [opts]
 */
export function registerProject(projectRoot, opts = {}) {
  const root = gitRoot(resolve(projectRoot));
  const id = basename(root);
  const reg = loadRegistry();
  const now = new Date().toISOString();
  const existing = reg.projects.find((p) => p.path === root || p.id === id);
  const entry = {
    id,
    name: opts.name || id,
    path: root,
    agents: detectAgents(root),
    status: opts.status || 'active',
    registered_at: existing?.registered_at || now,
    doc_init_at: now,
    updated_at: now,
  };
  if (existing) {
    Object.assign(existing, entry, { registered_at: existing.registered_at });
  } else {
    reg.projects.push(entry);
  }
  reg.projects.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const path = saveRegistry(reg);
  return { path, entry, total: reg.projects.length };
}
