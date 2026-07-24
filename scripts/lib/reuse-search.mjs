/**
 * Cross-project reuse search + ADR why-view — Phase 4.4 (S3).
 * Contract: docs/specs/2026-07-20-context-pack-contract.md §D4 + §5.
 *
 * READ-ONLY discovery. Reuses the graph-memory search lane per vault (no new
 * retriever) and the CRUD allow-list wall (no re-authored confinement). Default
 * scope is the current vault; registry scope fans out across ALL authorized
 * vaults with mandatory provenance and NEVER copies memory across vaults.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveVaultRoot, listAllowedVaults } from './vault-crud.mjs';
import { invokeGraphMemoryTool } from './graph-memory.mjs';
import { parseFrontmatter } from './frontmatter.mjs';

export const REUSE_SCOPES = Object.freeze(['vault', 'vault+plugin', 'registry']);

/**
 * Resolve the set of vaults to search for a scope.
 * @returns {Array<{ id: string, root: string, source: string }>}
 */
function targetVaults(scope, current, opts) {
  if (scope === 'vault') return [current];
  const all = listAllowedVaults({ pluginRoot: opts.pluginRoot, registry: opts.registry });
  if (scope === 'registry') return all;
  // vault+plugin: current vault plus the plugin-source vault
  const plugin = all.filter((v) => v.source === 'plugin');
  const byId = new Map([[current.id, current], ...plugin.map((v) => [v.id, v])]);
  return [...byId.values()];
}

/**
 * Cross-project reuse search. READ-ONLY — writes nothing.
 * @param {{ vaultId: string, query: string, scope?: string, limit?: number,
 *           pluginRoot?: string, registry?: object }} opts
 */
export function reuseSearch(opts) {
  const vaultId = String(opts.vaultId || '');
  if (!vaultId) {
    const err = new Error('vaultId required');
    err.code = 'VAULT_ID';
    throw err;
  }
  const query = String(opts.query || '').trim();
  if (!query) {
    const err = new Error('query required');
    err.code = 'QUERY';
    throw err;
  }
  const scope = opts.scope || 'vault';
  if (!REUSE_SCOPES.includes(scope)) {
    const err = new Error(`Invalid scope: ${scope}`);
    err.code = 'SCOPE';
    throw err;
  }
  const limit = Math.max(1, Math.min(100, Number(opts.limit) || 20));

  // Wall: current vault must be authorized (also normalizes vaultId → id).
  const current = resolveVaultRoot(vaultId, { pluginRoot: opts.pluginRoot, registry: opts.registry });
  const ctx = { pluginRoot: opts.pluginRoot, registry: opts.registry };

  const targets = targetVaults(scope, current, opts);
  const vaultsStatus = [];
  const hits = [];

  for (const v of targets) {
    let searched = false;
    let reason = null;
    try {
      // queryEmbedding (if the caller computed one) is reused across every target vault.
      const out = invokeGraphMemoryTool(
        'search_context',
        { vaultId: v.id, query, limit, queryEmbedding: opts.queryEmbedding },
        ctx,
      );
      searched = true;
      for (const h of out.hits || []) {
        hits.push({
          // Mandatory provenance — every hit labels where it came from.
          source_vault: v.id,
          project_id: h.project_id || v.id,
          vault_id: h.vault_id || v.id,
          source_path: h.source_path,
          source_sha256: h.source_sha256,
          title: h.title,
          source_kind: h.source_kind,
          lifecycle: h.lifecycle,
          status: h.status,
          score: h.score,
          lane: h.lane,
          excerpt: h.excerpt,
        });
      }
    } catch (e) {
      reason = e && e.code ? e.code : 'INDEX_UNAVAILABLE';
    }
    vaultsStatus.push({ id: v.id, source: v.source, searched, reason });
  }

  hits.sort((a, b) => b.score - a.score || String(a.source_path).localeCompare(String(b.source_path)));

  return {
    ok: true,
    scope,
    query,
    from_vault: current.id,
    vaults: vaultsStatus,
    hits: hits.slice(0, limit),
    // Explicit: this surface never copies memory/rules into the consumer vault.
    writes: 'none',
  };
}

/**
 * ADR why-view — read-only render of docs/decisions/* with governed links.
 * @param {{ vaultId: string, pluginRoot?: string, registry?: object }} opts
 */
export function listAdrDecisions(opts) {
  const vaultId = String(opts.vaultId || '');
  if (!vaultId) {
    const err = new Error('vaultId required');
    err.code = 'VAULT_ID';
    throw err;
  }
  const vault = resolveVaultRoot(vaultId, { pluginRoot: opts.pluginRoot, registry: opts.registry });
  const dir = join(vault.root, 'docs', 'decisions');
  const decisions = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith('.md') || name.toLowerCase() === 'readme.md') continue;
      const abs = join(dir, name);
      let text;
      try {
        text = readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      const { data } = parseFrontmatter(text);
      const headingMatch = text.match(/^#\s+(.+)$/m);
      decisions.push({
        path: join('docs', 'decisions', name).replace(/\\/g, '/'),
        title: data.title || (headingMatch ? headingMatch[1].trim() : name),
        status: data.status || '',
        lifecycle: data.lifecycle || '',
        // "governs" = the plans/specs this decision points at (why it is this way)
        governs: Array.isArray(data.related) ? data.related : [],
        supersedes: data.supersedes || null,
        superseded_by: data.superseded_by || null,
      });
    }
  }
  return { ok: true, vaultId: vault.id, decisions };
}
