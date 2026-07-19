#!/usr/bin/env node
/**
 * Doc lifecycle promote/demote/supersede — hermetic contract tests.
 * Contract: docs/specs/2026-07-19-doc-lifecycle-promote-demote-contract.md
 */
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { serializeFrontmatter, parseFrontmatter } from '../../scripts/lib/frontmatter.mjs';
import { resolveVaultRoot, sha256 } from '../../scripts/lib/vault-crud.mjs';
import {
  deriveDest,
  assertTransition,
  planLifecycleMove,
  applyLifecycleMove,
  checkLifecycleDrift,
  LIFECYCLE_COMMIT_PREFIX,
} from '../../scripts/lib/doc-lifecycle.mjs';

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

function initVault() {
  const root = mkdtempSync(join(tmpdir(), 'doc-lifecycle-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'lc@test']);
  git(root, ['config', 'user.name', 'Lifecycle Test']);
  for (const d of [
    'docs/specs',
    'docs/plans',
    'docs/decisions',
    'docs/pre-official/research',
    'docs/pre-official/audits',
    'docs/post-official/completed-plans',
    'docs/post-official/legacy',
    'memory',
    'rules',
  ]) {
    mkdirSync(join(root, d), { recursive: true });
  }
  writeFileSync(join(root, 'README.md'), '# t\n');
  writeFileSync(join(root, 'docs/README.md'), '# docs\n');
  git(root, ['add', 'README.md', 'docs']);
  git(root, ['commit', '-m', 'chore: init']);
  const vault = resolveVaultRoot(root, {
    pluginRoot: root,
    registry: { version: 1, projects: [] },
  });
  return { root, vault };
}

function writeDoc(root, relPath, fm, body = 'body\n') {
  mkdirSync(join(root, relPath, '..'), { recursive: true });
  const text = serializeFrontmatter(fm, body);
  writeFileSync(join(root, relPath), text, 'utf8');
  git(root, ['add', '--', relPath]);
  git(root, ['commit', '-m', `docs: add ${relPath}`]);
  return text;
}

function fmBase(over = {}) {
  return {
    title: 'Fixture',
    scope: 'project',
    type: 'spec',
    lifecycle: 'pre_official',
    status: 'draft',
    keywords: ['t'],
    related: [],
    updated: '2020-01-01',
    ...over,
  };
}

console.log('doc-lifecycle contract\n');

test('deriveDest maps lifecycle+type to folders', () => {
  assert.equal(
    deriveDest('docs/pre-official/research/x.md', { lifecycle: 'official', type: 'spec' }),
    'docs/specs/x.md',
  );
  assert.equal(
    deriveDest('docs/plans/p.md', { lifecycle: 'post_official', type: 'plan' }),
    'docs/post-official/completed-plans/p.md',
  );
  assert.equal(
    deriveDest('docs/specs/s.md', { lifecycle: 'post_official', type: 'spec' }),
    'docs/post-official/legacy/s.md',
  );
  assert.equal(
    deriveDest('memory/m.md', { lifecycle: 'post_official', type: 'memory' }),
    'memory/m.md',
  );
});

test('assertTransition allows legal edges only', () => {
  assert.equal(assertTransition('promote', 'pre_official'), null);
  assert.ok(assertTransition('promote', 'official'));
  assert.equal(assertTransition('demote', 'official'), null);
  assert.equal(assertTransition('demote', 'pre_official'), null);
  assert.ok(assertTransition('demote', 'post_official'));
  assert.equal(assertTransition('supersede', 'official'), null);
  assert.ok(assertTransition('supersede', 'pre_official'));
});

{
  const { root, vault } = initVault();
  const src = 'docs/pre-official/research/promote-me.md';
  writeDoc(root, src, fmBase());

  test('promote pre→official: tag+move+history-preserving commit, no Plan trailer', () => {
    const planned = planLifecycleMove({ vault, relPath: src, op: 'promote' });
    assert.equal(planned.ok, true);
    assert.equal(planned.plan.dest, 'docs/specs/promote-me.md');
    const applied = applyLifecycleMove({ vault, plan: planned.plan, commitFn: undefined });
    assert.equal(applied.ok, true, JSON.stringify(applied.error));
    assert.equal(existsSync(join(root, src)), false);
    assert.equal(existsSync(join(root, 'docs/specs/promote-me.md')), true);
    const parsed = parseFrontmatter(readFileSync(join(root, 'docs/specs/promote-me.md'), 'utf8'));
    assert.equal(parsed.data.lifecycle, 'official');
    assert.equal(parsed.data.status, 'active');
    const msg = git(root, ['log', '-1', '--format=%B']);
    assert.match(msg, new RegExp(`^${LIFECYCLE_COMMIT_PREFIX.replace(/[()]/g, '\\$&')} promote`));
    assert.doesNotMatch(msg, /^Plan:/m);
    // rename recorded (R) or at least not a pure copy with both paths present
    const nameStatus = git(root, ['log', '-1', '--name-status', '--format=']);
    assert.match(nameStatus, /R\d+\s+docs\/pre-official\/research\/promote-me\.md\s+docs\/specs\/promote-me\.md|D\s+docs\/pre-official|A\s+docs\/specs/);
  });

  const replacement = 'docs/specs/replacement.md';
  writeDoc(root, replacement, fmBase({ lifecycle: 'official', status: 'active', title: 'Replacement' }));
  const toSuper = 'docs/specs/old-design.md';
  writeDoc(root, toSuper, fmBase({ lifecycle: 'official', status: 'active', title: 'Old' }));

  test('supersede with real superseded_by → legacy + status superseded', () => {
    const planned = planLifecycleMove({
      vault,
      relPath: toSuper,
      op: 'supersede',
      supersededBy: replacement,
    });
    assert.equal(planned.ok, true);
    const applied = applyLifecycleMove({ vault, plan: planned.plan });
    assert.equal(applied.ok, true, JSON.stringify(applied.error));
    assert.equal(existsSync(join(root, toSuper)), false);
    const dest = 'docs/post-official/legacy/old-design.md';
    assert.equal(existsSync(join(root, dest)), true);
    const parsed = parseFrontmatter(readFileSync(join(root, dest), 'utf8'));
    assert.equal(parsed.data.lifecycle, 'post_official');
    assert.equal(parsed.data.status, 'superseded');
    assert.equal(parsed.data.superseded_by, replacement);
  });

  test('illegal transition rejected', () => {
    const planned = planLifecycleMove({
      vault,
      relPath: replacement,
      op: 'promote',
    });
    assert.equal(planned.ok, false);
    assert.equal(planned.error.code, 'TRANSITION_ILLEGAL');
  });

  test('destination collision refused', () => {
    const collideSrc = 'docs/pre-official/research/collide.md';
    writeDoc(root, collideSrc, fmBase({ title: 'Collide src' }));
    writeDoc(
      root,
      'docs/specs/collide.md',
      fmBase({ lifecycle: 'official', status: 'active', title: 'Already there' }),
    );
    const planned = planLifecycleMove({ vault, relPath: collideSrc, op: 'promote' });
    assert.equal(planned.ok, false);
    assert.equal(planned.error.code, 'DEST_EXISTS');
  });

  test('--check catches tag↔folder drift', () => {
    const driftPath = 'docs/specs/drifted.md';
    writeDoc(
      root,
      driftPath,
      fmBase({ lifecycle: 'post_official', status: 'done', title: 'Drifted' }),
    );
    const report = checkLifecycleDrift(root);
    assert.ok(report.mismatches.some((m) => m.path === driftPath));
  });

  test('memory is tag-only (no move)', () => {
    const mem = 'memory/note.md';
    writeDoc(
      root,
      mem,
      fmBase({ type: 'memory', lifecycle: 'official', status: 'active', title: 'Mem' }),
    );
    const planned = planLifecycleMove({ vault, relPath: mem, op: 'demote' });
    assert.equal(planned.ok, true);
    assert.equal(planned.plan.dest, mem);
    const applied = applyLifecycleMove({ vault, plan: planned.plan });
    assert.equal(applied.ok, true, JSON.stringify(applied.error));
    assert.equal(existsSync(join(root, mem)), true);
    const parsed = parseFrontmatter(readFileSync(join(root, mem), 'utf8'));
    assert.equal(parsed.data.lifecycle, 'post_official');
    assert.equal(parsed.data.status, 'done');
  });

  test('rules/ rejected as lifecycle surface', () => {
    writeFileSync(join(root, 'rules', 'core.md'), '# core\n');
    git(root, ['add', '--', 'rules/core.md']);
    git(root, ['commit', '-m', 'docs: rule']);
    const planned = planLifecycleMove({ vault, relPath: 'rules/core.md', op: 'demote' });
    assert.equal(planned.ok, false);
    assert.ok(['LIFECYCLE_SURFACE', 'PATH_ZONE'].includes(planned.error.code));
  });

  test('planToken / apply parity: same plan bytes', () => {
    const src2 = 'docs/pre-official/research/parity.md';
    writeDoc(root, src2, fmBase({ title: 'Parity' }));
    const a = planLifecycleMove({ vault, relPath: src2, op: 'promote' });
    const b = planLifecycleMove({ vault, relPath: src2, op: 'promote' });
    assert.equal(a.ok && b.ok, true);
    assert.equal(a.planToken, b.planToken);
    assert.equal(sha256(a.plan.desiredContents), sha256(b.plan.desiredContents));
  });

  rmSync(root, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall passed');
