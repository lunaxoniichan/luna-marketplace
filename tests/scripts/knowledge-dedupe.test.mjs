#!/usr/bin/env node
/**
 * Knowledge dedupe (lexical keyword pass) — hermetic contract tests.
 * Contract: docs/specs/2026-07-19-dedupe-assistant-contract.md
 */
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  filterCorpus,
  buildReport,
  DEFAULT_THRESHOLD,
} from '../../scripts/lib/knowledge-dedupe.mjs';
import { GENERATED_MARKER } from '../../scripts/lib/agent-views.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

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

function item(partial) {
  return {
    project_id: 'luna-marketplace',
    scope: 'project',
    kind: 'spec',
    path: 'docs/specs/x.md',
    title: 'X',
    lifecycle: 'official',
    keywords: [],
    excerpt: '',
    ...partial,
  };
}

console.log('knowledge-dedupe tests\n');

test('overlapping docs cluster above threshold', () => {
  const corpus = [
    item({
      path: 'docs/specs/vault-auth.md',
      title: 'Vault authorization wall',
      keywords: ['vault', 'authorization', 'path-confinement'],
      excerpt: 'Vault authorization wall confines relative paths to allowed prefixes.',
    }),
    item({
      path: 'memory/vault-auth-notes.md',
      title: 'Vault authorization notes',
      keywords: ['vault', 'authorization', 'path-confinement'],
      excerpt: 'Notes on vault authorization wall and path confinement rules.',
      kind: 'memory',
    }),
    item({
      path: 'docs/specs/unrelated-widgets.md',
      title: 'Widget catalog',
      keywords: ['widgets', 'ui', 'catalog'],
      excerpt: 'A catalog of unrelated UI widgets for demos.',
    }),
  ];
  const report = buildReport(corpus, {
    scope: { mode: 'vault', vaultId: 'luna-marketplace' },
    generatedAt: '2026-07-19T00:00:00.000Z',
  });
  assert.equal(report.version, 1);
  assert.ok(report.clusters.length >= 1);
  const hit = report.clusters.find(
    (c) =>
      c.items.some((i) => i.path === 'docs/specs/vault-auth.md') &&
      c.items.some((i) => i.path === 'memory/vault-auth-notes.md'),
  );
  assert.ok(hit, 'expected vault-auth pair to cluster');
  assert.ok(hit.score >= DEFAULT_THRESHOLD);
  assert.ok(!hit.items.some((i) => i.path === 'docs/specs/unrelated-widgets.md'));
  assert.deepEqual(hit.signals, [
    { kind: 'lexical_keyword', version: 1, score: hit.score },
  ]);
  assert.ok(Array.isArray(hit.why.shared_keywords));
  assert.ok(hit.why.shared_keywords.includes('vault'));
});

test('unrelated docs do not cluster', () => {
  const corpus = [
    item({
      path: 'docs/specs/alpha.md',
      title: 'Alpha protocol',
      keywords: ['alpha', 'protocol'],
      excerpt: 'Alpha protocol defines handshake steps.',
    }),
    item({
      path: 'docs/specs/zebra.md',
      title: 'Zebra migration',
      keywords: ['zebra', 'migration'],
      excerpt: 'Zebra migration moves legacy rows.',
    }),
  ];
  const report = buildReport(corpus, {
    scope: { mode: 'vault', vaultId: 'luna-marketplace' },
    generatedAt: '2026-07-19T00:00:00.000Z',
  });
  assert.equal(report.clusters.length, 0);
});

test('generated .claude/rules mirror excluded vs canonical rules/', () => {
  const corpus = [
    item({
      path: 'rules/core.md',
      kind: 'rule',
      title: 'Core',
      keywords: ['core', 'rules', 'vibe'],
      excerpt: 'Core engineering rules for vibe coding.',
    }),
    item({
      path: '.claude/rules/core.md',
      kind: 'rule',
      title: 'Core',
      keywords: ['core', 'rules', 'vibe'],
      excerpt: `<!-- ${GENERATED_MARKER} — DO NOT EDIT -->\nCore engineering rules for vibe coding.`,
    }),
    item({
      path: '.cursor/rules/core.mdc',
      kind: 'rule',
      title: 'Core',
      keywords: ['core', 'rules', 'vibe'],
      excerpt: `# GENERATED\nCore engineering rules for vibe coding.`,
    }),
  ];
  const filtered = filterCorpus(corpus);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].path, 'rules/core.md');

  const report = buildReport(corpus, {
    scope: { mode: 'vault', vaultId: 'luna-marketplace' },
    generatedAt: '2026-07-19T00:00:00.000Z',
  });
  assert.equal(report.clusters.length, 0);
});

