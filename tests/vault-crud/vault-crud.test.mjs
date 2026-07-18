#!/usr/bin/env node
/**
 * Hermetic tests — vault CRUD mutation / safety contract.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  assertAllowedPath,
  validateFrontmatter,
  resolveVaultRoot,
  createFile,
  updateFile,
  deleteFile,
  mergeFiles,
  sha256,
} from '../../scripts/lib/vault-crud.mjs';

const root = mkdtempSync(join(tmpdir(), 'vault-crud-'));
let failed = 0;

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function setupRepo() {
  git(['init']);
  git(['config', 'user.email', 'test@example.com']);
  git(['config', 'user.name', 'Vault CRUD Test']);
  mkdirSync(join(root, 'memory'), { recursive: true });
  mkdirSync(join(root, 'rules'), { recursive: true });
  mkdirSync(join(root, 'docs/specs'), { recursive: true });
  writeFileSync(join(root, 'README.md'), '# t\n');
  git(['add', 'README.md']);
  git(['commit', '-m', 'chore: init']);
}

function openVault() {
  return resolveVaultRoot(root, {
    pluginRoot: root,
    registry: { version: 1, projects: [] },
  });
}

function fm(over = {}) {
  return {
    title: 'Test note',
    scope: 'project',
    type: 'memory',
    lifecycle: 'official',
    status: 'active',
    keywords: ['t'],
    related: [],
    updated: '2020-01-01',
    ...over,
  };
}

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
const vault = openVault();
console.log('vault-crud contract tests\n');

test('reject path outside zones', () => {
  assert.throws(() => assertAllowedPath(root, 'src/foo.md'), /PATH_ZONE|outside/);
});

test('reject .claude generated tree', () => {
  assert.throws(() => assertAllowedPath(root, '.claude/rules/x.md'), /PATH_GENERATED|forbidden/);
});

test('reject docs/generated', () => {
  assert.throws(() => assertAllowedPath(root, 'docs/generated/x.json'), /PATH_GENERATED|forbidden/);
});

test('reject lessons.md', () => {
  assert.throws(() => assertAllowedPath(root, 'rules/lessons.md'), /PATH_PROTECTED|Protected/);
});

test('reject path traversal', () => {
  assert.throws(() => assertAllowedPath(root, 'memory/../.claude/x.md'), /Invalid|PATH/);
});

test('non-registered root rejected by resolveVaultRoot', () => {
  const other = mkdtempSync(join(tmpdir(), 'vault-crud-evil-'));
  assert.throws(
    () =>
      resolveVaultRoot(other, {
        pluginRoot: root,
        registry: { version: 1, projects: [] },
      }),
    (e) => e.code === 'VAULT_UNAUTHORIZED',
  );
  rmSync(other, { recursive: true, force: true });
});

test('raw vaultRoot rejected; forged / cloned vault handle rejected', () => {
  const r1 = createFile({
    vaultRoot: root,
    relPath: 'memory/nope.md',
    body: 'x',
    frontmatter: fm(),
  });
  assert.equal(r1.ok, false);
  assert.equal(r1.error.code, 'VAULT_UNAUTHORIZED');

  const r2 = createFile({
    vault: { root },
    relPath: 'memory/nope.md',
    body: 'x',
    frontmatter: fm(),
  });
  assert.equal(r2.ok, false);
  assert.equal(r2.error.code, 'VAULT_UNAUTHORIZED');

  // Spread clone is a new object — WeakSet brand does not transfer
  const r3 = createFile({
    vault: { ...vault },
    relPath: 'memory/nope.md',
    body: 'x',
    frontmatter: fm(),
  });
  assert.equal(r3.ok, false);
  assert.equal(r3.error.code, 'VAULT_UNAUTHORIZED');
});

test('registry id resolves live project', () => {
  const v = resolveVaultRoot('fixture-proj', {
    pluginRoot: '/nonexistent-plugin-root-xyz',
    registry: {
      version: 1,
      projects: [{ id: 'fixture-proj', path: root }],
    },
  });
  assert.equal(v.root, vault.root);
  assert.equal(v.source, 'registry');
});

test('FM invalid lifecycle rejected', () => {
  const errs = validateFrontmatter(fm({ lifecycle: 'draftish' }), { requireFm: true });
  assert.ok(errs.some((e) => e.field === 'lifecycle'));
});

test('FM missing title rejected', () => {
  const errs = validateFrontmatter(fm({ title: '' }), { requireFm: true });
  assert.ok(errs.some((e) => e.field === 'title'));
});

test('create memory → one scoped commit + syncDryRun + stamped updated', () => {
  const r = createFile({
    vault,
    relPath: 'memory/alpha.md',
    body: 'hello [[slug]]',
    frontmatter: fm({ title: 'Alpha', updated: '2020-01-01' }),
  });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.ok(r.commitSha);
  assert.ok(r.syncDryRun, 'memory write must attach sync dry-run');
  assert.ok(existsSync(join(root, 'memory/alpha.md')));
  const text = readFileSync(join(root, 'memory/alpha.md'), 'utf8');
  assert.ok(!text.includes('2020-01-01'), 'updated must be server-stamped');
  assert.match(text, /updated: \d{4}-\d{2}-\d{2}/);
  const show = git(['show', '--stat', '--name-only', '--pretty=', 'HEAD']);
  assert.match(show, /memory\/alpha\.md/);
  assert.ok(!show.includes('README.md') || show.includes('memory/'));
});

test('update memory → commit', () => {
  const r = updateFile({
    vault,
    relPath: 'memory/alpha.md',
    body: 'updated',
    frontmatter: fm({ title: 'Alpha2' }),
  });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.match(readFileSync(join(root, 'memory/alpha.md'), 'utf8'), /Alpha2/);
});

test('delete without confirmPath rejected', () => {
  const r = deleteFile({
    vault,
    relPath: 'memory/alpha.md',
    confirmPath: 'memory/wrong.md',
    confirmSha: 'deadbeef',
  });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'CONFIRM_REQUIRED');
  assert.ok(existsSync(join(root, 'memory/alpha.md')));
});

test('delete without confirmSha rejected', () => {
  const r = deleteFile({
    vault,
    relPath: 'memory/alpha.md',
    confirmPath: 'memory/alpha.md',
  });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'CONFIRM_SHA');
});

test('delete active warns + confirmSha commits', () => {
  const bytes = readFileSync(join(root, 'memory/alpha.md'), 'utf8');
  const r = deleteFile({
    vault,
    relPath: 'memory/alpha.md',
    confirmPath: 'memory/alpha.md',
    confirmSha: sha256(bytes),
  });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.ok(r.warnings?.includes('deleting active doc'));
  assert.ok(!existsSync(join(root, 'memory/alpha.md')));
  assert.match(git(['log', '-1', '--pretty=%s']), /delete memory\/alpha\.md/);
});

test('create rule → syncDryRun; no write to .claude from CRUD', () => {
  const r = createFile({
    vault,
    relPath: 'rules/sample.md',
    body: '# Sample\n\nDo the thing.\n',
  });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.ok(r.syncDryRun);
  assert.ok(!existsSync(join(root, '.claude/rules/sample.md')), 'CRUD must not write generated');
});

test('docs create refreshes docs-index in same commit', () => {
  const r = createFile({
    vault,
    relPath: 'docs/specs/note.md',
    body: 'spec body',
    frontmatter: fm({ title: 'Note', type: 'spec' }),
  });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.equal(r.syncDryRun, undefined);
  assert.equal(r.indexRefreshed, true);
  assert.ok(existsSync(join(root, 'docs/generated/docs-index.json')));
  const idx = JSON.parse(readFileSync(join(root, 'docs/generated/docs-index.json'), 'utf8'));
  assert.ok(idx.docs.some((d) => d.path === 'docs/specs/note.md'));
  const show = git(['show', '--name-only', '--pretty=', 'HEAD']);
  assert.match(show, /docs\/specs\/note\.md/);
  assert.match(show, /docs\/generated\/docs-index\.json/);
});

test('merge memories → single commit', () => {
  createFile({
    vault,
    relPath: 'memory/a.md',
    body: 'A',
    frontmatter: fm({ title: 'A' }),
  });
  createFile({
    vault,
    relPath: 'memory/b.md',
    body: 'B',
    frontmatter: fm({ title: 'B' }),
  });
  const shaA = sha256(readFileSync(join(root, 'memory/a.md'), 'utf8'));
  const shaB = sha256(readFileSync(join(root, 'memory/b.md'), 'utf8'));
  const r = mergeFiles({
    vault,
    sources: ['memory/a.md', 'memory/b.md'],
    confirmSources: ['memory/a.md', 'memory/b.md'],
    confirmShas: { 'memory/a.md': shaA, 'memory/b.md': shaB },
    target: 'memory/merged.md',
    body: 'A+B',
    frontmatter: fm({ title: 'Merged' }),
  });
  assert.equal(r.ok, true, JSON.stringify(r.error));
  assert.ok(existsSync(join(root, 'memory/merged.md')));
  assert.ok(!existsSync(join(root, 'memory/a.md')));
  assert.ok(!existsSync(join(root, 'memory/b.md')));
  assert.match(git(['log', '-1', '--pretty=%s']), /merge/);
  assert.ok(r.syncDryRun);
});

test('merge commit failure leaves vault intact', () => {
  createFile({
    vault,
    relPath: 'memory/c.md',
    body: 'C',
    frontmatter: fm({ title: 'C' }),
  });
  createFile({
    vault,
    relPath: 'memory/d.md',
    body: 'D',
    frontmatter: fm({ title: 'D' }),
  });
  const beforeC = readFileSync(join(root, 'memory/c.md'), 'utf8');
  const beforeD = readFileSync(join(root, 'memory/d.md'), 'utf8');
  const shaC = sha256(beforeC);
  const shaD = sha256(beforeD);
  const headBefore = git(['rev-parse', 'HEAD']);
  const r = mergeFiles({
    vault,
    sources: ['memory/c.md', 'memory/d.md'],
    confirmSources: ['memory/c.md', 'memory/d.md'],
    confirmShas: { 'memory/c.md': shaC, 'memory/d.md': shaD },
    target: 'memory/fail-merge.md',
    body: 'fail',
    frontmatter: fm({ title: 'Fail' }),
    commitFn() {
      throw new Error('simulated commit failure');
    },
  });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'GIT_COMMIT');
  assert.equal(readFileSync(join(root, 'memory/c.md'), 'utf8'), beforeC);
  assert.equal(readFileSync(join(root, 'memory/d.md'), 'utf8'), beforeD);
  assert.ok(!existsSync(join(root, 'memory/fail-merge.md')));
  assert.equal(git(['rev-parse', 'HEAD']), headBefore);
});

test('reject create into generated', () => {
  const r = createFile({
    vault,
    relPath: '.claude/rules/evil.md',
    body: 'nope',
  });
  assert.equal(r.ok, false);
});

test('concurrent git lock → VAULT_BUSY (not GIT_COMMIT)', () => {
  const lock = join(root, '.git', 'index.lock');
  writeFileSync(lock, '');
  try {
    const r = createFile({ vault, relPath: 'memory/busy.md', body: 'x', frontmatter: fm() });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'VAULT_BUSY');
  } finally {
    rmSync(lock, { force: true });
  }
  // guard released → next write succeeds
  const ok = createFile({ vault, relPath: 'memory/after-busy.md', body: 'y', frontmatter: fm() });
  assert.equal(ok.ok, true);
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
try {
  rmSync(root, { recursive: true, force: true });
} catch {
  /* ignore */
}
process.exit(failed ? 1 : 0);
