#!/usr/bin/env node
/**
 * detect-modules.mjs — list subdirectories that have their own CLAUDE.md or AGENTS.md.
 *
 * These are treated as "module targets" by doc-init: each deserves its own
 * minimum doc scaffold (SYSTEM_DESIGN.md, PROJECT_STRUCTURES.md, etc.) in
 * addition to the root-level scaffold.
 *
 * Heuristic: if a direct child directory contains CLAUDE.md or AGENTS.md, it
 * is an independently-tracked module (sub-agent, service, or package).
 *
 * Usage:
 *   node scripts/detect-modules.mjs [<project-root>]
 *   node scripts/detect-modules.mjs --json [<project-root>]
 *
 * Output (default): one module name per line, relative to project-root.
 * Output (--json):  JSON array of { name, path, markers } objects.
 *
 * Exit codes: 0 always (empty output = no modules found).
 */

import { readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const MARKERS = ['CLAUDE.md', 'AGENTS.md'];

// Skip dirs that are clearly not modules.
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.cursor', '.claude', '__pycache__',
  'dist', 'build', '.next', '.venv', 'venv', 'volume',
]);

function detectModules(root) {
  const entries = readdirSync(root, { withFileTypes: true });
  const modules = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    const dirPath = join(root, entry.name);
    const found = MARKERS.filter(m => existsSync(join(dirPath, m)));

    if (found.length > 0) {
      modules.push({ name: entry.name, path: dirPath, markers: found });
    }
  }

  return modules.sort((a, b) => a.name.localeCompare(b.name));
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const pathArg = args.find(a => !a.startsWith('--'));
const root = pathArg ? resolve(pathArg) : process.cwd();

if (!existsSync(root)) {
  process.stderr.write(`detect-modules: path not found: ${root}\n`);
  process.exit(1);
}

const modules = detectModules(root);

if (jsonMode) {
  process.stdout.write(JSON.stringify(modules, null, 2) + '\n');
} else {
  if (modules.length === 0) {
    process.stderr.write('No module targets detected (no subdirs with CLAUDE.md or AGENTS.md).\n');
  } else {
    process.stdout.write(modules.map(m => m.name).join('\n') + '\n');
  }
}
