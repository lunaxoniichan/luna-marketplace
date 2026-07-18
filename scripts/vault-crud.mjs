#!/usr/bin/env node
/**
 * Dev harness for vault CRUD. Prefer calling scripts/lib/vault-crud.mjs from Studio.
 * Vault root MUST resolve via registry allow-list or LUNA_PLUGIN_ROOT / --plugin-root.
 *
 * Usage:
 *   node scripts/vault-crud.mjs create --vault-id <id> --path memory/foo.md --title "Foo" --body "..."
 *   node scripts/vault-crud.mjs delete --vault-id <id> --path memory/foo.md --confirm memory/foo.md --confirm-sha <sha>
 *   node scripts/vault-crud.mjs sync --vault-id <id> [--apply]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveVaultRoot,
  createFile,
  updateFile,
  deleteFile,
  applyAgentViewSync,
  fileContentSha,
  sha256,
} from './lib/vault-crud.mjs';
import { syncAgentViews } from './lib/agent-views.mjs';

function usage() {
  console.error(
    `Usage: vault-crud.mjs <create|update|delete|sync|sha> --vault-id <id>|--path-or-id <path> [--plugin-root <dir>] ...`,
  );
  process.exit(2);
}

function arg(flag, argv) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function has(flag, argv) {
  return argv.includes(flag);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function buildFm(argv) {
  return {
    title: arg('--title', argv) || '',
    scope: arg('--scope', argv) || 'project',
    type: arg('--type', argv) || 'memory',
    lifecycle: arg('--lifecycle', argv) || 'official',
    status: arg('--status', argv) || 'active',
    keywords: (arg('--keywords', argv) || '').split(',').filter(Boolean),
    related: [],
    updated: arg('--updated', argv) || today(),
  };
}

function bodyOf(argv) {
  const f = arg('--body-file', argv);
  if (f) return readFileSync(f, 'utf8');
  return arg('--body', argv) || '';
}

function openVault(argv) {
  const pathOrId = arg('--vault-id', argv) || arg('--path-or-id', argv);
  if (!pathOrId) usage();
  return resolveVaultRoot(pathOrId, {
    pluginRoot: arg('--plugin-root', argv) || process.env.LUNA_PLUGIN_ROOT,
  });
}

const [cmd, ...argv] = process.argv.slice(2);
if (!cmd) usage();

if (cmd === 'sha') {
  const vault = openVault(argv);
  const rel = arg('--path', argv);
  const abs = join(vault.root, rel);
  if (!existsSync(abs)) {
    console.error('missing file');
    process.exit(1);
  }
  console.log(fileContentSha(abs));
  process.exit(0);
}

const vault = openVault(argv);
let result;

if (cmd === 'create') {
  result = createFile({
    vault,
    relPath: arg('--path', argv),
    body: bodyOf(argv),
    frontmatter: buildFm(argv),
    planTrailer: arg('--plan', argv),
  });
} else if (cmd === 'update') {
  result = updateFile({
    vault,
    relPath: arg('--path', argv),
    body: bodyOf(argv),
    frontmatter: buildFm(argv),
    planTrailer: arg('--plan', argv),
  });
} else if (cmd === 'delete') {
  result = deleteFile({
    vault,
    relPath: arg('--path', argv),
    confirmPath: arg('--confirm', argv),
    confirmSha: arg('--confirm-sha', argv),
    planTrailer: arg('--plan', argv),
  });
} else if (cmd === 'sync') {
  result = has('--apply', argv)
    ? applyAgentViewSync({ vault })
    : syncAgentViews(vault.root, { dryRun: true });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
} else {
  usage();
}

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);

void sha256;
