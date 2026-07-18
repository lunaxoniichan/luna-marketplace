/**
 * Fleet sync — plugin rules/ → all allow-listed vaults.
 * Contract: docs/specs/2026-07-19-fleet-sync-contract.md
 */
import { existsSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { syncAgentViews } from './agent-views.mjs';
import { commitPaths, listAllowedVaults } from './vault-crud.mjs';

const FLEET_COMMIT_MSG = 'chore(luna): sync agent views';
const MAX_TARGETS = 64;

/**
 * Resolve fleet targets with the same realpath wall as the gateway.
 * @param {object} opts
 * @param {string} opts.pluginRoot
 * @param {object} [opts.registry]
 * @param {string[]} [opts.targets] — vault ids or absolute paths; must ⊆ allow-list
 * @param {string[]} [opts.warnings]
 */
export function resolveFleetTargets(opts) {
  const pluginRoot = resolve(opts.pluginRoot);
  const warnings = opts.warnings || [];
  const allowed = listAllowedVaults({
    pluginRoot,
    registry: opts.registry,
  });

  if (!opts.targets?.length) {
    if (allowed.length > MAX_TARGETS) {
      throw Object.assign(
        new Error(`fleet sync: target set capped at ${MAX_TARGETS} (got ${allowed.length})`),
        { code: 'FLEET_TARGET_CAP' },
      );
    }
    return { pluginRoot, targets: allowed, warnings };
  }

  const byId = new Map(allowed.map((t) => [t.id, t]));
  const byRoot = new Map(allowed.map((t) => [t.root, t]));
  const selected = [];
  for (const raw of opts.targets) {
    const key = String(raw).trim();
    let hit = byId.get(key);
    if (!hit) {
      try {
        const abs = resolve(key);
        if (existsSync(abs)) {
          hit = byRoot.get(realpathSync(abs));
        }
      } catch {
        /* ignore */
      }
    }
    if (!hit) {
      throw Object.assign(
        new Error(
          `fleet sync: "${key}" is not the plugin root or a live registry project`,
        ),
        { code: 'VAULT_UNAUTHORIZED' },
      );
    }
    if (!selected.some((s) => s.root === hit.root)) selected.push(hit);
  }
  if (selected.length > MAX_TARGETS) {
    throw Object.assign(
      new Error(`fleet sync: target set capped at ${MAX_TARGETS}`),
      { code: 'FLEET_TARGET_CAP' },
    );
  }
  return { pluginRoot, targets: selected, warnings };
}

/**
 * @param {object} opts
 * @param {string} opts.pluginRoot
 * @param {object} [opts.registry]
 * @param {string[]} [opts.targets]
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.check]
 * @param {boolean} [opts.adoptUnmarked]
 * @param {boolean} [opts.commit] — default false; path-scoped via commitPaths
 * @param {typeof commitPaths} [opts.commitFn]
 */
export function syncAgentViewsFleet(opts = {}) {
  if (!opts.pluginRoot) {
    throw Object.assign(new Error('syncAgentViewsFleet: pluginRoot required'), {
      code: 'PLUGIN_ROOT',
    });
  }
  const { pluginRoot, targets, warnings } = resolveFleetTargets(opts);
  const rulesSourceDir = join(pluginRoot, 'rules');
  const commitFn = opts.commitFn || commitPaths;
  const dry = Boolean(opts.dryRun || opts.check);

  const results = [];
  let okCount = 0;
  let conflictCount = 0;
  let writeCount = 0;
  const dirtyTargets = [];

  for (const t of targets) {
    const memorySourceDir = join(t.root, 'memory');
    const syncResult = syncAgentViews(t.root, {
      rulesSourceDir,
      memorySourceDir,
      origin: 'plugin',
      adoptUnmarked: opts.adoptUnmarked,
      dryRun: opts.dryRun,
      check: opts.check,
    });

    const changedPaths = (syncResult.classified?.write || []).map((w) => w.path);
    const row = {
      vaultId: t.id,
      root: t.root,
      source: t.source,
      ...syncResult,
      changedPaths,
      dirty: false,
      committed: false,
      commitSkipped: null,
    };

    if (syncResult.status === 'conflict' || syncResult.exitCode === 2) {
      conflictCount++;
    } else {
      okCount++;
      if (changedPaths.length) {
        writeCount += changedPaths.length;
        if (!dry) {
          row.dirty = true;
          dirtyTargets.push({ target: t.id, root: t.root, changedPaths });

          if (opts.commit) {
            try {
              const relPaths = changedPaths.map((p) => relative(t.root, p));
              // Refuse if any path escapes the target root
              if (relPaths.some((p) => p.startsWith('..') || p.startsWith('/'))) {
                row.commitSkipped = 'paths-not-isolatable';
              } else {
                commitFn(t.root, relPaths, FLEET_COMMIT_MSG /* no Plan trailer */);
                row.committed = true;
                row.dirty = false;
              }
            } catch (e) {
              row.commitSkipped = e?.code || e?.message || 'commit-failed';
              // File writes stay; do not roll back
            }
          }
        }
      }
    }

    results.push(row);
  }

  let exitCode = 0;
  if (dry) {
    if (conflictCount > 0) exitCode = 2;
    else if (writeCount > 0 || results.some((r) => r.status === 'check-dirty')) exitCode = 1;
  } else if (conflictCount > 0) {
    exitCode = 2;
  }

  return {
    results,
    summary: {
      okCount,
      conflictCount,
      writeCount,
      dirtyTargets: dirtyTargets.filter((d) =>
        results.some((r) => r.vaultId === d.target && r.dirty)
      ),
      targetCount: targets.length,
      warnings,
    },
    exitCode,
    pluginRoot,
    rulesSourceDir,
  };
}

export { FLEET_COMMIT_MSG };
