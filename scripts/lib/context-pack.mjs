/**
 * Context Pack builder — read-only manifest over graph-memory lanes.
 * Contract: docs/specs/2026-07-20-context-pack-contract.md (Phase 4.1 / S1a)
 *
 * Reuses resolveVaultRoot / invokeGraphMemoryTool — no second retriever or wall.
 * Writes only under docs/generated/context-packs/ (gitignored rebuildable index).
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { resolveVaultRoot } from './vault-crud.mjs';
import {
  invokeGraphMemoryTool,
  rebuildGraphMemory,
  embedQuery,
  sha256Text,
} from './graph-memory.mjs';
import { parseFrontmatter } from './frontmatter.mjs';

export const PACK_DIR_REL = join('docs', 'generated', 'context-packs');
export const PACK_TYPES = Object.freeze(['planning', 'implementation', 'review']);

/** @type {Record<string, Record<string, number>>} */
const TYPE_KIND_BOOST = {
  planning: {
    architecture: 0.35,
    spec: 0.3,
    decision: 0.3,
    plan: 0.15,
    lesson: 0.1,
    memory: -0.15,
  },
  implementation: {
    plan: 0.35,
    lesson: 0.25,
    rule: 0.2,
    spec: 0.15,
    architecture: 0.1,
    memory: -0.05,
  },
  review: {
    lesson: 0.35,
    spec: 0.2,
    plan: 0.15,
    decision: 0.15,
    architecture: 0.1,
    memory: -0.1,
  },
};

/**
 * Rough token estimate (chars/4) — good enough for budget truncation.
 * @param {string} text
 */
export function estimateTokens(text) {
  const n = String(text || '').length;
  return Math.max(1, Math.ceil(n / 4));
}

/**
 * @param {string} vaultRoot
 */
