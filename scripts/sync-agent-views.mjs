#!/usr/bin/env node
/**
 * sync-agent-views.mjs — canonical rules/ + memory/ → agent views.
 *
 * Contract: docs/specs/2026-07-18-sync-agent-views-contract.md
 *
 * Usage:
 *   node scripts/sync-agent-views.mjs [--root <path>]
 *   node scripts/sync-agent-views.mjs --check
 *   node scripts/sync-agent-views.mjs --dry-run
 */

import { resolve } from 'node:path';
import { syncAgentViews } from './lib/agent-views.mjs';

const args = process.argv.slice(2);
const check = args.includes('--check');
const dryRun = args.includes('--dry-run');
const rootIdx = args.indexOf('--root');
const root = resolve(rootIdx >= 0 ? args[rootIdx + 1] : process.cwd());

const result = syncAgentViews(root, { check, dryRun });

if (result.orphans?.length) {
  console.warn('sync-agent-views: orphan generated files (canonical source gone):');
  for (const o of result.orphans) {
    console.warn(`  ${o.path}  (was ← ${o.source})`);
  }
}

if (result.status === 'conflict') {
  console.error(result.message);
  console.error(
    '\nsync-agent-views: refused to clobber — restore the generated file or update the canonical source.'
  );
  process.exit(2);
}

if (result.classified.adopts?.length && (dryRun || check || result.classified.write.length)) {
  for (const p of result.classified.adopts) {
    console.warn(`sync-agent-views: adopting marked file (no manifest): ${p}`);
  }
}

if (dryRun || check) {
  console.log(result.message);
  if (dryRun && result.classified.write.length) {
    for (const w of result.classified.write) {
      console.log(`  WRITE ${w.kind}: ${w.path}  ← ${w.source}`);
    }
  }
  process.exit(result.exitCode);
}

console.log(`sync-agent-views: ${result.message}`);
for (const w of result.classified.write) {
  console.log(`  wrote ${w.kind}: ${w.path}`);
}
process.exit(0);
