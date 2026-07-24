#!/usr/bin/env node
/**
 * Graph memory Phase 3 — hermetic contract tests.
 * Contract: docs/specs/2026-07-19-graph-memory-backend-contract.md
 */
import assert from 'node:assert/strict';
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  mkdtempSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import {
  chunkMarkdown,
  rebuildGraphMemory,
  wipeGraphMemoryIndex,
  loadIndex,
  invokeGraphMemoryTool,
  assertReadOnlyTool,
  wouldWriteForbidden,
  searchIndex,
  INDEX_REL,
  sha256Text,
} from '../../scripts/lib/graph-memory.mjs';

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

function makeVault(tag = 'gm') {
  const root = mkdtempSync(join(tmpdir(), `luna-${tag}-`));
  const id = `vault-${tag}-${sha256Text(root).slice(0, 8)}`;
  mkdirSync(join(root, 'docs', 'specs'), { recursive: true });
  mkdirSync(join(root, 'docs', 'decisions'), { recursive: true });
  mkdirSync(join(root, 'docs', 'plans'), { recursive: true });
  mkdirSync(join(root, 'rules'), { recursive: true });
  mkdirSync(join(root, 'memory'), { recursive: true });
  mkdirSync(join(root, '.claude', 'rules'), { recursive: true });
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
keywords: [doodles, widgets]
---

# Random doodles

Unrelated widgets and doodles only.
`,
  );
  writeFileSync(
    join(root, '.claude', 'rules', 'lessons.md'),
    `- AVOID rewriting auth without planToken — DO re-derive planToken (2026-07-19)
- AVOID inventing new vault walls — DO reuse resolveVaultRoot (2026-07-19)
`,
  );
  writeFileSync(
    join(root, '.claude', 'rules', 'core.md'),
    `# GENERATED — edit the canonical source (rules/), not this file\n<!-- luna:generated -->\nfake generated rule\n`,
  );
  writeFileSync(join(root, 'rules', 'core.md'), `# Core\n\nUser wins.\n`);

  const plugin = mkdtempSync(join(tmpdir(), 'luna-plugin-'));
  mkdirSync(join(plugin, 'docs', 'generated'), { recursive: true });
  writeFileSync(
    join(plugin, 'docs', 'generated', 'knowledge.json'),
    JSON.stringify({
      items: [{ path: 'docs/SYSTEM_DESIGN.md', title: 'OLD TITLE', kind: 'architecture' }],
      projects: [{ id, path: root, scope_role: 'project' }],
    }),
  );

  const registry = {
    projects: [{ id, path: root }],
  };

  return { root, id, plugin, registry };
}

console.log('graph-memory tests\n');

await test('chunkMarkdown keeps fences and heading paths', () => {
  const parts = chunkMarkdown('# A\n\nhello\n\n```js\n# not a heading\n```\n\n## B\n\nworld\n');
  assert.ok(parts.length >= 2);
  assert.ok(parts.some((p) => p.content.includes('```js')));
  assert.ok(parts.some((p) => p.heading_path.includes('B') || p.heading_path === 'A > B'));
});

await test('mutation tools and forbidden writes rejected', () => {
  assert.throws(() => assertReadOnlyTool('add_memory', {}), /Mutation|forbidden/i);
  assert.throws(
    () => assertReadOnlyTool('search_context', { relPath: 'memory/x.md', body: 'nope' }),
    /forbidden|read-only|Write/i,
  );
  assert.throws(
    () =>
      assertReadOnlyTool('search_context', {
        nativeMemoryPath: '~/.claude/projects/x/memory/foo.md',
      }),
    /Native|forbidden/i,
  );
  assert.equal(wouldWriteForbidden('memory/note.md'), true);
  assert.equal(wouldWriteForbidden('.claude/rules/lessons.md'), true);
  assert.equal(wouldWriteForbidden('docs/specs/ok.md'), false);
});

