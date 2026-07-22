/**
 * Studio vault gateway — Server Action boundary (JSON in / JSON out).
 * Contract: docs/specs/2026-07-18-studio-server-actions-contract.md
 *
 * Client sends vaultId only. Authorized vault stays in server scope.
 * T6: per-vault mutex, error normalization, body-size cap, ctx env-gate.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import {
  resolveVaultRoot,
  createFile,
  updateFile,
  deleteFile,
  mergeFiles,
  assertAllowedPath,
  fileContentSha,
  listWikilinkTargets,
  listAllowedVaults,
  ALLOWED_PREFIXES,
} from './vault-crud.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { syncAgentViews } from './agent-views.mjs';
import { loadRegistry } from './luna-registry.mjs';
import { planLifecycleMove, applyLifecycleMove } from './doc-lifecycle.mjs';
import { buildReport } from './knowledge-dedupe.mjs';
import {
  rebuildGraphMemory,
  invokeGraphMemoryTool,
} from './graph-memory.mjs';
import {
  buildContextPack,
  previewContextPack,
  detectPackDrift,
  PACK_TYPES,
} from './context-pack.mjs';
import {
  listCorrectionCandidates,
  acceptCorrection,
  rejectCorrection,
} from './correction-inbox.mjs';

const VAULT_ID_RE = /^[A-Za-z0-9._-]+$/;
const SHA256_RE = /^[a-f0-9]{64}$/i;
export const MAX_BODY_BYTES = 512 * 1024;

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

const SYNC_KEYS = new Set(['vaultId', 'planToken', 'mode', 'adoptUnmarked']);
const SYNC_MANY_KEYS = new Set(['vaultIds', 'mode', 'adoptUnmarked']);
const SYNC_APPLY_MANY_KEYS = new Set(['targets', 'mode', 'adoptUnmarked']); // [{ vaultId, planToken }]
const LIFECYCLE_KEYS = new Set([
  'vaultId',
  'relPath',
  'op',
  'supersededBy',
  'destSubdir',
  'planToken',
]);
const DEDUPE_KEYS = new Set(['vaultId', 'scopeMode']);
const GRAPH_MEMORY_KEYS = new Set([
  'vaultId',
  'query',
  'id',
  'source_path',
  'limit',
  'tool',
  'rebuild',
]);
const CONTEXT_PACK_KEYS = new Set([
  'vaultId',
  'task',
  'packType',
  'tokenBudget',
  'scope',
]);
const CONTEXT_PACK_DRIFT_KEYS = new Set(['vaultId', 'manifest']);
const CORRECTION_LIST_KEYS = new Set(['vaultId', 'pendingFile']);
const CORRECTION_ACCEPT_KEYS = new Set([
  'vaultId',
  'candidateId',
  'what_claude_did',
  'implied_preference',
  'applies_to',
]);
const CORRECTION_REJECT_KEYS = new Set(['vaultId', 'candidateId']);

/** @type {Set<string>} */
const vaultLocks = new Set();

function pluginRoot() {
  if (process.env.LUNA_PLUGIN_ROOT) return resolve(process.env.LUNA_PLUGIN_ROOT);
  const cwd = process.cwd();
  if (/[/\\]studio$/.test(cwd)) return resolve(cwd, '..');
  return resolve(cwd);
}

/**
 * Test/hermetic overrides (`pluginRoot`, `registry`) require LUNA_VAULT_GATEWAY_TEST=1.
 * Production Server Actions must never pass ctx.
 */
export function assertCtxAllowed(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  const keys = Object.keys(ctx).filter((k) => ctx[k] !== undefined);
  if (!keys.length) return null;
  if (process.env.LUNA_VAULT_GATEWAY_TEST === '1') return null;
  return {
    code: 'CTX_FORBIDDEN',
    message: 'ctx overrides require LUNA_VAULT_GATEWAY_TEST=1',
  };
}