test('lessons.md kept; luna:generated under docs excluded', () => {
  const corpus = [
    item({
      path: '.claude/rules/lessons.md',
      kind: 'lesson',
      title: 'lessons',
      keywords: ['lessons', 'corrections'],
      excerpt: 'AVOID X — DO Y',
    }),
    item({
      path: 'docs/specs/sneaky.md',
      title: 'Sneaky',
      keywords: ['lessons', 'corrections'],
      excerpt: `<!-- ${GENERATED_MARKER} -->\nShould be excluded`,
    }),
  ];
  const filtered = filterCorpus(corpus);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].path, '.claude/rules/lessons.md');
});

test('deterministic output for same input', () => {
  const corpus = [
    item({
      path: 'docs/specs/a.md',
      title: 'Lifecycle promote demote',
      keywords: ['lifecycle', 'promote', 'demote'],
      excerpt: 'Lifecycle promote and demote moves docs between buckets.',
    }),
    item({
      path: 'memory/lifecycle-notes.md',
      kind: 'memory',
      title: 'Lifecycle promote notes',
      keywords: ['lifecycle', 'promote', 'demote'],
      excerpt: 'Notes about lifecycle promote demote between buckets.',
    }),
  ];
  const opts = {
    scope: { mode: 'vault', vaultId: 'luna-marketplace' },
    generatedAt: '2026-07-19T00:00:00.000Z',
  };
  const a = JSON.stringify(buildReport(corpus, opts));
  const b = JSON.stringify(buildReport([...corpus].reverse(), opts));
  assert.equal(a, b);
});

test('buildReport performs zero file mutation', () => {
  const probe = join(ROOT, 'docs/generated/.dedupe-probe-should-not-exist');
  assert.equal(existsSync(probe), false);
  const before = existsSync(join(ROOT, 'package.json'))
    ? readFileSync(join(ROOT, 'package.json'), 'utf8')
    : '';
  buildReport(
    [
      item({
        path: 'docs/specs/a.md',
        title: 'Foo bar',
        keywords: ['foo', 'bar'],
        excerpt: 'Foo bar baz',
      }),
      item({
        path: 'docs/specs/b.md',
        title: 'Foo bar notes',
        keywords: ['foo', 'bar'],
        excerpt: 'Foo bar notes baz',
      }),
    ],
    {
      scope: { mode: 'vault', vaultId: 'luna-marketplace' },
      generatedAt: '2026-07-19T00:00:00.000Z',
    },
  );
  assert.equal(existsSync(probe), false);
  if (before) {
    assert.equal(readFileSync(join(ROOT, 'package.json'), 'utf8'), before);
  }
});

test('signals shape is semantic-extensible (lexical only in v1)', () => {
  const report = buildReport(
    [
      item({
        path: 'docs/specs/a.md',
        title: 'Shared topic alpha',
        keywords: ['shared', 'topic', 'alpha'],
        excerpt: 'Shared topic alpha documentation.',
      }),
      item({
        path: 'memory/shared-topic.md',
        kind: 'memory',
        title: 'Shared topic alpha notes',
        keywords: ['shared', 'topic', 'alpha'],
        excerpt: 'Shared topic alpha memory notes.',
      }),
    ],
    {
      scope: { mode: 'vault', vaultId: 'luna-marketplace' },
      generatedAt: '2026-07-19T00:00:00.000Z',
    },
  );
  assert.ok(report.clusters.length >= 1);
  for (const c of report.clusters) {
    assert.ok(c.signals.every((s) => s.kind === 'lexical_keyword'));
    assert.ok(!c.signals.some((s) => s.kind === 'semantic_embedding'));
  }
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
