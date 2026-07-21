#!/usr/bin/env node
/**
 * Context Pack builder — Phase 4.1 (S1a) hermetic contract tests.
 * Contract: docs/specs/2026-07-20-context-pack-contract.md §12
 */
import assert from 'node:assert/strict';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { rebuildGraphMemory } from '../../scripts/lib/graph-memory.mjs';
import {
  buildContextPack,
  previewContextPack,
  wipeContextPacks,
  PACK_DIR_REL,
  PACK_TYPES,
} from '../../scripts/lib/context-pack.mjs';

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

function makeVault(tag = 'cp') {
  const root = mkdtempSync(join(tmpdir(), `luna-${tag}-`));
  const id = `vault-${tag}-${sha8(root)}`;
  mkdirSync(join(root, 'docs', 'specs'), { recursive: true });
  mkdirSync(join(root, 'docs', 'decisions'), { recursive: true });
  mkdirSync(join(root, 'docs', 'plans'), { recursive: true });
  mkdirSync(join(root, 'rules'), { recursive: true });
  mkdirSync(join(root, 'memory'), { recursive: true });
  mkdirSync(join(root, '.claude', 'rules'), { recursive: true });
  mkdirSync(join(root, '.cursor', 'rules'), { recursive: true });
  mkdirSync(join(root, '.git'), { recursive: true });
  writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(
    join(root, 'docs', 'SYSTEM_DESIGN.md'),
    `---
title: System Design
lifecycle: official
type: architecture
status: active
---

# System Design

Canonical architecture for the vault editor and memory index.
`,
  );
  writeFileSync(
    join(root, 'docs', 'specs', 'auth-wall.md'),
    `---
title: Auth wall
lifecycle: official
type: spec
status: active
keywords: [vault, authorization]
---

# Auth wall

Path confinement via resolveVaultRoot.
`,
  );
  writeFileSync(
    join(root, 'docs', 'plans', '2026-07-19-fix-auth.md'),
    `---
title: Fix auth wall race
lifecycle: official
type: plan
status: active
keywords: [auth, fix, race]
---

# Fix auth wall race

Accepted diagnosis: TOCTOU on planToken. Apply re-derive.
`,
  );
  writeFileSync(
    join(root, 'docs', 'decisions', '2026-07-19-host-first.md'),
    `---
title: Host-first Studio
lifecycle: official
type: decision
status: active
---

# Host-first

Studio stays local-first on the host.
`,
  );
  writeFileSync(
    join(root, 'memory', 'weak-notes.md'),
    `---
title: Random doodles
lifecycle: pre_official
type: memory
status: draft
---

# Random doodles

Unrelated widgets and doodles only.
`,
  );
  writeFileSync(
    join(root, '.claude', 'rules', 'lessons.md'),
    `- AVOID rewriting auth without planToken — DO re-derive planToken (2026-07-19)
`,
  );
  writeFileSync(join(root, 'rules', 'core.md'), `# Core\n\nUser wins.\n`);

  const plugin = mkdtempSync(join(tmpdir(), 'luna-plugin-cp-'));
  mkdirSync(join(plugin, 'docs', 'generated'), { recursive: true });

  const registry = { projects: [{ id, path: root }] };
  return { root, id, plugin, registry };
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

console.log('context-pack tests\n');

await test('PACK_TYPES covers planning/implementation/review', () => {
  assert.deepEqual([...PACK_TYPES].sort(), ['implementation', 'planning', 'review'].sort());
});

await test('build writes only under docs/generated/context-packs/ + carries source hashes', async () => {
  const { root, id, plugin, registry } = makeVault('write');
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    embed: false,
  });

  const before = new Set(listFilesRecursive(root));
  const result = await buildContextPack({
    vaultId: id,
    task: 'architecture system design host-first',
    packType: 'planning',
    tokenBudget: 4000,
    pluginRoot: plugin,
    registry,
  });

  assert.equal(result.ok, true);
  assert.ok(result.manifest);
  assert.equal(result.manifest.vault_id, id);
  assert.equal(result.manifest.pack_type, 'planning');
  assert.ok(result.manifest.pack_id);
  assert.ok(result.manifest.source_hashes);
  assert.ok(Object.keys(result.manifest.source_hashes).length >= 1);

  for (const item of result.manifest.items) {
    assert.ok(item.source_sha256, `item ${item.source_path} needs source_sha256`);
    assert.equal(result.manifest.source_hashes[item.source_path], item.source_sha256);
  }

  const after = listFilesRecursive(root);
  const added = after.filter((p) => !before.has(p));
  assert.ok(added.length >= 1, 'expected pack artifact written');
  for (const p of added) {
    assert.ok(
      p.startsWith('docs/generated/context-packs/'),
      `unexpected write outside pack dir: ${p}`,
    );
  }
  assert.ok(!added.some((p) => p.startsWith('memory/') || p.includes('lessons.md')));
  assert.ok(existsSync(join(root, ...PACK_DIR_REL.split('/'))));
  assert.ok(result.path.startsWith(join(root, ...PACK_DIR_REL.split('/'))));
});

