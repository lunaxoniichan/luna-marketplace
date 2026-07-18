#!/usr/bin/env node
/**
 * Fleet sync contract tests — pre-existing unmarked consumer + real git tree.
 * Contract: docs/specs/2026-07-19-fleet-sync-contract.md
 */
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { syncAgentViewsFleet, resolveFleetTargets, FLEET_COMMIT_MSG } from '../../scripts/lib/fleet-sync.mjs';
import { hasGeneratedMarker } from '../../scripts/lib/agent-views.mjs';

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(e);
  }
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initGit(dir) {
  git(dir, ['init']);
  git(dir, ['config', 'user.email', 'fleet@test']);
  git(dir, ['config', 'user.name', 'Fleet Test']);
  writeFileSync(join(dir, 'README.md'), '# t\n');
  git(dir, ['add', 'README.md']);
  git(dir, ['commit', '-m', 'chore: init']);
}

const plugin = mkdtempSync(join(tmpdir(), 'fleet-plugin-'));
const consumer = mkdtempSync(join(tmpdir(), 'fleet-consumer-'));
const outsider = mkdtempSync(join(tmpdir(), 'fleet-outsider-'));

try {
  initGit(plugin);
  initGit(consumer);
  initGit(outsider);

  mkdirSync(join(plugin, 'rules'), { recursive: true });
  writeFileSync(join(plugin, 'rules', 'core.md'), '# Core\n\nfleet shared\n');
  mkdirSync(join(consumer, '.claude', 'rules'), { recursive: true });
  mkdirSync(join(consumer, '.cursor', 'rules'), { recursive: true });
  mkdirSync(join(consumer, 'memory'), { recursive: true });
  // Pre-existing unmarked (real consumer shape)
  writeFileSync(join(consumer, '.claude', 'rules', 'core.md'), '# Core\nold mirror\n');
  writeFileSync(join(consumer, '.cursor', 'rules', 'core.mdc'), '---\ndescription: x\n---\nold\n');
  writeFileSync(join(consumer, '.claude', 'rules', 'lessons.md'), '# Lessons\n- keep\n');
  // Unrelated dirty work in consumer
  writeFileSync(join(consumer, 'WIP.md'), 'unrelated in-flight\n');

  const registry = {
    version: 1,
    projects: [
      { id: 'consumer', path: consumer },
      { id: basename(plugin), path: plugin },
    ],
  };
  const pluginId = basename(plugin);

  console.log('fleet-sync contract\n');

  test('resolveFleetTargets refuses outsider (CLI wall parity)', () => {
    assert.throws(
      () =>
        resolveFleetTargets({
          pluginRoot: plugin,
          registry,
          targets: [outsider],
        }),
      (e) => e.code === 'VAULT_UNAUTHORIZED'
    );
  });

  test('default fleet apply: unmarked consumer conflicts; plugin still writes', () => {
    const r = syncAgentViewsFleet({
      pluginRoot: plugin,
      registry,
      targets: [pluginId, 'consumer'],
    });
    assert.equal(r.exitCode, 2);
    assert.equal(r.summary.conflictCount, 1);
    const cons = r.results.find((x) => x.vaultId === 'consumer');
    assert.equal(cons.status, 'conflict');
    assert.ok(readFileSync(join(consumer, '.claude', 'rules', 'core.md'), 'utf8').includes('old mirror'));
    // Plugin target should have received generated views (no unmarked conflict there)
    const plug = r.results.find((x) => x.vaultId === pluginId);
    assert.ok(plug.status === 'ok' || plug.exitCode === 0);
    assert.ok(existsSync(join(plugin, '.claude', 'rules', 'core.md')));
  });

  test('adopt-unmarked migrates consumer; protected intact; origin plugin', () => {
    const r = syncAgentViewsFleet({
      pluginRoot: plugin,
      registry,
      targets: ['consumer'],
      adoptUnmarked: true,
    });
    assert.equal(r.exitCode, 0, r.results[0]?.message);
    assert.ok(
      hasGeneratedMarker(readFileSync(join(consumer, '.claude', 'rules', 'core.md'), 'utf8'))
    );
    assert.ok(
      readdirSync(join(consumer, '.claude', 'rules')).some((f) =>
        /^core\.md\.pre-fleet-\d{8}/.test(f)
      )
    );
    assert.ok(readFileSync(join(consumer, '.claude', 'rules', 'lessons.md'), 'utf8').includes('keep'));
    const man = JSON.parse(readFileSync(join(consumer, '.luna', 'agent-views-manifest.json'), 'utf8'));
    const entry = man.targets[join(consumer, '.claude', 'rules', 'core.md')];
    assert.equal(entry.origin, 'plugin');
  });

  test('default-dirty-no-commit: dirty tree, WIP untouched, no new commit', () => {
    // Force a content change so there is something to write
    writeFileSync(join(plugin, 'rules', 'core.md'), '# Core\n\nfleet shared v2\n');
    const before = git(consumer, ['rev-parse', 'HEAD']);
    const r = syncAgentViewsFleet({
      pluginRoot: plugin,
      registry,
      targets: ['consumer'],
    });
    assert.equal(r.exitCode, 0);
    assert.ok(r.summary.dirtyTargets.some((d) => d.target === 'consumer'));
    assert.equal(git(consumer, ['rev-parse', 'HEAD']), before);
    assert.ok(readFileSync(join(consumer, 'WIP.md'), 'utf8').includes('unrelated'));
    const status = git(consumer, ['status', '--porcelain']);
    assert.ok(status.includes('WIP.md') || status.includes('?? WIP.md'));
    assert.ok(
      readFileSync(join(consumer, '.claude', 'rules', 'core.md'), 'utf8').includes('fleet shared v2')
    );
  });

  test('path-scoped --commit: only changedPaths; WIP left uncommitted', () => {
    writeFileSync(join(plugin, 'rules', 'core.md'), '# Core\n\nfleet shared v3\n');
    const before = git(consumer, ['rev-parse', 'HEAD']);
    const r = syncAgentViewsFleet({
      pluginRoot: plugin,
      registry,
      targets: ['consumer'],
      commit: true,
    });
    assert.equal(r.exitCode, 0);
    const after = git(consumer, ['rev-parse', 'HEAD']);
    assert.notEqual(after, before);
    const msg = git(consumer, ['log', '-1', '--format=%B']);
    assert.ok(msg.startsWith(FLEET_COMMIT_MSG));
    assert.ok(!msg.includes('Plan:'));
    // WIP still untracked/uncommitted
    const status = git(consumer, ['status', '--porcelain']);
    assert.ok(/WIP\.md/.test(status));
    // Generated files clean in last commit
    assert.ok(
      git(consumer, ['show', '--name-only', '--pretty=', 'HEAD']).includes('.claude/rules/core.md')
    );
    assert.ok(!git(consumer, ['show', '--name-only', '--pretty=', 'HEAD']).includes('WIP.md'));
  });

  test('dry-run exit 1 when would-write; writes nothing', () => {
    writeFileSync(join(plugin, 'rules', 'core.md'), '# Core\n\nfleet shared v4\n');
    const before = readFileSync(join(consumer, '.claude', 'rules', 'core.md'), 'utf8');
    const r = syncAgentViewsFleet({
      pluginRoot: plugin,
      registry,
      targets: ['consumer'],
      dryRun: true,
    });
    assert.equal(r.exitCode, 1);
    assert.equal(readFileSync(join(consumer, '.claude', 'rules', 'core.md'), 'utf8'), before);
  });
} finally {
  rmSync(plugin, { recursive: true, force: true });
  rmSync(consumer, { recursive: true, force: true });
  rmSync(outsider, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nfleet-sync contract ok');