await test('rebuild + lexical search + fail-open embeddings', async () => {
  const { root, id, plugin, registry } = makeVault('rebuild');
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED');
  };
  const result = await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.ok(existsSync(join(root, INDEX_REL)));
  assert.ok(
    result.index.status.embeddings === 'unavailable' ||
      ['embedding-degraded', 'stale-source', 'lexical-only'].includes(result.index.status.mode),
  );
  assert.ok(result.index.status.warnings.length >= 1);

  const index = loadIndex(root);
  assert.ok(index.sources.some((s) => s.source_path === '.claude/rules/lessons.md'));
  assert.ok(!index.sources.some((s) => s.source_path === '.claude/rules/core.md'));

  const hits = searchIndex(index, 'architecture system design host-first');
  assert.ok(hits.length >= 1);
  assert.ok(
    hits.some(
      (h) => h.source_path.includes('SYSTEM_DESIGN') || h.source_path.includes('decisions/'),
    ),
    'official architecture/ADR should rank for design query',
  );

  const status = invokeGraphMemoryTool(
    'graph_memory_status',
    { vaultId: id },
    { pluginRoot: plugin, registry },
  );
  assert.equal(status.ok, true);
  assert.equal(status.status.graph_backend, 'file-json');
});

await test('rebuild from scratch restores source identities', async () => {
  const { root, id, plugin, registry } = makeVault('scratch');
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    embed: false,
  });
  const before = loadIndex(root)
    .sources.map((s) => s.source_path)
    .sort();
  wipeGraphMemoryIndex(root);
  assert.equal(existsSync(join(root, INDEX_REL)), false);
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    embed: false,
  });
  const after = loadIndex(root)
    .sources.map((s) => s.source_path)
    .sort();
  assert.deepEqual(after, before);
});

await test('edit cleanup + delete orphan cleanup', async () => {
  const { root, id, plugin, registry } = makeVault('edit');
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    embed: false,
  });
  const mem = join(root, 'memory', 'weak-notes.md');
  writeFileSync(
    mem,
    `---
title: Random doodles
lifecycle: pre_official
type: memory
status: draft
---

# Random doodles

Changed content for hash flip ${Date.now()}.
`,
  );
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    embed: false,
  });
  const index1 = loadIndex(root);
  const memFacts = index1.facts.filter((f) => f.source_path === 'memory/weak-notes.md');
  assert.ok(memFacts.every((f) => f.status === 'active'));
  assert.ok(memFacts.length >= 1);

  rmSync(mem);
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    embed: false,
  });
  const index2 = loadIndex(root);
  assert.ok(!index2.sources.some((s) => s.source_path === 'memory/weak-notes.md'));
  assert.ok(
    !index2.facts.some((f) => f.source_path === 'memory/weak-notes.md' && f.status === 'active'),
  );
});

await test('divergent fixing surfaces active plan', async () => {
  const { id, plugin, registry } = makeVault('divergent');
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    embed: false,
  });
  const out = invokeGraphMemoryTool(
    'search_context',
    { vaultId: id, query: 'fix auth wall race planToken TOCTOU' },
    { pluginRoot: plugin, registry },
  );
  assert.ok(out.hits.some((h) => h.source_path.includes('plans/') && h.source_path.includes('fix-auth')));
});

await test('forgotten design prefers architecture over weak memory', async () => {
  const { id, plugin, registry } = makeVault('design');
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    embed: false,
  });
  const out = invokeGraphMemoryTool(
    'search_context',
    { vaultId: id, query: 'system architecture design local-first studio' },
    { pluginRoot: plugin, registry },
  );
  assert.ok(out.hits.length >= 1);
  const top = out.hits[0];
  assert.ok(
    top.source_path.includes('SYSTEM_DESIGN') ||
      top.source_kind === 'architecture' ||
      top.source_path.includes('decisions/'),
    `expected design authority on top, got ${top.source_path}`,
  );
  assert.notEqual(top.source_path, 'memory/weak-notes.md');
});

await test('scope wall: other vault memory not in default search', async () => {
  const a = makeVault('scope-a');
  const b = makeVault('scope-b');
  writeFileSync(
    join(b.root, 'memory', 'secret.md'),
    `---
title: Secret other project
type: memory
lifecycle: official
status: active
keywords: [topsecretunique]
---

# Secret

topsecretunique only in vault B
`,
  );
  const registry = {
    projects: [
      { id: a.id, path: a.root },
      { id: b.id, path: b.root },
    ],
  };
  await rebuildGraphMemory({
    vaultId: a.id,
    pluginRoot: a.plugin,
    registry,
    embed: false,
  });
  await rebuildGraphMemory({
    vaultId: b.id,
    pluginRoot: a.plugin,
    registry,
    embed: false,
  });
  const out = invokeGraphMemoryTool(
    'search_context',
    { vaultId: a.id, query: 'topsecretunique' },
    { pluginRoot: a.plugin, registry },
  );
  assert.ok(!out.hits.some((h) => h.source_path.includes('secret') || h.vault_id === b.id));
});

