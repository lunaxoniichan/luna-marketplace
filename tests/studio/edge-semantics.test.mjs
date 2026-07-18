#!/usr/bin/env node
/**
 * Edge-semantics tests for constellation graph.
 * Uses Node strip-types to import the Studio TS module directly.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.LUNA_PLUGIN_ROOT || join(HERE, '../..'));
const STUDIO = resolve(process.env.LUNA_STUDIO_ROOT || join(ROOT, 'studio'));

const modUrl = pathToFileURL(join(STUDIO, 'src/lib/constellation.ts')).href;
const {
  buildConstellationEdges,
  assertHonestEdges,
  parseGitmodules,
  mergeParallelEdgeLabels,
} = await import(modUrl);

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`  FAIL ${msg}`);
    failed++;
  } else {
    console.log(`  ok ${msg}`);
  }
}

console.log('constellation edge semantics');

const plugin = { id: 'luna-marketplace', path: ROOT, source: 'plugin' };
const fixture = {
  id: 'fixture-alpha',
  path: join(STUDIO, 'fixtures/fixture-alpha'),
  source: 'fixture',
};

const gm = parseGitmodules(fixture.path);
assert(gm.some((g) => g.name === 'ECC'), 'fixture .gitmodules includes ECC');

const edges = buildConstellationEdges([plugin, fixture]);
assert(
  edges.some((e) => e.kind === 'kit' && e.from === 'luna-marketplace' && e.to === 'fixture-alpha'),
  'kit hierarchy edge'
);
assert(
  edges.some((e) => e.kind === 'submodule' && e.label === 'submodule:ECC'),
  'shared submodule ECC edge'
);
assert(assertHonestEdges(edges).length === 0, `honest taxonomy (${assertHonestEdges(edges)})`);
assert(!edges.some((e) => e.label.startsWith('module:')), 'no coincidental module:name edges');

// Two unrelated projects, no plugin, no shared remotes → exactly 0 edges
const onlyKitFree = buildConstellationEdges([
  { id: 'a', path: join(STUDIO, 'fixtures/fixture-alpha'), source: 'registry' },
  { id: 'b', path: join(STUDIO, 'fixtures/no-such-path-unique'), source: 'registry' },
]);
assert(onlyKitFree.length === 0, `no-plugin unrelated pair has 0 edges (got ${onlyKitFree.length})`);

// Coincidental child-dir names must NOT create edges
const tmp = mkdtempSync(join(tmpdir(), 'luna-mod-'));
try {
  const left = join(tmp, 'left');
  const right = join(tmp, 'right');
  for (const root of [left, right]) {
    mkdirSync(join(root, 'frontend'), { recursive: true });
    writeFileSync(join(root, 'frontend', 'AGENTS.md'), '# frontend\n');
  }
  const coincidental = buildConstellationEdges([
    { id: 'left', path: left, source: 'registry' },
    { id: 'right', path: right, source: 'registry' },
  ]);
  assert(
    coincidental.length === 0,
    `shared frontend/ dir name must not edge (got ${JSON.stringify(coincidental)})`
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const merged = mergeParallelEdgeLabels(edges);
assert(
  merged.some((e) => e.label.includes('kit') && e.label.includes('submodule:ECC')),
  'parallel kit+submodule merged for render'
);
assert(
  merged.filter((e) => e.from === 'luna-marketplace' && e.to === 'fixture-alpha').length === 1,
  'one rendered edge per node pair'
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nedge semantics ok');
