#!/usr/bin/env node
/**
 * sync-agent-views.mjs — canonical rules/ + memory/ → agent views.
 *
 * Contracts:
 *   docs/specs/2026-07-18-sync-agent-views-contract.md  (per-root)
 *   docs/specs/2026-07-19-fleet-sync-contract.md         (--all / fleet)
 *
 * Usage:
 *   node scripts/sync-agent-views.mjs [--root <path>]
 *   node scripts/sync-agent-views.mjs --check
 *   node scripts/sync-agent-views.mjs --dry-run
 *   node scripts/sync-agent-views.mjs --all [--dry-run|--check] [--adopt-unmarked] [--commit]
 *   node scripts/sync-agent-views.mjs --all --root <plugin>
 */

import { resolve } from 'node:path';
import { syncAgentViews } from './lib/agent-views.mjs';
import { syncAgentViewsFleet } from './lib/fleet-sync.mjs';
import { listAllowedVaults } from './lib/vault-crud.mjs';

const args = process.argv.slice(2);
const check = args.includes('--check');
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const adoptUnmarked = args.includes('--adopt-unmarked');
const commit = args.includes('--commit');
const rootIdx = args.indexOf('--root');
const rootArg = rootIdx >= 0 ? args[rootIdx + 1] : null;

function printPerRoot(result, { dryRun, check }) {
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
  if (result.classified.migrates?.length && (dryRun || check)) {
    for (const p of result.classified.migrates) {
      console.warn(`sync-agent-views: would migrate unmarked: ${p}`);
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
}

if (all) {
  const envPlugin = process.env.LUNA_PLUGIN_ROOT
    ? resolve(process.env.LUNA_PLUGIN_ROOT)
    : null;
  const pluginRoot = resolve(rootArg || envPlugin || process.cwd());

  // --all --root <consumer> is ambiguous: --root with --all must be the plugin source
  if (rootArg) {
    const allowed = listAllowedVaults({ pluginRoot: envPlugin || pluginRoot });
    const hit = allowed.find((t) => t.root === pluginRoot || t.id === rootArg);
    if (hit && hit.source === 'registry' && envPlugin && hit.root !== envPlugin) {
      console.error(
        `sync-agent-views: --all --root <consumer> is ambiguous (got registry project ${hit.id}). Pass the plugin root, or omit --root.`
      );
      process.exit(2);
    }
    if (envPlugin && pluginRoot !== envPlugin) {
      // Explicit --root that isn't LUNA_PLUGIN_ROOT: only OK if it IS the plugin (same realpath)
      const pluginHit = allowed.find((t) => t.source === 'plugin');
      if (!pluginHit || pluginHit.root !== pluginRoot) {
        console.error(
          `sync-agent-views: --all --root must be the plugin root (LUNA_PLUGIN_ROOT=${envPlugin})`
        );
        process.exit(2);
      }
    }
  }

  let fleet;
  try {
    fleet = syncAgentViewsFleet({
      pluginRoot,
      dryRun,
      check,
      adoptUnmarked,
      commit,
    });
  } catch (e) {
    console.error(`sync-agent-views --all: ${e.message}`);
    process.exit(e.code === 'VAULT_UNAUTHORIZED' ? 2 : 1);
  }

  console.log(
    `sync-agent-views --all: targets=${fleet.summary.targetCount} ok=${fleet.summary.okCount} conflicts=${fleet.summary.conflictCount} writes=${fleet.summary.writeCount}`
  );
  for (const row of fleet.results) {
    const tag =
      row.status === 'conflict'
        ? 'CONFLICT'
        : dryRun || check
          ? row.status === 'check-dirty'
            ? 'WOULD-WRITE'
            : 'OK'
          : row.committed
            ? 'COMMITTED'
            : row.dirty
              ? 'DIRTY'
              : 'OK';
    console.log(`  [${tag}] ${row.vaultId}: ${row.message || row.error?.message || ''}`);
    if ((dryRun || check) && row.classified?.write?.length) {
      for (const w of row.classified.write.slice(0, 8)) {
        console.log(`      WRITE ${w.kind}: ${w.path}`);
      }
    }
    if (row.commitSkipped) {
      console.warn(`      commit skipped: ${row.commitSkipped}`);
    }
  }
  if (fleet.summary.dirtyTargets?.length && !commit && !dryRun && !check) {
    console.log(
      `  dirty targets (${fleet.summary.dirtyTargets.length}): commit locally or re-run with --commit`
    );
  }
  process.exit(fleet.exitCode);
}

// Per-root
const root = resolve(rootArg || process.cwd());
const result = syncAgentViews(root, { check, dryRun, adoptUnmarked });
printPerRoot(result, { dryRun, check });
