/**
 * Studio vault gateway — Server Action boundary (JSON in / JSON out).
 * Contract: docs/specs/2026-07-18-studio-server-actions-contract.md
 *
 * Client sends vaultId only. Authorized vault stays in server scope.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  resolveVaultRoot,
  createFile,
  updateFile,
  deleteFile,
  mergeFiles,
  assertAllowedPath,
  fileContentSha,
  listWikilinkTargets,
} from './vault-crud.mjs';
import { syncAgentViews } from './agent-views.mjs';

const VAULT_ID_RE = /^[A-Za-z0-9._-]+$/;
const SHA256_RE = /^[a-f0-9]{64}$/i;

const CRUD_KEYS = new Set([
  'vaultId',
  'relPath',
  'body',
  'frontmatter',
  'confirmPath',
  'confirmSha',
  'sources',
  'confirmSources',
  'confirmShas',
  'target',
  'planTrailer',
]);

const SYNC_KEYS = new Set(['vaultId', 'planToken']);

function pluginRoot() {
  if (process.env.LUNA_PLUGIN_ROOT) return resolve(process.env.LUNA_PLUGIN_ROOT);
  const cwd = process.cwd();
  if (/[/\\]studio$/.test(cwd)) return resolve(cwd, '..');
  return resolve(cwd);
}

function rejectUnknownKeys(input, allowed) {
  for (const k of Object.keys(input || {})) {
    if (!allowed.has(k)) {
      return { code: 'UNKNOWN_KEY', message: `Unknown payload key: ${k}` };
    }
  }
  return null;
}

export function assertVaultId(vaultId) {
  if (typeof vaultId !== 'string' || !vaultId.trim()) {
    return { code: 'VAULT_ID', message: 'vaultId required' };
  }
  if (vaultId.length > 128 || !VAULT_ID_RE.test(vaultId)) {
    return { code: 'VAULT_ID', message: 'vaultId shape invalid' };
  }
  return null;
}

function openVault(vaultId, opts = {}) {
  return resolveVaultRoot(vaultId, {
    pluginRoot: opts.pluginRoot ?? pluginRoot(),
    registry: opts.registry,
  });
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function summarizeSyncResult(result) {
  const writes = (result.classified?.write || []).map((w) => ({
    path: w.path,
    kind: w.kind,
    source: w.source,
    desiredSha256: w.desired != null ? sha256Text(w.desired) : null,
  }));
  const conflicts = (result.classified?.conflicts || []).map((c) => ({
    path: c.path,
    reason: c.reason,
  }));
  const orphans = (result.orphans || []).map((o) => ({
    path: o.path,
    kind: o.kind,
  }));
  return {
    status: result.status,
    exitCode: result.exitCode,
    message: result.message,
    writes,
    conflicts,
    orphans,
    adopts: result.classified?.adopts?.length ?? 0,
    noop: result.classified?.noop?.length ?? 0,
  };
}

export function planTokenFromSummary(summary) {
  const canonical = JSON.stringify({
    writes: summary.writes,
    conflicts: summary.conflicts,
    status: summary.status,
  });
  return sha256Text(canonical);
}

function toSyncPreview(result) {
  const summary = summarizeSyncResult(result);
  return {
    ...summary,
    planToken: planTokenFromSummary(summary),
  };
}

function stripMutatorResult(result) {
  if (!result.ok) {
    return { ok: false, error: result.error || { code: 'ERROR', message: 'failed' } };
  }
  const out = {
    ok: true,
    relPath: result.relPath,
    commitSha: result.commitSha,
  };
  if (result.warnings?.length) out.warnings = result.warnings;
  if (result.indexRefreshed) out.indexRefreshed = true;
  if (result.deleted) out.deleted = result.deleted;
  if (result.syncDryRun) {
    out.syncPreview = toSyncPreview(result.syncDryRun);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} input
 * @param {{ pluginRoot?: string, registry?: object }} [ctx] — test overrides only
 */
export function vaultCreate(input, ctx = {}) {
  const bad = rejectUnknownKeys(input, CRUD_KEYS) || assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    const vault = openVault(String(input.vaultId), ctx);
    return stripMutatorResult(
      createFile({
        vault,
        relPath: input.relPath,
        body: input.body,
        frontmatter: input.frontmatter,
        planTrailer: input.planTrailer,
      }),
    );
  } catch (e) {
    return {
      ok: false,
      error: { code: e.code || 'ERROR', message: e.message || String(e) },
    };
  }
}

export function vaultUpdate(input, ctx = {}) {
  const bad = rejectUnknownKeys(input, CRUD_KEYS) || assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    const vault = openVault(String(input.vaultId), ctx);
    return stripMutatorResult(
      updateFile({
        vault,
        relPath: input.relPath,
        body: input.body,
        frontmatter: input.frontmatter,
        planTrailer: input.planTrailer,
      }),
    );
  } catch (e) {
    return {
      ok: false,
      error: { code: e.code || 'ERROR', message: e.message || String(e) },
    };
  }
}

