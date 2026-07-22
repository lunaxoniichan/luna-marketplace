#!/usr/bin/env node
/**
 * Cross-project reuse search + ADR why-view — Phase 4.4 (S3) hermetic tests.
 * Contract: docs/specs/2026-07-20-context-pack-contract.md §D4 + §5 + §12.
 */
import assert from 'node:assert/strict';
import {
  mkdirSync,
  writeFileSync,
  mkdtempSync,
  readdirSync,
  statSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { rebuildGraphMemory } from '../../scripts/lib/graph-memory.mjs';
import {
  reuseSearch,
  listAdrDecisions,
  REUSE_SCOPES,
} from '../../scripts/lib/reuse-search.mjs';

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.error(`  FAIL ${name}`);
    console.error(e);
  }
}

function sha8(s) {
  return createHash('sha256').update(String(s)).digest('hex').slice(0, 8);
}

function seedVault(tag, { keyword, adr = false }) {
  const root = mkdtempSync(join(tmpdir(), `luna-${tag}-`));
  const id = `vault-${tag}-${sha8(root)}`;
  mkdirSync(join(root, 'docs', 'specs'), { recursive: true });
  mkdirSync(join(root, 'docs', 'decisions'), { recursive: true });
  mkdirSync(join(root, '.git'), { recursive: true });
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(
    join(root, 'docs', 'specs', `${tag}-solution.md`),
    `---\ntitle: ${tag} solution\nlifecycle: official\ntype: spec\nstatus: active\nkeywords: [${keyword}]\n---\n\n# ${tag} solution\n\nHow ${tag} solved ${keyword} with a durable approach.\n`,
  );
  if (adr) {
    writeFileSync(
      join(root, 'docs', 'decisions', '2026-07-18-host-first.md'),
      `---\ntitle: Host-first Studio\ntype: decision\nlifecycle: official\nstatus: active\nrelated:\n  - docs/plans/2026-07-18-luna-studio.md\n  - docs/specs/host.md\n---\n\n# Host-first\n\nWhy the Studio stays local-first.\n`,
    );
    writeFileSync(join(root, 'docs', 'decisions', 'README.md'), '# Decisions index\n');
  }
  const plugin = mkdtempSync(join(tmpdir(), 'luna-plugin-rs-'));
  mkdirSync(join(plugin, 'docs', 'generated'), { recursive: true });
  return { root, id, plugin };
}

function listFilesRecursive(dir, base = dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) listFilesRecursive(p, base, out);
    else out.push(relative(base, p).replace(/\\/g, '/'));
  }
  return out;
}

function treeMap(root) {
  const map = {};
  for (const rel of listFilesRecursive(root)) map[rel] = readFileSync(join(root, rel), 'utf8');
  return map;
}

console.log('reuse-search tests\n');

await test('REUSE_SCOPES exposes vault / vault+plugin / registry', () => {
  assert.deepEqual([...REUSE_SCOPES], ['vault', 'vault+plugin', 'registry']);
});

await test('default vault scope excludes other projects', async () => {
  const a = seedVault('rs-a', { keyword: 'ratelimiter' });
  const b = seedVault('rs-b', { keyword: 'ratelimiter' });
  const registry = {
    projects: [
      { id: a.id, path: a.root },
      { id: b.id, path: b.root },
    ],
  };
  await rebuildGraphMemory({ vaultId: a.id, pluginRoot: a.plugin, registry, embed: false });
  await rebuildGraphMemory({ vaultId: b.id, pluginRoot: a.plugin, registry, embed: false });

  const out = reuseSearch({ vaultId: a.id, query: 'ratelimiter', pluginRoot: a.plugin, registry });
  assert.equal(out.ok, true);
  assert.equal(out.scope, 'vault');
  assert.ok(out.hits.length >= 1);
  assert.ok(out.hits.every((h) => h.source_vault === a.id), 'default scope must not reach vault b');
  assert.ok(!out.hits.some((h) => h.source_vault === b.id));
});