export function normalizeError(e, fallbackCode = 'ERROR') {
  const code = e?.code || fallbackCode;
  let message = String(e?.stderr || e?.message || e || 'error');
  message = message.replace(/\/(?:home|Users|private|tmp|var|opt)\/[^\s"'`]+/gi, '<path>');
  message = message.replace(/[A-Za-z]:\\[^\s"'`]+/g, '<path>');
  message = message.replace(/\n+/g, ' ').trim();
  if (message.length > 400) message = `${message.slice(0, 400)}…`;
  return { code, message };
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

export function assertBodySize(body) {
  if (body == null) return null;
  const n = Buffer.byteLength(String(body), 'utf8');
  if (n > MAX_BODY_BYTES) {
    return {
      code: 'BODY_TOO_LARGE',
      message: `body exceeds ${MAX_BODY_BYTES} bytes`,
      bytes: n,
    };
  }
  return null;
}

/**
 * In-process fast-path guard against re-entrant/interleaved mutations of one
 * vault. NOTE: mutators are synchronous, so within a single process the event
 * loop already serializes them; the authoritative cross-process guard is git's
 * own `.git/index.lock`, surfaced as `VAULT_BUSY` by commitPaths (vault-crud).
 */
function withVaultLock(vaultId, fn) {
  if (vaultLocks.has(vaultId)) {
    return {
      ok: false,
      error: { code: 'VAULT_BUSY', message: 'Another mutation is in progress for this vault' },
    };
  }
  vaultLocks.add(vaultId);
  try {
    return fn();
  } finally {
    vaultLocks.delete(vaultId);
  }
}

function openVault(vaultId, opts = {}) {
  return resolveVaultRoot(vaultId, {
    pluginRoot: opts.pluginRoot ?? pluginRoot(),
    registry: opts.registry,
  });
}

/**
 * Sync options for local vs fleet mode.
 * Fleet MUST re-derive from pluginRoot/rules (same source as preview) — TOCTOU pin.
 */
export function syncOptsForVault(vault, input = {}, ctx = {}) {
  const mode = input.mode === 'fleet' ? 'fleet' : 'local';
  const adoptUnmarked = Boolean(input.adoptUnmarked);
  if (mode === 'fleet') {
    const plugin = resolve(ctx.pluginRoot ?? pluginRoot());
    return {
      mode,
      rulesSourceDir: join(plugin, 'rules'),
      memorySourceDir: join(vault.root, 'memory'),
      origin: 'plugin',
      adoptUnmarked,
    };
  }
  return { mode, adoptUnmarked };
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
    const err = result.error || { code: 'ERROR', message: 'failed' };
    return {
      ok: false,
      error: normalizeError(
        { code: err.code, message: err.message || JSON.stringify(err) },
        err.code || 'ERROR',
      ),
    };
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

function gate(input, allowed, ctx) {
  const ctxErr = assertCtxAllowed(ctx);
  if (ctxErr) return { ok: false, error: ctxErr };
  const unk = rejectUnknownKeys(input, allowed);
  if (unk) return { ok: false, error: unk };
  return null;
}

/**
 * @param {Record<string, unknown>} input
 * @param {{ pluginRoot?: string, registry?: object }} [ctx] — test overrides only
 */
export function vaultCreate(input, ctx = {}) {
  const g = gate(input, CRUD_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId) || assertBodySize(input.body);
  if (bad) return { ok: false, error: bad };
  const vaultId = String(input.vaultId);
  return withVaultLock(vaultId, () => {
    try {
      const vault = openVault(vaultId, ctx);
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
      return { ok: false, error: normalizeError(e) };
    }
  });
}

export function vaultUpdate(input, ctx = {}) {
  const g = gate(input, CRUD_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId) || assertBodySize(input.body);
  if (bad) return { ok: false, error: bad };
  const vaultId = String(input.vaultId);
  return withVaultLock(vaultId, () => {
    try {
      const vault = openVault(vaultId, ctx);
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
      return { ok: false, error: normalizeError(e) };
    }
  });
}

export function vaultDelete(input, ctx = {}) {
  const g = gate(input, CRUD_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  if (typeof input.confirmSha !== 'string' || !SHA256_RE.test(input.confirmSha)) {
    return {
      ok: false,
      error: { code: 'CONFIRM_SHA', message: 'confirmSha must be 64-char hex sha256' },
    };
  }
  const vaultId = String(input.vaultId);
  return withVaultLock(vaultId, () => {
    try {
      const vault = openVault(vaultId, ctx);
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
      return { ok: false, error: normalizeError(e) };
    }
  });
}

export function vaultMerge(input, ctx = {}) {
  const g = gate(input, CRUD_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId) || assertBodySize(input.body);
  if (bad) return { ok: false, error: bad };
  const vaultId = String(input.vaultId);
  return withVaultLock(vaultId, () => {
    try {
      const vault = openVault(vaultId, ctx);
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
      return { ok: false, error: normalizeError(e) };
    }
  });
}

export function vaultReadSha(input, ctx = {}) {
  const allowed = new Set(['vaultId', 'relPath']);
  const g = gate(input, allowed, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
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
    return { ok: false, error: normalizeError(e) };
  }
}

/** Read canonical file for editor (body + frontmatter + confirmSha). */
export function vaultRead(input, ctx = {}) {
  const allowed = new Set(['vaultId', 'relPath']);
  const g = gate(input, allowed, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    const vault = openVault(String(input.vaultId), ctx);
    const located = assertAllowedPath(vault.root, input.relPath);
    if (!existsSync(located.absPath)) {
      return { ok: false, error: { code: 'MISSING', message: `Not found: ${located.relPath}` } };
    }
    const text = readFileSync(located.absPath, 'utf8');
    const { data, body, hasFm } = parseFrontmatter(text);
    return {
      ok: true,
      relPath: located.relPath,
      confirmSha: sha256Text(text),
      hasFrontmatter: hasFm,
      frontmatter: data || {},
      body,
      bytes: Buffer.byteLength(text, 'utf8'),
    };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/** List editable relative paths under allowed prefixes (docs recurse into buckets). */
export function vaultList(input, ctx = {}) {
  const allowed = new Set(['vaultId']);
  const g = gate(input, allowed, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };

  function walkMd(absDir, relPrefix, out) {
    if (!existsSync(absDir)) return;
    for (const ent of readdirSync(absDir, { withFileTypes: true })) {
      if (ent.name === 'generated' || ent.name.startsWith('.')) continue;
      const rel = `${relPrefix}${ent.name}`;
      const abs = join(absDir, ent.name);
      if (ent.isDirectory()) {
        walkMd(abs, `${rel}/`, out);
      } else if (ent.name.endsWith('.md') && !ent.name.endsWith('.local.md')) {
        out.push(rel);
      }
    }
  }

  try {
    const vault = openVault(String(input.vaultId), ctx);
    const groups = { rules: [], memory: [], docs: [] };
    for (const prefix of ALLOWED_PREFIXES) {
      const dir = join(vault.root, prefix.replace(/\/$/, ''));
      const bucket = [];
      walkMd(dir, prefix, bucket);
      for (const rel of bucket) {
        if (prefix.startsWith('rules/')) groups.rules.push(rel);
        else if (prefix.startsWith('memory/')) groups.memory.push(rel);
        else groups.docs.push(rel);
      }
    }
    for (const k of Object.keys(groups)) groups[k].sort();
    return { ok: true, ...groups };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

export function vaultWikilinks(input, ctx = {}) {
  const allowed = new Set(['vaultId']);
  const g = gate(input, allowed, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    const vault = openVault(String(input.vaultId), ctx);
    return { ok: true, targets: listWikilinkTargets(vault) };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

export function vaultSyncPreview(input, ctx = {}) {
  const g = gate(input, SYNC_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    const vault = openVault(String(input.vaultId), ctx);
    const syncOpts = syncOptsForVault(vault, input, ctx);
    const result = syncAgentViews(vault.root, { dryRun: true, ...syncOpts });
    return {
      ok: true,
      vaultId: String(input.vaultId),
      mode: syncOpts.mode,
      ...toSyncPreview(result),
    };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/**
 * Fleet-shaped preview: one dry-run per vaultId.
 * mode:'fleet' re-derives each target from plugin rules/ (not the target's rules/).
 */
export function vaultSyncPreviewMany(input, ctx = {}) {
  const g = gate(input, SYNC_MANY_KEYS, ctx);
  if (g) return g;
  const ids = Array.isArray(input.vaultIds) ? input.vaultIds : [];
  if (!ids.length) {
    return { ok: false, error: { code: 'VAULT_IDS', message: 'vaultIds required' } };
  }
  if (ids.length > 64) {
    return { ok: false, error: { code: 'VAULT_IDS', message: 'vaultIds capped at 64' } };
  }
  const results = [];
  for (const id of ids) {
    const one = vaultSyncPreview(
      { vaultId: id, mode: input.mode, adoptUnmarked: input.adoptUnmarked },
      ctx,
    );
    results.push(one.ok ? one : { ok: false, vaultId: id, error: one.error });
  }
  return { ok: true, mode: input.mode === 'fleet' ? 'fleet' : 'local', results };
}

export function vaultSyncApply(input, ctx = {}) {
  const g = gate(input, SYNC_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  if (typeof input.planToken !== 'string' || !SHA256_RE.test(input.planToken)) {
    return {
      ok: false,
      error: { code: 'PLAN_TOKEN', message: 'planToken required (from vaultSyncPreview)' },
    };
  }
  const vaultId = String(input.vaultId);
  return withVaultLock(vaultId, () => {
    try {
      const vault = openVault(vaultId, ctx);
      // Source-aware re-derivation (must match preview mode/rulesSourceDir)
      const syncOpts = syncOptsForVault(vault, input, ctx);
      const dry = syncAgentViews(vault.root, { dryRun: true, ...syncOpts });
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
            message: 'Sync conflicts — refuse apply (no clobber)',
            conflicts: preview.conflicts,
          },
        };
      }

      const applied = syncAgentViews(vault.root, { dryRun: false, ...syncOpts });
      if (applied.status === 'conflict') {
        return {
          ok: false,
          error: {
            code: 'SYNC_CONFLICT',
            message: 'Conflict on apply',
          },
        };
      }

      return {
        ok: true,
        vaultId,
        mode: syncOpts.mode,
        changedPaths: applied.changedPaths || [],
        ...summarizeSyncResult(applied),
      };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  });
}

/** Apply per-target planTokens (fleet UI). Continues on per-target failure. */
export function vaultSyncApplyMany(input, ctx = {}) {
  const g = gate(input, SYNC_APPLY_MANY_KEYS, ctx);
  if (g) return g;
  const targets = Array.isArray(input.targets) ? input.targets : [];
  if (!targets.length) {
    return { ok: false, error: { code: 'TARGETS', message: 'targets required' } };
  }
  const results = [];
  for (const t of targets) {
    const one = vaultSyncApply(
      {
        vaultId: t.vaultId,
        planToken: t.planToken,
        mode: input.mode,
        adoptUnmarked: input.adoptUnmarked,
      },
      ctx,
    );
    results.push({ vaultId: t.vaultId, ...one });
  }
  const allOk = results.every((r) => r.ok);
  return { ok: allOk, mode: input.mode === 'fleet' ? 'fleet' : 'local', results };
}

/** Registry + plugin ids for fleet target picker (server-rendered). Realpath wall. */
export function listSyncTargets(ctx = {}) {
  const ctxErr = assertCtxAllowed(ctx);
  if (ctxErr) return { ok: false, error: ctxErr };
  try {
    const allowed = listAllowedVaults({
      pluginRoot: ctx.pluginRoot ?? pluginRoot(),
      registry: ctx.registry || loadRegistry(),
    });
    const targets = allowed.map((t) => ({
      id: t.id,
      source: t.source,
      pathLabel: t.source === 'plugin' ? '<plugin>' : '<registry>',
    }));
    return { ok: true, targets };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/**
 * Preview a lifecycle promote/demote/supersede (no writes).
 * Returns planToken for apply TOCTOU.
 */
export function vaultLifecyclePreview(input, ctx = {}) {
  const g = gate(input, LIFECYCLE_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  const op = String(input.op || '');
  if (!['promote', 'demote', 'supersede'].includes(op)) {
    return { ok: false, error: { code: 'OP', message: 'op must be promote|demote|supersede' } };
  }
  if (typeof input.relPath !== 'string' || !input.relPath.trim()) {
    return { ok: false, error: { code: 'REL_PATH', message: 'relPath required' } };
  }
  try {
    const vault = openVault(String(input.vaultId), ctx);
    const planned = planLifecycleMove({
      vault,
      relPath: input.relPath,
      op,
      supersededBy: input.supersededBy,
      destSubdir: input.destSubdir,
    });
    if (!planned.ok) {
      return {
        ok: false,
        error: normalizeError(
          { code: planned.error?.code, message: planned.error?.message || 'plan failed' },
          planned.error?.code || 'ERROR',
        ),
      };
    }
    return {
      ok: true,
      vaultId: String(input.vaultId),
      op,
      src: planned.plan.src,
      dest: planned.plan.dest,
      tagOnly: planned.plan.tagOnly,
      nextFm: planned.plan.nextFm,
      planToken: planned.planToken,
    };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/** Apply a previously previewed lifecycle move (planToken required). */
export function vaultLifecycleApply(input, ctx = {}) {
  const g = gate(input, LIFECYCLE_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  if (typeof input.planToken !== 'string' || !SHA256_RE.test(input.planToken)) {
    return {
      ok: false,
      error: { code: 'PLAN_TOKEN', message: 'planToken required (from vaultLifecyclePreview)' },
    };
  }
  const op = String(input.op || '');
  if (!['promote', 'demote', 'supersede'].includes(op)) {
    return { ok: false, error: { code: 'OP', message: 'op must be promote|demote|supersede' } };
  }
  const vaultId = String(input.vaultId);
  return withVaultLock(vaultId, () => {
    try {
      const vault = openVault(vaultId, ctx);
      const planned = planLifecycleMove({
        vault,
        relPath: input.relPath,
        op,
        supersededBy: input.supersededBy,
        destSubdir: input.destSubdir,
      });
      if (!planned.ok) {
        return {
          ok: false,
          error: normalizeError(
            { code: planned.error?.code, message: planned.error?.message || 'plan failed' },
            planned.error?.code || 'ERROR',
          ),
        };
      }
      if (planned.planToken !== input.planToken) {
        return {
          ok: false,
          error: {
            code: 'PLAN_STALE',
            message: 'Working tree changed since preview — run vaultLifecyclePreview again',
          },
        };
      }
      const applied = applyLifecycleMove({
        vault,
        plan: planned.plan,
        planToken: input.planToken,
      });
      if (!applied.ok) {
        return {
          ok: false,
          error: normalizeError(
            { code: applied.error?.code, message: applied.error?.message || 'apply failed' },
            applied.error?.code || 'ERROR',
          ),
        };
      }
      return {
        ok: true,
        vaultId,
        relPath: applied.relPath,
        src: applied.src,
        dest: applied.dest,
        commitSha: applied.commitSha,
        indexRefreshed: applied.indexRefreshed,
      };
    } catch (e) {
      return { ok: false, error: normalizeError(e) };
    }
  });
}

/**
 * Read-only knowledge overlap report (lexical keyword pass).
 * Contract: docs/specs/2026-07-19-dedupe-assistant-contract.md
 */
export function vaultDedupeReport(input, ctx = {}) {
  const g = gate(input, DEDUPE_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };

  const scopeMode = input.scopeMode == null ? 'vault' : String(input.scopeMode);
  if (!['vault', 'vault+plugin', 'registry'].includes(scopeMode)) {
    return {
      ok: false,
      error: { code: 'SCOPE_INVALID', message: 'scopeMode must be vault|vault+plugin|registry' },
    };
  }

  try {
    // Authorize vaultId against allow-list (even though we read plugin knowledge.json).
    openVault(String(input.vaultId), ctx);
    const plugin = resolve(ctx.pluginRoot ?? pluginRoot());
    const knowledgePath = join(plugin, 'docs/generated/knowledge.json');
    if (!existsSync(knowledgePath)) {
      return {
        ok: false,
        error: {
          code: 'KNOWLEDGE_MISSING',
          message: 'knowledge.json missing — run: node scripts/build-knowledge.mjs',
        },
      };
    }
    const knowledge = JSON.parse(readFileSync(knowledgePath, 'utf8'));
    const items = Array.isArray(knowledge.items) ? knowledge.items : [];
    const pluginProjectId =
      (knowledge.projects || []).find((p) => p.scope_role?.includes('plugin'))?.id ||
      basename(plugin);

    const report = buildReport(items, {
      scope: { mode: scopeMode, vaultId: String(input.vaultId) },
      pluginProjectId,
    });
    return { ok: true, vaultId: String(input.vaultId), report };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/**
 * Read-only graph-memory status / search (Phase 3).
 * Contract: docs/specs/2026-07-19-graph-memory-backend-contract.md
 */
export function vaultGraphMemoryStatus(input, ctx = {}) {
  const g = gate(input, new Set(['vaultId']), ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    const out = invokeGraphMemoryTool(
      'graph_memory_status',
      { vaultId: String(input.vaultId) },
      { pluginRoot: ctx.pluginRoot ?? pluginRoot(), registry: ctx.registry },
    );
    return out;
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

export function vaultGraphMemorySearch(input, ctx = {}) {
  const g = gate(input, new Set(['vaultId', 'query', 'limit']), ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    return invokeGraphMemoryTool(
      'search_context',
      {
        vaultId: String(input.vaultId),
        query: String(input.query || ''),
        limit: input.limit,
      },
      { pluginRoot: ctx.pluginRoot ?? pluginRoot(), registry: ctx.registry },
    );
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/**
 * Optional rebuild (index write only under docs/generated/graph-memory — never canonical markdown).
 */
export async function vaultGraphMemoryRebuild(input, ctx = {}) {
  const g = gate(input, new Set(['vaultId']), ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    openVault(String(input.vaultId), ctx);
    const result = await rebuildGraphMemory({
      vaultId: String(input.vaultId),
      pluginRoot: ctx.pluginRoot ?? pluginRoot(),
      registry: ctx.registry,
    });
    return {
      ok: true,
      vaultId: result.vaultId,
      status: result.index.status,
      sources: result.index.sources.length,
      chunks: result.index.chunks.length,
    };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/** Generic read-only tool dispatch (rejects mutation names). */
export function vaultGraphMemoryTool(input, ctx = {}) {
  const g = gate(input, GRAPH_MEMORY_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  const tool = String(input.tool || '');
  try {
    return invokeGraphMemoryTool(
      tool,
      {
        vaultId: String(input.vaultId),
        query: input.query,
        id: input.id,
        source_path: input.source_path,
        limit: input.limit,
      },
      { pluginRoot: ctx.pluginRoot ?? pluginRoot(), registry: ctx.registry },
    );
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/**
 * Context Pack preview/build (Phase 4.1).
 * Read-only w.r.t. canonical sources; build writes only gitignored pack index.
 * Contract: docs/specs/2026-07-20-context-pack-contract.md
 */
export async function vaultContextPackPreview(input, ctx = {}) {
  const g = gate(input, CONTEXT_PACK_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    openVault(String(input.vaultId), ctx);
    const packType = String(input.packType || 'planning');
    if (!PACK_TYPES.includes(packType)) {
      return { ok: false, error: { code: 'PACK_TYPE', message: `Invalid packType: ${packType}` } };
    }
    const result = await previewContextPack({
      vaultId: String(input.vaultId),
      task: String(input.task || ''),
      packType,
      tokenBudget: Number(input.tokenBudget || 4000),
      scope: String(input.scope || 'vault'),
      pluginRoot: ctx.pluginRoot ?? pluginRoot(),
      registry: ctx.registry,
    });
    return { ok: true, vaultId: result.vaultId, manifest: result.manifest };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

export async function vaultContextPackBuild(input, ctx = {}) {
  const g = gate(input, CONTEXT_PACK_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    openVault(String(input.vaultId), ctx);
    const packType = String(input.packType || 'planning');
    if (!PACK_TYPES.includes(packType)) {
      return { ok: false, error: { code: 'PACK_TYPE', message: `Invalid packType: ${packType}` } };
    }
    const result = await buildContextPack({
      vaultId: String(input.vaultId),
      task: String(input.task || ''),
      packType,
      tokenBudget: Number(input.tokenBudget || 4000),
      scope: String(input.scope || 'vault'),
      pluginRoot: ctx.pluginRoot ?? pluginRoot(),
      registry: ctx.registry,
    });
    return {
      ok: true,
      vaultId: result.vaultId,
      manifest: result.manifest,
      packId: result.manifest?.pack_id,
    };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/**
 * Drift detection only — no writes. Manifest must match vaultId.
 */
export function vaultContextPackDrift(input, ctx = {}) {
  const g = gate(input, CONTEXT_PACK_DRIFT_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    openVault(String(input.vaultId), ctx);
    const manifest = input.manifest;
    if (!manifest || typeof manifest !== 'object') {
      return { ok: false, error: { code: 'MANIFEST', message: 'manifest object required' } };
    }
    if (manifest.vault_id && String(manifest.vault_id) !== String(input.vaultId)) {
      return {
        ok: false,
        error: { code: 'VAULT_MISMATCH', message: 'manifest.vault_id does not match vaultId' },
      };
    }
    const result = detectPackDrift(
      { ...manifest, vault_id: String(input.vaultId) },
      { pluginRoot: ctx.pluginRoot ?? pluginRoot(), registry: ctx.registry },
    );
    return { ok: true, vaultId: String(input.vaultId), ...result };
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/**
 * Correction inbox — list candidates (read-only).
 */
export function vaultCorrectionCandidates(input, ctx = {}) {
  const g = gate(input, CORRECTION_LIST_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    openVault(String(input.vaultId), ctx);
    const out = listCorrectionCandidates({
      vaultId: String(input.vaultId),
      pluginRoot: ctx.pluginRoot ?? pluginRoot(),
      registry: ctx.registry,
      pendingFile: input.pendingFile ? String(input.pendingFile) : undefined,
    });
    return out;
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/**
 * Correction inbox — accept a candidate. Sole Phase-4 canonical write:
 * appends one lesson line to lessons.md + lessons.mdc via the shared helper.
 * Never routes through vault-crud; never writes memory/native.
 */
export function vaultCorrectionAccept(input, ctx = {}) {
  const g = gate(input, CORRECTION_ACCEPT_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    openVault(String(input.vaultId), ctx);
    const out = acceptCorrection({
      vaultId: String(input.vaultId),
      candidateId: input.candidateId ? String(input.candidateId) : undefined,
      what_claude_did: String(input.what_claude_did || ''),
      implied_preference: String(input.implied_preference || ''),
      applies_to: input.applies_to === 'all_projects' ? 'all_projects' : 'this_project',
      pluginRoot: ctx.pluginRoot ?? pluginRoot(),
      registry: ctx.registry,
    });
    return out;
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

/**
 * Correction inbox — reject a candidate (no durable write).
 */
export function vaultCorrectionReject(input, ctx = {}) {
  const g = gate(input, CORRECTION_REJECT_KEYS, ctx);
  if (g) return g;
  const bad = assertVaultId(input.vaultId);
  if (bad) return { ok: false, error: bad };
  try {
    openVault(String(input.vaultId), ctx);
    const out = rejectCorrection({
      vaultId: String(input.vaultId),
      candidateId: input.candidateId ? String(input.candidateId) : undefined,
      pluginRoot: ctx.pluginRoot ?? pluginRoot(),
      registry: ctx.registry,
    });
    return out;
  } catch (e) {
    return { ok: false, error: normalizeError(e) };
  }
}