export function wipeContextPacks(vaultRoot) {
  const dir = join(vaultRoot, PACK_DIR_REL);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

/**
 * @param {string} packType
 */
function assertPackType(packType) {
  if (!PACK_TYPES.includes(packType)) {
    const err = new Error(`Invalid packType: ${packType} (expected ${PACK_TYPES.join('|')})`);
    err.code = 'PACK_TYPE';
    throw err;
  }
}

/**
 * @param {object} hit
 * @param {string} packType
 */
function applyTypeBoost(hit, packType) {
  const boosts = TYPE_KIND_BOOST[packType] || {};
  const kind = String(hit.source_kind || '');
  const boost = boosts[kind] || 0;
  const score = Number(hit.score || 0) + boost;
  const why = [...(hit.why || [])];
  if (boost) why.push({ lane: 'pack_type', score: Number(boost.toFixed(4)), pack_type: packType });
  return { ...hit, score: Number(score.toFixed(4)), why };
}

/**
 * Prefer higher score; one item per source_path.
 * @param {object[]} hits
 */
function fuseBySource(hits) {
  /** @type {Map<string, object>} */
  const best = new Map();
  for (const h of hits) {
    const key = String(h.source_path || '');
    if (!key) continue;
    const prev = best.get(key);
    if (!prev || h.score > prev.score) best.set(key, h);
  }
  return [...best.values()].sort(
    (a, b) => b.score - a.score || String(a.source_path).localeCompare(String(b.source_path)),
  );
}

/**
 * @param {object[]} items
 * @param {number} tokenBudget
 */
function truncateToBudget(items, tokenBudget) {
  const budget = Math.max(0, Number(tokenBudget) || 0);
  const kept = [];
  const dropped = [];
  let used = 0;
  for (const item of items) {
    const est = item.token_estimate ?? estimateTokens(`${item.title || ''}\n${item.excerpt || ''}`);
    const next = { ...item, token_estimate: est };
    if (used + est <= budget) {
      kept.push(next);
      used += est;
    } else {
      dropped.push(next.chunk_id || next.source_path);
    }
  }
  return {
    items: kept,
    truncated: dropped.length > 0,
    dropped_item_ids: dropped,
    tokens_used: used,
  };
}

/**
 * Ensure index exists (fail-open rebuild lexical-only if missing).
 */
async function ensureIndex(vaultId, ctx) {
  try {
    return invokeGraphMemoryTool(
      'graph_memory_status',
      { vaultId },
      { pluginRoot: ctx.pluginRoot, registry: ctx.registry },
    );
  } catch (e) {
    if (e && e.code === 'INDEX_MISSING') {
      await rebuildGraphMemory({
        vaultId,
        pluginRoot: ctx.pluginRoot,
        registry: ctx.registry,
        embed: false,
      });
      return invokeGraphMemoryTool(
        'graph_memory_status',
        { vaultId },
        { pluginRoot: ctx.pluginRoot, registry: ctx.registry },
      );
    }
    // status with missing index returns ok + mode missing — handle below
    throw e;
  }
}

/**
 * @param {object} opts
 * @param {boolean} [opts.write]
 */
async function assemblePack(opts) {
  const vaultId = String(opts.vaultId || '');
  if (!vaultId) {
    const err = new Error('vaultId required');
    err.code = 'VAULT_ID';
    throw err;
  }
  const packType = String(opts.packType || '');
  assertPackType(packType);
  const task = String(opts.task || '').trim();
  if (!task) {
    const err = new Error('task required');
    err.code = 'TASK';
    throw err;
  }
  const tokenBudget = Number(opts.tokenBudget);
  if (!Number.isFinite(tokenBudget) || tokenBudget <= 0) {
    const err = new Error('tokenBudget must be a positive number');
    err.code = 'TOKEN_BUDGET';
    throw err;
  }
  const scope = opts.scope || 'vault';
  if (!['vault', 'vault+plugin', 'registry'].includes(scope)) {
    const err = new Error(`Invalid scope: ${scope}`);
    err.code = 'SCOPE';
    throw err;
  }

  const vault = resolveVaultRoot(vaultId, {
    pluginRoot: opts.pluginRoot,
    registry: opts.registry,
  });

  const ctx = { pluginRoot: opts.pluginRoot, registry: opts.registry };

  let statusOut = await ensureIndex(vaultId, ctx);
  if (statusOut?.status?.mode === 'missing') {
    await rebuildGraphMemory({
      vaultId,
      pluginRoot: opts.pluginRoot,
      registry: opts.registry,
      embed: false,
    });
    statusOut = invokeGraphMemoryTool(
      'graph_memory_status',
      { vaultId },
      ctx,
    );
  }

  const gmStatus = statusOut?.status || {};
  /** @type {Record<string, string>} */
  const lanes = {
    lexical: 'ok',
    embedding: 'unavailable',
    kg: 'unavailable',
    gitnexus: 'unavailable',
    dedupe: 'unavailable',
  };

  if (gmStatus.embeddings === 'ok') lanes.embedding = 'ok';
  else if (gmStatus.embeddings === 'partial') lanes.embedding = 'degraded';
  else if (gmStatus.embeddings === 'skipped') lanes.embedding = 'skipped';
  else if (gmStatus.embeddings === 'unavailable') lanes.embedding = 'unavailable';

  if (gmStatus.graphiti === 'ok') lanes.kg = 'ok';
  else if (gmStatus.graph_backend === 'file-json') lanes.kg = 'file-json'; // store present; no distinct KG query in S1a

  // Semantic lane: embed the task once, only when the index actually has vectors — otherwise
  // a lexical-only index gains nothing and we skip the network call (T19). Fail-open → null.
  const queryEmbedding =
    gmStatus.embeddings === 'ok' || gmStatus.embeddings === 'partial'
      ? await embedQuery(task, { fetchImpl: opts.fetchImpl })
      : null;

  // Default vault scope only — registry fan-out is Phase 4.4 product surface.
  // Even if caller passes registry, S1a still searches the authorized vault only
  // and labels scope honestly; cross-vault hits must not appear.
  const search = invokeGraphMemoryTool(
    'search_context',
    { vaultId, query: task, limit: 40, queryEmbedding },
    ctx,
  );

  let hits = (search.hits || []).map((h) => applyTypeBoost(h, packType));

  // Optional GitNexus inject (tests / future MCP); fail-open when absent.
  if (typeof opts.gitnexusQuery === 'function') {
    try {
      const gn = await opts.gitnexusQuery({ vaultId, task });
      if (gn && Array.isArray(gn.hits) && gn.hits.length) {
        lanes.gitnexus = 'ok';
        hits = hits.concat(
          gn.hits.map((h) => ({
            ...h,
            lane: 'gitnexus',
            why: [...(h.why || []), { lane: 'gitnexus', score: h.score || 0 }],
          })),
        );
      } else {
        lanes.gitnexus = 'unavailable';
      }
    } catch {
      lanes.gitnexus = 'unavailable';
    }
  }

  // Scope wall: drop any hit not belonging to this vault (defense in depth).
  if (scope === 'vault' || scope === 'vault+plugin') {
    hits = hits.filter((h) => !h.vault_id || h.vault_id === vault.id);
  }

  const fused = fuseBySource(hits).map((h) => {
    const token_estimate = estimateTokens(`${h.title || ''}\n${h.excerpt || ''}`);
    return {
      project_id: h.project_id || vault.id,
      vault_id: h.vault_id || vault.id,
      source_path: h.source_path,
      source_kind: h.source_kind,
      heading_path: h.heading_path,
      title: h.title,
      excerpt: h.excerpt,
      lifecycle: h.lifecycle,
      status: h.status,
      source_sha256: h.source_sha256,
      content_sha256: h.content_sha256,
      chunk_id: h.chunk_id,
      lane: h.lane,
      score: h.score,
      why: h.why || [],
      token_estimate,
      stale: Boolean(h.stale),
      scope: h.scope || 'vault',
    };
  });

  const { items, truncated, dropped_item_ids, tokens_used } = truncateToBudget(
    fused,
    tokenBudget,
  );

  /** @type {Record<string, string>} */
  const source_hashes = {};
  for (const it of items) {
    if (it.source_path && it.source_sha256) source_hashes[it.source_path] = it.source_sha256;
  }

  let packStatus = 'ok';
  if (items.length === 0) packStatus = 'empty';
  else if (lanes.embedding === 'unavailable' || lanes.embedding === 'skipped' || lanes.embedding === 'degraded') {
    packStatus = 'lexical-only';
  }
  if (gmStatus.mode === 'embedding-degraded' || gmStatus.mode === 'embedding-partial') {
    packStatus = packStatus === 'empty' ? 'empty' : 'lexical-only';
  }

  const pack_id = `cp-${packType}-${sha256Text(`${vault.id}:${task}:${packType}`).slice(0, 12)}`;

  const manifest = {
    pack_id,
    vault_id: vault.id,
    pack_type: packType,
    task,
    token_budget: tokenBudget,
    tokens_used,
    built_at: new Date().toISOString(),
    scope: scope === 'registry' ? 'vault' : scope, // S1a: honest — still vault-bounded
    items,
    lanes,
    status: packStatus,
    source_hashes,
    truncated,
    dropped_item_ids,
    warnings:
      scope === 'registry'
        ? ['S1a: registry scope requested but pack remains vault-bounded; reuse search is Phase 4.4']
        : [],
  };

  let path = null;
  if (opts.write) {
    const dir = join(vault.root, PACK_DIR_REL);
    mkdirSync(dir, { recursive: true });
    path = join(dir, `${pack_id}.json`);
    writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }

  return { ok: true, manifest, path, vaultId: vault.id };
}

/**
 * Build + write pack under docs/generated/context-packs/.
 */
export async function buildContextPack(opts) {
  return assemblePack({ ...opts, write: true });
}

/**
 * Assemble pack without writing.
 */
export async function previewContextPack(opts) {
  return assemblePack({ ...opts, write: false });
}

/**
 * Generated Claude/Cursor views must not false-positive drift (D3).
 * Protected lessons files ARE canonical and remain drift-checkable.
 * @param {string} relPath
 */
export function isGeneratedViewPath(relPath) {
  const norm = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (norm === '.claude/rules/lessons.md') return false;
  if (norm === '.cursor/rules/lessons.mdc') return false;
  if (norm.startsWith('.claude/rules/')) return true;
  if (norm.startsWith('.cursor/rules/')) return true;
  return false;
}

/**
 * Detect drift of a pack snapshot vs current vault filesystem + front-matter.
 * Pure FS + FM — no local-ai / embeddings required (D6).
 * Detection only; never mutates sources.
 *
 * @param {object} packManifest
 * @param {{ pluginRoot?: string, registry?: object, vaultRoot?: string }} [opts]
 * @returns {{ ok: boolean, drifts: Array<{ class: string, source_path: string, detail: string }>, checked_at: string }}
 */
export function detectPackDrift(packManifest, opts = {}) {
  const manifest = packManifest || {};
  const vaultId = String(manifest.vault_id || '');
  if (!vaultId) {
    const err = new Error('packManifest.vault_id required');
    err.code = 'VAULT_ID';
    throw err;
  }

  const vault = resolveVaultRoot(vaultId, {
    pluginRoot: opts.pluginRoot,
    registry: opts.registry,
  });

  const hashes = { ...(manifest.source_hashes || {}) };
  for (const it of manifest.items || []) {
    if (it?.source_path && it?.source_sha256 && !hashes[it.source_path]) {
      hashes[it.source_path] = it.source_sha256;
    }
  }

  /** @type {Array<{ class: string, source_path: string, detail: string }>} */
  const drifts = [];

  for (const [source_path, expectedHash] of Object.entries(hashes)) {
    const norm = String(source_path).replace(/\\/g, '/');
    if (isGeneratedViewPath(norm)) continue; // D3 false-positive guard

    const abs = join(vault.root, norm);
    if (!existsSync(abs)) {
      drifts.push({
        class: 'source-deleted',
        source_path: norm,
        detail: 'path missing from vault',
      });
      continue;
    }

    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch (e) {
      drifts.push({
        class: 'source-deleted',
        source_path: norm,
        detail: `unreadable: ${e.message}`,
      });
      continue;
    }

    const currentHash = sha256Text(text);
    if (expectedHash && currentHash !== expectedHash) {
      const isLesson =
        norm === '.claude/rules/lessons.md' || norm === '.cursor/rules/lessons.mdc';
      drifts.push({
        class: isLesson ? 'stale-lesson' : 'source-changed',
        source_path: norm,
        detail: isLesson
          ? 'lessons file hash changed'
          : `source_sha256 mismatch (was ${String(expectedHash).slice(0, 8)}…)`,
      });
    }

    const { data } = parseFrontmatter(text);
    const status = String(data.status || '');
    const lifecycle = String(data.lifecycle || '');
    const type = String(data.type || '');

    if (status === 'superseded' || data.superseded_by) {
      drifts.push({
        class: type === 'plan' || norm.includes('/plans/') ? 'superseded-plan' : 'source-changed',
        source_path: norm,
        detail: data.superseded_by
          ? `superseded_by ${data.superseded_by}`
          : 'status: superseded',
      });
    }

    if (
      lifecycle === 'post_official' ||
      norm.includes('/post-official/') ||
      norm.includes('/_archive/')
    ) {
      drifts.push({
        class: 'archived',
        source_path: norm,
        detail: `lifecycle=${lifecycle || 'archive-path'}`,
      });
    }

    // Verbatim lesson line-presence (no stable line IDs — D3/A3)
    if (norm === '.claude/rules/lessons.md' || norm === '.cursor/rules/lessons.mdc') {
      const item = (manifest.items || []).find((i) => i.source_path === norm);
      const line = String(item?.excerpt || '').trim();
      if (line && !text.includes(line)) {
        if (!drifts.some((d) => d.source_path === norm && d.class === 'stale-lesson')) {
          drifts.push({
            class: 'stale-lesson',
            source_path: norm,
            detail: 'previously included lesson line text no longer present verbatim',
          });
        }
      }
    }
  }

  // Optional advisory: graph-memory index stale flags for included paths
  try {
    const statusOut = invokeGraphMemoryTool(
      'graph_memory_status',
      { vaultId },
      { pluginRoot: opts.pluginRoot, registry: opts.registry },
    );
    if (statusOut?.status?.mode && statusOut.status.mode !== 'missing') {
      const search = invokeGraphMemoryTool(
        'search_context',
        { vaultId, query: manifest.task || '', limit: 40 },
        { pluginRoot: opts.pluginRoot, registry: opts.registry },
      );
      for (const hit of search.hits || []) {
        if (!hashes[hit.source_path]) continue;
        if (hit.stale && hit.source_sha256 && hashes[hit.source_path] !== hit.source_sha256) {
          if (
            !drifts.some(
              (d) => d.source_path === hit.source_path && d.class === 'kg-hash-mismatch',
            )
          ) {
            drifts.push({
              class: 'kg-hash-mismatch',
              source_path: hit.source_path,
              detail: 'graph-memory reports stale / hash mismatch (advisory)',
            });
          }
        }
      }
    }
  } catch {
    // Index missing or tool error — advisory only; drift still returns FS/FM results
  }

  return {
    ok: true,
    drifts,
    checked_at: new Date().toISOString(),
  };
}