await test('check_conflicts returns array', async () => {
  const { root, id, plugin, registry } = makeVault('conflict');
  writeFileSync(
    join(root, '.claude', 'rules', 'lessons.md'),
    `- AVOID using resolveVaultRoot — DO invent a new wall (2026-07-19)
- AVOID inventing new vault walls — DO reuse resolveVaultRoot (2026-07-19)
`,
  );
  await rebuildGraphMemory({
    vaultId: id,
    pluginRoot: plugin,
    registry,
    embed: false,
  });
  const out = invokeGraphMemoryTool(
    'check_conflicts',
    { vaultId: id },
    { pluginRoot: plugin, registry },
  );
  assert.ok(Array.isArray(out.conflicts));
});

await test('embeddings batch all chunks; partial status is honest', async () => {
  const { maybeEmbedChunks } = await import('../../scripts/lib/graph-memory.mjs');
  const chunks = Array.from({ length: 70 }, (_, i) => ({
    excerpt: `chunk text number ${i}`,
    content: `chunk text number ${i}`,
    embedding: null,
  }));
  let calls = 0;
  const fetchImpl = async (_url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    const n = body.input.length;
    return {
      ok: true,
      async json() {
        return {
          data: body.input
            .map((_, i) => ({
              embedding: [i + calls, 0.1, 0.2],
            }))
            .slice(0, n),
        };
      },
    };
  };
  const full = await maybeEmbedChunks(chunks, { fetchImpl, batchSize: 64 });
  assert.equal(full.ok, true);
  assert.equal(full.partial, false);
  assert.equal(full.embedded_count, 70);
  assert.equal(full.total, 70);
  assert.equal(calls, 2, 'expected two embedding batches for 70 chunks');
  assert.ok(chunks.every((c) => Array.isArray(c.embedding)));

  // Short batch mid-flight → partial, never claim full ok coverage
  const partialChunks = Array.from({ length: 10 }, (_, i) => ({
    excerpt: `p${i}`,
    embedding: null,
  }));
  const shortFetch = async () => ({
    ok: true,
    async json() {
      return { data: [{ embedding: [1, 2, 3] }, { embedding: [4, 5, 6] }] };
    },
  });
  const partial = await maybeEmbedChunks(partialChunks, {
    fetchImpl: shortFetch,
    batchSize: 10,
  });
  assert.equal(partial.ok, true);
  assert.equal(partial.partial, true);
  assert.equal(partial.embedded_count, 2);
  assert.equal(partial.total, 10);
});

await test('embedding auth header sent only when an API key is present (T11)', async () => {
  const { maybeEmbedChunks } = await import('../../scripts/lib/graph-memory.mjs');
  const okFetch = (sink) => async (_url, init) => {
    sink.push(init.headers || {});
    const body = JSON.parse(init.body);
    return { ok: true, async json() { return { data: body.input.map(() => ({ embedding: [1, 2, 3] })) }; } };
  };
  const withKey = [];
  await maybeEmbedChunks([{ excerpt: 'a', embedding: null }], {
    fetchImpl: okFetch(withKey), apiKey: 'sk-xyz', baseUrl: 'http://primary/v1',
  });
  assert.equal(withKey[0].Authorization ?? withKey[0].authorization, 'Bearer sk-xyz');

  const noKey = [];
  await maybeEmbedChunks([{ excerpt: 'a', embedding: null }], {
    fetchImpl: okFetch(noKey), baseUrl: 'http://primary/v1',
  });
  assert.ok(!(noKey[0].Authorization || noKey[0].authorization), 'no auth header without a key');
});

