#!/usr/bin/env node
/**
 * CLI for doc lifecycle promote / demote / supersede / --check
 * Contract: docs/specs/2026-07-19-doc-lifecycle-promote-demote-contract.md
 *
 * Usage:
 *   node scripts/doc-lifecycle.mjs --check [--root <path>|--vault-id <id>]
 *   node scripts/doc-lifecycle.mjs <promote|demote|supersede> <relPath>
 *       [--superseded-by <path>] [--dest-subdir audits]
 *       [--root <path>|--vault-id <id>] [--dry-run]
 */
import { resolve } from 'node:path';
import { resolveVaultRoot } from './lib/vault-crud.mjs';
import {
  planLifecycleMove,
  applyLifecycleMove,
  checkLifecycleDrift,
} from './lib/doc-lifecycle.mjs';
import { loadRegistry } from './lib/luna-registry.mjs';

function usage() {
  console.error(`Usage:
  node scripts/doc-lifecycle.mjs --check [--root <path>|--vault-id <id>]
  node scripts/doc-lifecycle.mjs <promote|demote|supersede> <relPath>
      [--superseded-by <path>] [--dest-subdir audits|research]
      [--root <path>|--vault-id <id>] [--dry-run]
`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { positional: [], dryRun: false, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--vault-id') args.vaultId = argv[++i];
    else if (a === '--superseded-by') args.supersededBy = argv[++i];
    else if (a === '--dest-subdir') args.destSubdir = argv[++i];
    else if (a.startsWith('-')) {
      console.error(`Unknown flag: ${a}`);
      usage();
    } else args.positional.push(a);
  }
  return args;
}

function openVault(args) {
  const pluginRoot = args.root
    ? resolve(args.root)
    : process.env.LUNA_PLUGIN_ROOT
      ? resolve(process.env.LUNA_PLUGIN_ROOT)
      : process.cwd();
  const registry = loadRegistry();
  const key = args.vaultId || pluginRoot;
  return resolveVaultRoot(key, { pluginRoot, registry });
}

const args = parseArgs(process.argv.slice(2));

if (args.check) {
  const vault = openVault(args);
  const report = checkLifecycleDrift(vault.root);
  if (report.mismatches.length === 0) {
    console.log('lifecycle check: clean');
    process.exit(0);
  }
  console.error(`lifecycle check: ${report.mismatches.length} mismatch(es)`);
  for (const m of report.mismatches) {
    console.error(
      `  ${m.path}: lifecycle=${m.lifecycle} actualDir=${m.actualDir} expected=${m.expectedDirs.join('|')}`,
    );
  }
  process.exit(1);
}

const [op, relPath] = args.positional;
if (!op || !relPath || !['promote', 'demote', 'supersede'].includes(op)) {
  usage();
}

const vault = openVault(args);
const planned = planLifecycleMove({
  vault,
  relPath,
  op,
  supersededBy: args.supersededBy,
  destSubdir: args.destSubdir,
});
if (!planned.ok) {
  console.error(`${planned.error.code}: ${planned.error.message}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      op,
      src: planned.plan.src,
      dest: planned.plan.dest,
      tagOnly: planned.plan.tagOnly,
      nextFm: planned.plan.nextFm,
      planToken: planned.planToken,
      dryRun: args.dryRun,
    },
    null,
    2,
  ),
);

if (args.dryRun) {
  process.exit(0);
}

const applied = applyLifecycleMove({ vault, plan: planned.plan });
if (!applied.ok) {
  console.error(`${applied.error.code}: ${applied.error.message}`);
  process.exit(1);
}
console.log(`ok commit=${applied.commitSha} → ${applied.dest}`);