export function vaultDelete(input, ctx = {}) {
  const bad = rejectUnknownKeys(input, CRUD_KEYS) || assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  if (typeof input.confirmSha !== 'string' || !SHA256_RE.test(input.confirmSha)) {
    return {
      ok: false,
      error: { code: 'CONFIRM_SHA', message: 'confirmSha must be 64-char hex sha256' },
    };
  }
  try {
    const vault = openVault(String(input.vaultId), ctx);
    return stripMutatorResult(
      deleteFile({
        vault,
        relPath: input.relPath,
        confirmPath: input.confirmPath,
        confirmSha: input.confirmSha,
        planTrailer: input.planTrailer,
      }),
    );
  } catch (e) {
    return {
      ok: false,
      error: { code: e.code || 'ERROR', message: e.message || String(e) },
    };
  }
}

export function vaultMerge(input, ctx = {}) {
  const bad = rejectUnknownKeys(input, CRUD_KEYS) || assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    const vault = openVault(String(input.vaultId), ctx);
    return stripMutatorResult(
      mergeFiles({
        vault,
        sources: input.sources,
        confirmSources: input.confirmSources,
        confirmShas: input.confirmShas,
        target: input.target,
        body: input.body,
        frontmatter: input.frontmatter,
        planTrailer: input.planTrailer,
      }),
    );
  } catch (e) {
    return {
      ok: false,
      error: { code: e.code || 'ERROR', message: e.message || String(e) },
    };
  }
}

export function vaultReadSha(input, ctx = {}) {
  const allowed = new Set(['vaultId', 'relPath']);
  const bad = rejectUnknownKeys(input, allowed) || assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    const vault = openVault(String(input.vaultId), ctx);
    const located = assertAllowedPath(vault.root, input.relPath);
    if (!existsSync(located.absPath)) {
      return { ok: false, error: { code: 'MISSING', message: `Not found: ${located.relPath}` } };
    }
    return {
      ok: true,
      relPath: located.relPath,
      confirmSha: fileContentSha(located.absPath),
      bytes: readFileSync(located.absPath, 'utf8').length,
    };
  } catch (e) {
    return {
      ok: false,
      error: { code: e.code || 'ERROR', message: e.message || String(e) },
    };
  }
}

export function vaultWikilinks(input, ctx = {}) {
  const allowed = new Set(['vaultId']);
  const bad = rejectUnknownKeys(input, allowed) || assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    const vault = openVault(String(input.vaultId), ctx);
    return { ok: true, targets: listWikilinkTargets(vault) };
  } catch (e) {
    return {
      ok: false,
      error: { code: e.code || 'ERROR', message: e.message || String(e) },
    };
  }
}

export function vaultSyncPreview(input, ctx = {}) {
  const bad = rejectUnknownKeys(input, SYNC_KEYS) || assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    const vault = openVault(String(input.vaultId), ctx);
    const result = syncAgentViews(vault.root, { dryRun: true });
    return { ok: true, ...toSyncPreview(result) };
  } catch (e) {
    return {
      ok: false,
      error: { code: e.code || 'ERROR', message: e.message || String(e) },
    };
  }
}

/**
 * Re-validate dry-run + planToken, refuse conflicts, then apply.
 * No force / clobber bypass exists on this path.
 */
export function vaultSyncApply(input, ctx = {}) {
  const bad = rejectUnknownKeys(input, SYNC_KEYS) || assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  if (typeof input.planToken !== 'string' || !SHA256_RE.test(input.planToken)) {
    return {
      ok: false,
      error: { code: 'PLAN_TOKEN', message: 'planToken required (from vaultSyncPreview)' },
    };
  }
  try {
    const vault = openVault(String(input.vaultId), ctx);
    const dry = syncAgentViews(vault.root, { dryRun: true });
    const preview = toSyncPreview(dry);

    if (preview.planToken !== input.planToken) {
      return {
        ok: false,
        error: {
          code: 'PLAN_STALE',
          message: 'Working tree changed since preview — run vaultSyncPreview again',
        },
      };
    }

    if (dry.status === 'conflict' || (dry.classified?.conflicts?.length ?? 0) > 0) {
      return {
        ok: false,
        error: {
          code: 'SYNC_CONFLICT',
          message: dry.message || 'Sync conflicts — refuse apply (no clobber)',
          conflicts: preview.conflicts,
        },
      };
    }

    const applied = syncAgentViews(vault.root, { dryRun: false });
    if (applied.status === 'conflict') {
      return {
        ok: false,
        error: {
          code: 'SYNC_CONFLICT',
          message: applied.message || 'Conflict on apply',
        },
      };
    }

    return { ok: true, ...summarizeSyncResult(applied) };
  } catch (e) {
    return {
      ok: false,
      error: { code: e.code || 'ERROR', message: e.message || String(e) },
    };
  }
}