await test('primary 401 falls back to the keyless TEI endpoint (T11)', async () => {
  const { maybeEmbedChunks } = await import('../../scripts/lib/graph-memory.mjs');
  const urls = [];
  const fetchImpl = async (url, init) => {
    urls.push(url);
    if (url.includes('primary')) return { ok: false, status: 401, async json() { return {}; } };
    assert.ok(
      !(init.headers && (init.headers.Authorization || init.headers.authorization)),
      'fallback endpoint must be keyless',
    );
    const body = JSON.parse(init.body);
    return { ok: true, async json() { return { data: body.input.map(() => ({ embedding: [0.1, 0.2, 0.3] })) }; } };
  };
  const res = await maybeEmbedChunks(
    [{ excerpt: 'a', embedding: null }, { excerpt: 'b', embedding: null }],
    { fetchImpl, apiKey: 'sk-1', baseUrl: 'http://primary/v1', fallbackUrl: 'http://fallback/v1' },
  );
  assert.equal(res.ok, true);
  assert.equal(res.embedded_count, 2);
  assert.equal(res.endpoint, 'http://fallback/v1');
  assert.ok(urls.some((u) => u.includes('primary')) && urls.some((u) => u.includes('fallback')));
});

await test('embedding dim consistency: mismatched-length vectors rejected, dim recorded (T11)', async () => {
  const { maybeEmbedChunks } = await import('../../scripts/lib/graph-memory.mjs');
  const chunks = [
    { excerpt: 'a', embedding: null },
    { excerpt: 'b', embedding: null },
    { excerpt: 'c', embedding: null },
  ];
  const dims = [4, 4, 2];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    return {
      ok: true,
      async json() {
        return { data: body.input.map((_, i) => ({ embedding: Array.from({ length: dims[i] }, () => 0.5) })) };
      },
    };
  };
  const res = await maybeEmbedChunks(chunks, { fetchImpl, baseUrl: 'http://x/v1', batchSize: 10 });
  assert.equal(res.embedding_dim, 4, 'first accepted vector sets the index-wide dim');
  assert.equal(res.embedded_count, 2, 'mismatched-dim vector rejected');
  assert.equal(chunks[2].embedding, null);
  assert.equal(res.partial, true);
  assert.match(res.reason, /dim/);
});

await test('embeddings fail-open when primary 401 and fallback down (T11)', async () => {
  const { maybeEmbedChunks } = await import('../../scripts/lib/graph-memory.mjs');
  const fetchImpl = async (url) => {
    if (url.includes('primary')) return { ok: false, status: 401, async json() { return {}; } };
    throw new Error('ECONNREFUSED');
  };
  const res = await maybeEmbedChunks([{ excerpt: 'a', embedding: null }], {
    fetchImpl, apiKey: 'k', baseUrl: 'http://primary/v1', fallbackUrl: 'http://fallback/v1',
  });
  assert.equal(res.ok, false);
  assert.equal(res.embedded_count, 0);
});

await test('embedQuery fail-open returns null; embeds a single query on success (T19)', async () => {
  const { embedQuery } = await import('../../scripts/lib/graph-memory.mjs');
  const down = async () => { throw new Error('ECONNREFUSED'); };
  assert.equal(await embedQuery('hello', { fetchImpl: down, fallbackUrl: 'http://primary/v1' }), null);
  assert.equal(await embedQuery('', { fetchImpl: down }), null, 'empty query → null');
  const up = async (_url, init) => {
    const body = JSON.parse(init.body);
    return { ok: true, async json() { return { data: body.input.map(() => ({ embedding: [1, 2, 3, 4] })) }; } };
  };
  assert.deepEqual(await embedQuery('hello', { fetchImpl: up, baseUrl: 'http://x/v1' }), [1, 2, 3, 4]);
});

