#!/usr/bin/env node
/**
 * register-project.mjs — add/refresh a project in ~/.claude/luna/registry.json
 *
 * Called by doc-init (and manually for --sync).
 *
 * Usage:
 *   node scripts/register-project.mjs [<project-root>]
 *   node scripts/register-project.mjs --sync [<project-root>]
 *   LUNA_REGISTRY_DIR=/tmp/luna-test node scripts/register-project.mjs
 */

import { resolve } from 'node:path';
import { registerProject, registryPath } from './lib/luna-registry.mjs';

const args = process.argv.slice(2);
const pathArg = args.find((a) => !a.startsWith('--'));
const root = resolve(pathArg || process.cwd());

const { path, entry, total } = registerProject(root);
console.log(`Registered ${entry.id} → ${path}`);
console.log(`  path=${entry.path}`);
console.log(`  agents=${(entry.agents || []).join(',') || '—'}`);
console.log(`  registry now has ${total} project(s) (${registryPath()})`);