await test('registry scope reaches other vault with mandatory provenance; writes nothing', async () => {
  const a = seedVault('rs2-a', { keyword: 'circuitbreaker' });
  const b = seedVault('rs2-b', { keyword: 'circuitbreaker' });
  const registry = {
    projects: [
      { id: a.id, path: a.root },
      { id: b.id, path: b.root },
    ],
  };
  await rebuildGraphMemory({ vaultId: a.id, pluginRoot: a.plugin, registry, embed: false });
  await rebuildGraphMemory({ vaultId: b.id, pluginRoot: a.plugin, registry, embed: false });

  const beforeA = treeMap(a.root);
  const beforeB = treeMap(b.root);

  const out = reuseSearch({
    vaultId: a.id,
    query: 'circuitbreaker',
    scope: 'registry',
    pluginRoot: a.plugin,
    registry,
  });
  assert.equal(out.scope, 'registry');
  const fromB = out.hits.filter((h) => h.source_vault === b.id);
  assert.ok(fromB.length >= 1, 'registry scope should reach vault b');
  for (const h of out.hits) {
    // Mandatory provenance on every hit
    assert.ok(h.source_vault && h.vault_id && h.source_path, 'hit needs provenance');
    assert.ok(h.source_sha256, 'hit needs source hash');
  }
  assert.equal(out.writes, 'none');
  // No writes into either vault (read-only discovery).
  assert.deepEqual(treeMap(a.root), beforeA);
  assert.deepEqual(treeMap(b.root), beforeB);
});

await test('registry scope fail-open when a vault index is missing', async () => {
  const a = seedVault('rs3-a', { keyword: 'bulkhead' });
  const b = seedVault('rs3-b', { keyword: 'bulkhead' });
  const registry = {
    projects: [
      { id: a.id, path: a.root },
      { id: b.id, path: b.root },
    ],
  };
  // Only build A's index; B has no index.
  await rebuildGraphMemory({ vaultId: a.id, pluginRoot: a.plugin, registry, embed: false });

  const out = reuseSearch({
    vaultId: a.id,
    query: 'bulkhead',
    scope: 'registry',
    pluginRoot: a.plugin,
    registry,
  });
  assert.equal(out.ok, true, 'must not throw when a vault index is missing');
  const bStatus = out.vaults.find((v) => v.id === b.id);
  assert.equal(bStatus.searched, false);
  assert.ok(bStatus.reason, 'missing index should carry a reason');
  assert.ok(out.hits.some((h) => h.source_vault === a.id));
});

await test('reuseSearch validates scope + query', () => {
  const a = seedVault('rs4-a', { keyword: 'x' });
  const registry = { projects: [{ id: a.id, path: a.root }] };
  assert.throws(
    () => reuseSearch({ vaultId: a.id, query: 'x', scope: 'nope', pluginRoot: a.plugin, registry }),
    (e) => e && e.code === 'SCOPE',
  );
  assert.throws(
    () => reuseSearch({ vaultId: a.id, query: '', pluginRoot: a.plugin, registry }),
    (e) => e && e.code === 'QUERY',
  );
});

await test('ADR why-view lists decisions with governed links; read-only', () => {
  const a = seedVault('adr', { keyword: 'x', adr: true });
  const registry = { projects: [{ id: a.id, path: a.root }] };
  const before = treeMap(a.root);
  const out = listAdrDecisions({ vaultId: a.id, pluginRoot: a.plugin, registry });
  assert.equal(out.ok, true);
  assert.equal(out.decisions.length, 1, 'README.md excluded');
  const d = out.decisions[0];
  assert.equal(d.title, 'Host-first Studio');
  assert.ok(d.governs.includes('docs/plans/2026-07-18-luna-studio.md'));
  assert.deepEqual(treeMap(a.root), before, 'ADR view must not mutate anything');
});

process.exit(failed ? 1 : 0);