await test('searchIndex ranks by queryEmbedding when supplied — semantic lane (T19)', async () => {
  const { searchIndex } = await import('../../scripts/lib/graph-memory.mjs');
  const index = {
    sources: [
      { source_path: 'a.md', source_sha256: 'h1' },
      { source_path: 'b.md', source_sha256: 'h2' },
    ],
    chunks: [
      { id: '1', project_id: 'v', vault_id: 'v', source_path: 'a.md', source_kind: 'doc',
        heading_path: 'A', title: 'A', lifecycle: 'official', status: 'active', scope: 'vault',
        tokens: ['alpha'], excerpt: 'alpha', source_sha256: 'h1', content_sha256: 'c1', embedding: [1, 0, 0] },
      { id: '2', project_id: 'v', vault_id: 'v', source_path: 'b.md', source_kind: 'doc',
        heading_path: 'B', title: 'B', lifecycle: 'official', status: 'active', scope: 'vault',
        tokens: ['beta'], excerpt: 'beta', source_sha256: 'h2', content_sha256: 'c2', embedding: [0, 1, 0] },
    ],
  };
  // No queryEmbedding: both are equal-authority official docs → tie broken by path order (a before b).
  const lexical = searchIndex(index, 'zzz', {});
  assert.equal(lexical.length, 2);
  assert.equal(lexical[0].source_path, 'a.md', 'authority tie → path order');
  // queryEmbedding aligned to chunk 2 lifts it above the tie, with an embedding lane in why[].
  const semantic = searchIndex(index, 'zzz', { queryEmbedding: [0, 1, 0] });
  assert.equal(semantic[0].source_path, 'b.md', 'queryEmbedding re-ranks chunk 2 to the top');
  assert.ok(semantic[0].why.some((w) => w.lane === 'embedding'));
});

await test('recent_changes is git-mtime ordered (newest first), honest lane (T12)', async () => {
  // Real git repo with two commits at distinct times — proves recency ordering,
  // not path order.
  const root = mkdtempSync(join(tmpdir(), 'luna-gm-mtime-'));
  const id = `vault-mtime-${sha256Text(root).slice(0, 8)}`;
  const plugin = mkdtempSync(join(tmpdir(), 'luna-plugin-mtime-'));
  mkdirSync(join(plugin, 'docs', 'generated'), { recursive: true });
  const registry = { projects: [{ id, path: root }] };
  const git = (args, env = {}) =>
    execFileSync('git', ['-C', root, ...args], { stdio: 'ignore', env: { ...process.env, ...env } });

  mkdirSync(join(root, 'docs', 'specs'), { recursive: true });
  git(['init']);
  git(['config', 'user.email', 't@e.com']);
  git(['config', 'user.name', 'T']);

  // Older commit: aaa.md ; newer commit: zzz.md (alphabetically zzz > aaa,
  // so path order would put aaa first — recency must put zzz first).
  writeFileSync(join(root, 'docs', 'specs', 'aaa-old.md'), `---\ntitle: Old\ntype: spec\nlifecycle: official\nstatus: active\n---\n\n# Old\n\nold content\n`);
  git(['add', '.']);
  git(['commit', '-m', 'old'], { GIT_AUTHOR_DATE: '2026-01-01T00:00:00', GIT_COMMITTER_DATE: '2026-01-01T00:00:00' });

  writeFileSync(join(root, 'docs', 'specs', 'zzz-new.md'), `---\ntitle: New\ntype: spec\nlifecycle: official\nstatus: active\n---\n\n# New\n\nnew content\n`);
  git(['add', '.']);
  git(['commit', '-m', 'new'], { GIT_AUTHOR_DATE: '2026-06-01T00:00:00', GIT_COMMITTER_DATE: '2026-06-01T00:00:00' });

  await rebuildGraphMemory({ vaultId: id, pluginRoot: plugin, registry, embed: false });
  const out = invokeGraphMemoryTool('recent_changes', { vaultId: id }, { pluginRoot: plugin, registry });
  const paths = out.hits.map((h) => h.source_path);
  const iNew = paths.indexOf('docs/specs/zzz-new.md');
  const iOld = paths.indexOf('docs/specs/aaa-old.md');
  assert.ok(iNew >= 0 && iOld >= 0, 'both sources present');
  assert.ok(iNew < iOld, `newer commit must sort first (got ${JSON.stringify(paths)})`);
  assert.equal(out.hits[iNew].why[0].lane, 'git_mtime', 'lane must be honest when mtimes exist');
  assert.ok(out.hits[iNew].changed_at, 'changed_at ISO present');
  assert.ok(out.hits[iNew].git_mtime > out.hits[iOld].git_mtime);

  rmSync(root, { recursive: true, force: true });
  rmSync(plugin, { recursive: true, force: true });
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