await test('token budget enforced — truncated reported', async () => {
  const { root, id, plugin, registry } = makeVault('budget');
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    embed: false,
  });

  const tiny = await buildContextPack({
    vaultId: id,
    task: 'architecture system design auth wall host-first planToken',
    packType: 'implementation',
    tokenBudget: 40,
    pluginRoot: plugin,
    registry,
  });
  assert.equal(tiny.ok, true);
  assert.equal(tiny.manifest.truncated, true);
  assert.ok(Array.isArray(tiny.manifest.dropped_item_ids));
  const used = tiny.manifest.items.reduce((n, i) => n + (i.token_estimate || 0), 0);
  assert.ok(used <= 40, `used ${used} exceeds budget 40`);

  const roomy = await previewContextPack({
    vaultId: id,
    task: 'architecture system design auth wall host-first planToken',
    packType: 'implementation',
    tokenBudget: 50_000,
    pluginRoot: plugin,
    registry,
  });
  assert.equal(roomy.ok, true);
  assert.ok(roomy.manifest.items.length >= tiny.manifest.items.length);
});

await test('fail-open when embeddings unavailable — lexical pack still returns', async () => {
  const { root, id, plugin, registry } = makeVault('failopen');
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED');
  };
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    fetchImpl,
  });

  const result = await buildContextPack({
    vaultId: id,
    task: 'system design architecture',
    packType: 'planning',
    tokenBudget: 2000,
    pluginRoot: plugin,
    registry,
    // GitNexus inject returns unavailable (default)
    gitnexusQuery: null,
  });

  assert.equal(result.ok, true);
  assert.ok(result.manifest.items.length >= 1, 'lexical pack must still return items');
  assert.ok(
    ['lexical-only', 'degraded', 'ok'].includes(result.manifest.status),
    `unexpected status ${result.manifest.status}`,
  );
  assert.ok(result.manifest.lanes);
  assert.ok(
    result.manifest.lanes.embedding === 'unavailable' ||
      result.manifest.lanes.embedding === 'degraded' ||
      result.manifest.lanes.embedding === 'skipped',
    `embedding lane should not pretend ok: ${result.manifest.lanes.embedding}`,
  );
  assert.equal(result.manifest.lanes.gitnexus, 'unavailable');
});

await test('default vault scope excludes other projects memory', async () => {
  const a = makeVault('scope-a');
  const bRoot = mkdtempSync(join(tmpdir(), 'luna-scope-b-'));
  const bId = `vault-scope-b-${sha8(bRoot)}`;
  mkdirSync(join(bRoot, 'docs'), { recursive: true });
  mkdirSync(join(bRoot, 'memory'), { recursive: true });
  mkdirSync(join(bRoot, '.claude', 'rules'), { recursive: true });
  mkdirSync(join(bRoot, '.git'), { recursive: true });
  writeFileSync(join(bRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(
    join(bRoot, 'memory', 'secret-project-b.md'),
    `---
title: Project B only secret
lifecycle: official
type: memory
status: active
keywords: [secret-zebra-token, unique-b-memory]
---

# Project B only secret

secret-zebra-token unique-b-memory must not leak into vault A packs.
`,
  );
  writeFileSync(
    join(bRoot, 'docs', 'SYSTEM_DESIGN.md'),
    `---
title: B Design
lifecycle: official
type: architecture
status: active
---

# B Design
`,
  );

  const registry = {
    projects: [
      { id: a.id, path: a.root },
      { id: bId, path: bRoot },
    ],
  };

  await rebuildGraphMemory({
    vaultId: a.id,
    pluginRoot: a.plugin,
    registry,
    embed: false,
  });
  await rebuildGraphMemory({
    vaultId: bId,
    pluginRoot: a.plugin,
    registry,
    embed: false,
  });

  const result = await buildContextPack({
    vaultId: a.id,
    task: 'secret-zebra-token unique-b-memory',
    packType: 'review',
    tokenBudget: 4000,
    scope: 'vault',
    pluginRoot: a.plugin,
    registry,
  });

  assert.equal(result.ok, true);
  assert.equal(result.manifest.scope, 'vault');
  for (const item of result.manifest.items) {
    assert.equal(item.vault_id, a.id);
    assert.ok(!String(item.source_path).includes('secret-project-b'));
    assert.ok(!String(item.excerpt || '').includes('secret-zebra-token'));
  }
});

await test('preview does not write; wipe removes pack dir', async () => {
  const { root, id, plugin, registry } = makeVault('preview');
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    embed: false,
  });

  const before = listFilesRecursive(root);
  const prev = await previewContextPack({
    vaultId: id,
    task: 'host-first studio',
    packType: 'review',
    tokenBudget: 2000,
    pluginRoot: plugin,
    registry,
  });
  assert.equal(prev.ok, true);
  assert.ok(prev.manifest.items.length >= 1);
  const afterPreview = listFilesRecursive(root);
  assert.deepEqual(afterPreview.sort(), before.sort());

  await buildContextPack({
    vaultId: id,
    task: 'host-first studio',
    packType: 'review',
    tokenBudget: 2000,
    pluginRoot: plugin,
    registry,
  });
  assert.ok(existsSync(join(root, ...PACK_DIR_REL.split('/'))));
  wipeContextPacks(root);
  assert.equal(existsSync(join(root, ...PACK_DIR_REL.split('/'))), false);
});

await test('pack refuses unknown packType and missing vaultId', async () => {
  const { id, plugin, registry } = makeVault('bad');
  await assert.rejects(
    () =>
      buildContextPack({
        vaultId: id,
        task: 'x',
        packType: 'nonsense',
        tokenBudget: 100,
        pluginRoot: plugin,
        registry,
      }),
    /packType|PACK_TYPE/i,
  );
  await assert.rejects(
    () =>
      buildContextPack({
        vaultId: '',
        task: 'x',
        packType: 'planning',
        tokenBudget: 100,
        pluginRoot: plugin,
        registry,
      }),
    /vaultId/i,
  );
});

process.exit(failed ? 1 : 0);
