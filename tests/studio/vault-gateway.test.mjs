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
  assertVaultId,
  assertBodySize,
  assertCtxAllowed,
  normalizeError,
  MAX_BODY_BYTES,
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

console.log(failed ? `\n${failed} failed` : '\nall passed');
try {
  rmSync(root, { recursive: true, force: true });
} catch {
  /* ignore */
}
process.exit(failed ? 1 : 0);

void sha256;
