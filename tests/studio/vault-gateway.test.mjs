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
  assertVaultId,
} from '../../scripts/lib/vault-gateway.mjs';
import { sha256 } from '../../scripts/lib/vault-crud.mjs';

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

console.log(failed ? `\n${failed} failed` : '\nall passed');
try {
  rmSync(root, { recursive: true, force: true });
} catch {
  /* ignore */
}
process.exit(failed ? 1 : 0);

void sha256;
