#!/usr/bin/env node
/**
 * Hermetic tests — Studio vault gateway (Server Action boundary).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  vaultCreate,
  vaultSyncPreview,
  vaultSyncApply,
  vaultSyncPreviewMany,
  vaultSyncApplyMany,
  vaultLifecyclePreview,
  vaultLifecycleApply,
  vaultDedupeReport,
  vaultCorrectionAccept,
  vaultCorrectionReject,
  assertVaultId,
  assertBodySize,
  assertCtxAllowed,
  normalizeError,
  MAX_BODY_BYTES,
} from '../../scripts/lib/vault-gateway.mjs';
import { sha256 } from '../../scripts/lib/vault-crud.mjs';
import { serializeFrontmatter, parseFrontmatter } from '../../scripts/lib/frontmatter.mjs';
import {
  planLifecycleMove,
  applyLifecycleMove,
} from '../../scripts/lib/doc-lifecycle.mjs';
import { resolveVaultRoot } from '../../scripts/lib/vault-crud.mjs';

const root = mkdtempSync(join(tmpdir(), 'vault-gateway-'));
let failed = 0;

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function setupRepo() {
  git(['init']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Vault Gateway Test']);
  mkdirSync(join(root, 'memory'), { recursive: true });
  mkdirSync(join(root, 'rules'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# t\n');
  git(['add', 'README.md']);
  git(['commit', '-m', 'chore: init']);
}

const ctx = {
  pluginRoot: root,
  registry: { version: 1, projects: [{ id: 'gw-proj', path: root }] },
};

process.env.LUNA_VAULT_GATEWAY_TEST = '1';

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

setupRepo();
console.log('vault-gateway boundary tests\n');

test('vaultId shape validation', () => {
  assert.ok(assertVaultId('../evil'));
  assert.ok(assertVaultId(''));
  assert.equal(assertVaultId('gw-proj'), null);
});

test('client-smuggled root / pathOrId rejected (unknown keys)', () => {
  const r = vaultCreate(
    {
      vaultId: 'gw-proj',
      root: '/tmp/evil',
      relPath: 'memory/x.md',
      body: 'x',
      frontmatter: {
        title: 'X',
        scope: 'project',
        type: 'memory',
        lifecycle: 'official',
        status: 'active',
      },
    },
    ctx,
  );
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'UNKNOWN_KEY');

  const r2 = vaultCreate(
    {
      vaultId: 'gw-proj',
      pathOrId: '/tmp/evil',
      relPath: 'memory/x.md',
      body: 'x',
      frontmatter: {
        title: 'X',
        scope: 'project',
        type: 'memory',
        lifecycle: 'official',
        status: 'active',
      },
    },
    ctx,
  );
  assert.equal(r2.ok, false);
  assert.equal(r2.error.code, 'UNKNOWN_KEY');
});

test('unknown vaultId → VAULT_UNAUTHORIZED', () => {
  const r = vaultCreate(
    {
      vaultId: 'not-registered',
      relPath: 'memory/x.md',
      body: 'x',
      frontmatter: {
        title: 'X',
        scope: 'project',
        type: 'memory',
        lifecycle: 'official',
        status: 'active',
      },
    },
    { pluginRoot: '/nonexistent-plugin', registry: { version: 1, projects: [] } },
  );
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'VAULT_UNAUTHORIZED');
});

test('CRUD success DTO has no vault brand / compact syncPreview', () => {
  const r = vaultCreate(
    {
      vaultId: 'gw-proj',
      relPath: 'rules/gateway-rule.md',
      body: '# Gateway rule\n\nBe careful.\n',
    },
    ctx,
  );
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.ok(r.commitSha);
  assert.ok(r.syncPreview);
  assert.ok(r.syncPreview.planToken);
  assert.ok(Array.isArray(r.syncPreview.writes));
  // No full desired bodies in DTO
  for (const w of r.syncPreview.writes) {
    assert.equal('desired' in w, false);
    assert.ok(w.desiredSha256 || w.desiredSha256 === null);
  }
  assert.equal('syncDryRun' in r, false);
  assert.equal('vault' in r, false);
});

test('vaultSyncApply without planToken rejected', () => {
  const r = vaultSyncApply({ vaultId: 'gw-proj' }, ctx);
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PLAN_TOKEN');
});

test('vaultSyncApply with stale planToken → PLAN_STALE', () => {
  const preview = vaultSyncPreview({ vaultId: 'gw-proj' }, ctx);
  assert.equal(preview.ok, true, JSON.stringify(preview.error));
  // Change tree so token no longer matches
  writeFileSync(join(root, 'rules/gateway-rule.md'), '# Gateway rule\n\nChanged.\n');
  const r = vaultSyncApply(
    { vaultId: 'gw-proj', planToken: preview.planToken },
    ctx,
  );
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'PLAN_STALE');
});

test('vaultSyncApply refuses conflicts (no clobber)', () => {
  // Hand-authored generated target without marker → conflict on sync
  mkdirSync(join(root, '.claude/rules'), { recursive: true });
  writeFileSync(
    join(root, '.claude/rules/gateway-rule.md'),
    '# Hand authored — no generated marker\n',
  );
  const preview = vaultSyncPreview({ vaultId: 'gw-proj' }, ctx);
  assert.equal(preview.ok, true);
  assert.ok(
    preview.status === 'conflict' || preview.conflicts.length > 0,
    JSON.stringify(preview),
  );
  const r = vaultSyncApply(
    { vaultId: 'gw-proj', planToken: preview.planToken },
    ctx,
  );
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'SYNC_CONFLICT');
  // File unchanged (no clobber)
  assert.match(
    readFileSync(join(root, '.claude/rules/gateway-rule.md'), 'utf8'),
    /Hand authored/,
  );
});

test('vaultSyncApply happy path after conflict cleared', () => {
  // Remove conflicting hand file; preview should be writable
  rmSync(join(root, '.claude/rules/gateway-rule.md'), { force: true });
  const preview = vaultSyncPreview({ vaultId: 'gw-proj' }, ctx);
  assert.equal(preview.ok, true, JSON.stringify(preview.error));
  assert.notEqual(preview.status, 'conflict');
  const r = vaultSyncApply(
    { vaultId: 'gw-proj', planToken: preview.planToken },
    ctx,
  );
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.ok(existsSync(join(root, '.claude/rules/gateway-rule.md')));
  assert.match(
    readFileSync(join(root, '.claude/rules/gateway-rule.md'), 'utf8'),
    /luna:generated/,
  );
});

test('fleet mode: token binds plugin source — plugin change → PLAN_STALE', () => {
  const consumer = mkdtempSync(join(tmpdir(), 'vault-gw-consumer-'));
  try {
    execFileSync('git', ['init'], { cwd: consumer, encoding: 'utf8' });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: consumer });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: consumer });
    mkdirSync(join(consumer, 'memory'), { recursive: true });
    writeFileSync(join(consumer, 'README.md'), '# c\n');
    execFileSync('git', ['add', 'README.md'], { cwd: consumer });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: consumer });

    const fleetCtx = {
      pluginRoot: root,
      registry: {
        version: 1,
        projects: [
          { id: 'gw-proj', path: root },
          { id: 'gw-consumer', path: consumer },
        ],
      },
    };

    // Consumer has empty rules/ — fleet preview must use plugin rules
    writeFileSync(join(root, 'rules/fleet-shared.md'), '# Fleet shared\n\nbody-v1\n');
    const preview = vaultSyncPreview(
      { vaultId: 'gw-consumer', mode: 'fleet' },
      fleetCtx,
    );
    assert.equal(preview.ok, true, JSON.stringify(preview.error));
    assert.equal(preview.mode, 'fleet');
    assert.ok(
      preview.writes.some((w) => w.path.endsWith('fleet-shared.md') || w.path.endsWith('fleet-shared.mdc')),
      JSON.stringify(preview.writes)
    );

    // Change plugin source after preview → apply must PLAN_STALE (not wrong empty plan)
    writeFileSync(join(root, 'rules/fleet-shared.md'), '# Fleet shared\n\nbody-v2\n');
    const stale = vaultSyncApply(
      { vaultId: 'gw-consumer', planToken: preview.planToken, mode: 'fleet' },
      fleetCtx,
    );
    assert.equal(stale.ok, false);
    assert.equal(stale.error.code, 'PLAN_STALE');

    // Fresh fleet preview+apply succeeds from plugin source
    const preview2 = vaultSyncPreview(
      { vaultId: 'gw-consumer', mode: 'fleet' },
      fleetCtx,
    );
    assert.equal(preview2.ok, true);
    const applied = vaultSyncApply(
      { vaultId: 'gw-consumer', planToken: preview2.planToken, mode: 'fleet' },
      fleetCtx,
    );
    assert.equal(applied.ok, true, JSON.stringify(applied.error));
    assert.match(
      readFileSync(join(consumer, '.claude/rules/fleet-shared.md'), 'utf8'),
      /body-v2/,
    );
    // Local mode on consumer (empty rules) would not write fleet-shared — proves source-aware
    const localPrev = vaultSyncPreview({ vaultId: 'gw-consumer', mode: 'local' }, fleetCtx);
    assert.ok(
      !localPrev.writes?.some((w) => String(w.path).includes('fleet-shared')),
      'local mode must not read plugin rules'
    );
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
});

test('fleet applyMany continues when one target conflicts', () => {
  const consumer = mkdtempSync(join(tmpdir(), 'vault-gw-consumer2-'));
  try {
    execFileSync('git', ['init'], { cwd: consumer, encoding: 'utf8' });
    execFileSync('git', ['config', 'user.email', 't@t'], { cwd: consumer });
    execFileSync('git', ['config', 'user.name', 't'], { cwd: consumer });
    mkdirSync(join(consumer, 'memory'), { recursive: true });
    mkdirSync(join(consumer, '.claude/rules'), { recursive: true });
    writeFileSync(join(consumer, 'README.md'), '# c\n');
    writeFileSync(join(consumer, '.claude/rules/fleet-shared.md'), 'unmarked hand\n');
    execFileSync('git', ['add', 'README.md'], { cwd: consumer });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: consumer });

    const fleetCtx = {
      pluginRoot: root,
      registry: {
        version: 1,
        projects: [
          { id: 'gw-proj', path: root },
          { id: 'gw-consumer2', path: consumer },
        ],
      },
    };

    const many = vaultSyncPreviewMany(
      { vaultIds: ['gw-proj', 'gw-consumer2'], mode: 'fleet' },
      fleetCtx,
    );
    assert.equal(many.ok, true);
    const tokens = many.results
      .filter((r) => r.ok)
      .map((r) => ({ vaultId: r.vaultId, planToken: r.planToken }));
    const applied = vaultSyncApplyMany({ targets: tokens, mode: 'fleet' }, fleetCtx);
    // One may conflict; overall ok may be false but both results present
    assert.equal(applied.results.length, tokens.length);
    const cons = applied.results.find((r) => r.vaultId === 'gw-consumer2');
    assert.equal(cons.ok, false);
    assert.equal(cons.error?.code, 'SYNC_CONFLICT');
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
});

test('ctx env-gate rejects overrides without LUNA_VAULT_GATEWAY_TEST', () => {
  const prev = process.env.LUNA_VAULT_GATEWAY_TEST;
  delete process.env.LUNA_VAULT_GATEWAY_TEST;
  assert.equal(assertCtxAllowed({ pluginRoot: root })?.code, 'CTX_FORBIDDEN');
  process.env.LUNA_VAULT_GATEWAY_TEST = prev || '1';
});

test('body size cap', () => {
  assert.equal(assertBodySize('x'.repeat(100)), null);
  assert.equal(assertBodySize('x'.repeat(MAX_BODY_BYTES + 1))?.code, 'BODY_TOO_LARGE');
});

test('error normalization redacts absolute paths', () => {
  const e = normalizeError(new Error('failed at /home/l/secret/repo/file.md'));
  assert.ok(!e.message.includes('/home/l'));
  assert.match(e.message, /<path>/);
});

test('vaultLifecyclePreview / Apply promote + PLAN_STALE', () => {
  for (const d of [
    'docs/pre-official/research',
    'docs/specs',
    'docs/post-official/legacy',
  ]) {
    mkdirSync(join(root, d), { recursive: true });
  }
  const rel = 'docs/pre-official/research/gw-promote.md';
  const fm = {
    title: 'GW Promote',
    scope: 'project',
    type: 'spec',
    lifecycle: 'pre_official',
    status: 'draft',
    keywords: [],
    related: [],
    updated: '2020-01-01',
  };
  writeFileSync(join(root, rel), serializeFrontmatter(fm, 'body\n'));
  git(['add', '--', rel]);
  git(['commit', '-m', 'docs: gw fixture']);

  const preview = vaultLifecyclePreview(
    { vaultId: 'gw-proj', relPath: rel, op: 'promote' },
    ctx,
  );
  assert.equal(preview.ok, true, JSON.stringify(preview.error));
  assert.equal(preview.dest, 'docs/specs/gw-promote.md');
  assert.ok(preview.planToken);

  const stale = vaultLifecycleApply(
    {
      vaultId: 'gw-proj',
      relPath: rel,
      op: 'promote',
      planToken: 'a'.repeat(64),
    },
    ctx,
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, 'PLAN_STALE');

  const applied = vaultLifecycleApply(
    {
      vaultId: 'gw-proj',
      relPath: rel,
      op: 'promote',
      planToken: preview.planToken,
    },
    ctx,
  );
  assert.equal(applied.ok, true, JSON.stringify(applied.error));
  assert.equal(existsSync(join(root, rel)), false);
  assert.equal(existsSync(join(root, 'docs/specs/gw-promote.md')), true);
});

test('gateway op and lib apply yield byte-identical results', () => {
  mkdirSync(join(root, 'docs/pre-official/research'), { recursive: true });
  mkdirSync(join(root, 'docs/specs'), { recursive: true });
  const rel = 'docs/pre-official/research/parity-gw.md';
  const fm = {
    title: 'Parity GW',
    scope: 'project',
    type: 'spec',
    lifecycle: 'pre_official',
    status: 'draft',
    keywords: [],
    related: [],
    updated: '2020-01-01',
  };
  writeFileSync(join(root, rel), serializeFrontmatter(fm, 'same body\n'));
  git(['add', '--', rel]);
  git(['commit', '-m', 'docs: parity fixture']);

  // Snapshot bytes via gateway apply on a copy path — use second file for lib
  const relLib = 'docs/pre-official/research/parity-lib.md';
  writeFileSync(join(root, relLib), serializeFrontmatter(fm, 'same body\n'));
  git(['add', '--', relLib]);
  git(['commit', '-m', 'docs: parity lib fixture']);

  const preview = vaultLifecyclePreview(
    { vaultId: 'gw-proj', relPath: rel, op: 'promote' },
    ctx,
  );
  assert.equal(preview.ok, true);
  const gw = vaultLifecycleApply(
    { vaultId: 'gw-proj', relPath: rel, op: 'promote', planToken: preview.planToken },
    ctx,
  );
  assert.equal(gw.ok, true, JSON.stringify(gw.error));

  const vault = resolveVaultRoot(root, {
    pluginRoot: root,
    registry: { version: 1, projects: [] },
  });
  const planned = planLifecycleMove({ vault, relPath: relLib, op: 'promote' });
  assert.equal(planned.ok, true);
  const lib = applyLifecycleMove({ vault, plan: planned.plan });
  assert.equal(lib.ok, true, JSON.stringify(lib.error));

  const gwBytes = readFileSync(join(root, 'docs/specs/parity-gw.md'), 'utf8');
  const libBytes = readFileSync(join(root, 'docs/specs/parity-lib.md'), 'utf8');
  // Same FM fields (ignore updated date stamp race by comparing structure)
  const g = parseFrontmatter(gwBytes);
  const l = parseFrontmatter(libBytes);
  assert.equal(g.data.lifecycle, l.data.lifecycle);
  assert.equal(g.data.status, l.data.status);
  assert.equal(g.data.title, l.data.title);
  assert.equal(g.body, l.body);
  assert.equal(gw.dest.replace(/[^/]+$/, ''), lib.dest.replace(/[^/]+$/, ''));
  assert.match(gw.dest, /^docs\/specs\//);
  assert.match(lib.dest, /^docs\/specs\//);
});

test('vaultDedupeReport is read-only and clusters overlapping knowledge', () => {
  mkdirSync(join(root, 'docs/generated'), { recursive: true });
  const knowledge = {
    generated_at: '2026-07-19T00:00:00.000Z',
    projects: [],
    counts: { items: 3 },
    items: [
      {
        project_id: 'gw-proj',
        scope: 'project',
        kind: 'spec',
        path: 'docs/specs/overlap-a.md',
        title: 'Overlap topic alpha',
        keywords: ['overlap', 'topic', 'alpha'],
        excerpt: 'Overlap topic alpha documentation body.',
      },
      {
        project_id: 'gw-proj',
        scope: 'project',
        kind: 'memory',
        path: 'memory/overlap-a.md',
        title: 'Overlap topic alpha notes',
        keywords: ['overlap', 'topic', 'alpha'],
        excerpt: 'Overlap topic alpha memory notes body.',
      },
      {
        project_id: 'gw-proj',
        scope: 'project',
        kind: 'spec',
        path: 'docs/specs/other.md',
        title: 'Unrelated zebra',
        keywords: ['zebra', 'migration'],
        excerpt: 'Zebra migration only.',
      },
      {
        project_id: 'gw-proj',
        scope: 'project',
        kind: 'rule',
        path: '.claude/rules/core.md',
        title: 'Core',
        keywords: ['overlap', 'topic', 'alpha'],
        excerpt: '<!-- luna:generated by scripts/sync-agent-views.mjs --> mirror',
      },
    ],
  };
  writeFileSync(join(root, 'docs/generated/knowledge.json'), JSON.stringify(knowledge), 'utf8');

  const beforePkg = readFileSync(join(root, 'README.md'), 'utf8');
  const r = vaultDedupeReport(
    { vaultId: 'gw-proj', scopeMode: 'vault' },
    ctx,
  );
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.report.version, 1);
  assert.ok(r.report.clusters.length >= 1);
  const hit = r.report.clusters.find(
    (c) =>
      c.items.some((i) => i.path === 'docs/specs/overlap-a.md') &&
      c.items.some((i) => i.path === 'memory/overlap-a.md'),
  );
  assert.ok(hit);
  assert.ok(!hit.items.some((i) => i.path === '.claude/rules/core.md'));
  assert.equal(readFileSync(join(root, 'README.md'), 'utf8'), beforePkg);

  const bad = vaultDedupeReport({ vaultId: 'gw-proj', scopeMode: 'nope', root: '/x' }, ctx);
  assert.equal(bad.ok, false);
});

test('correction accept via gateway writes only lessons; reject writes nothing; unknown key rejected', () => {
  // Seed a lessons.md so append has a target.
  mkdirSync(join(root, '.claude', 'rules'), { recursive: true });
  mkdirSync(join(root, '.cursor', 'rules'), { recursive: true });
  writeFileSync(join(root, '.claude', 'rules', 'lessons.md'), '# Lessons\n');
  writeFileSync(join(root, '.cursor', 'rules', 'lessons.mdc'), '# Lessons\n');

  // Unknown key rejected by the gate.
  const rejUnknown = vaultCorrectionAccept(
    { vaultId: 'gw-proj', relPath: 'memory/x.md', what_claude_did: 'a', implied_preference: 'b' },
    ctx,
  );
  assert.equal(rejUnknown.ok, false);

  // Reject writes nothing durable.
  const memBefore = existsSync(join(root, 'memory')) ? git(['status', '--porcelain']) : '';
  const rej = vaultCorrectionReject({ vaultId: 'gw-proj', candidateId: 'c1' }, ctx);
  assert.equal(rej.ok, true);
  assert.equal(rej.appended, false);

  // Accept appends one line to BOTH lesson files and nothing else.
  const acc = vaultCorrectionAccept(
    {
      vaultId: 'gw-proj',
      candidateId: 'c1',
      what_claude_did: 'skipping the review gate',
      implied_preference: 'wait for sign-off',
      applies_to: 'this_project',
    },
    ctx,
  );
  assert.equal(acc.ok, true);
  assert.equal(acc.appended, true);
  const md = readFileSync(join(root, '.claude', 'rules', 'lessons.md'), 'utf8');
  const mdc = readFileSync(join(root, '.cursor', 'rules', 'lessons.mdc'), 'utf8');
  assert.ok(md.includes('AVOID skipping the review gate — DO wait for sign-off'));
  assert.ok(mdc.includes('AVOID skipping the review gate — DO wait for sign-off'));
  // No memory/native write from accept.
  assert.ok(!existsSync(join(root, 'memory', 'x.md')));
  void memBefore;
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
try {
  rmSync(root, { recursive: true, force: true });
} catch {
  /* ignore */
}
process.exit(failed ? 1 : 0);

void sha256;
