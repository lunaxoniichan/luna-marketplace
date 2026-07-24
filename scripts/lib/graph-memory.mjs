/**
 * Graph memory — rebuildable context index (Phase 3).
 * Contract: docs/specs/2026-07-19-graph-memory-backend-contract.md
 *
 * Markdown + git remain source of truth. Indexes under docs/generated/graph-memory/
 * are rebuildable. MCP/query surface is read-only — never writes memory/lessons/native.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseFrontmatter, inferLifecycle, inferType, extractWikilinks } from './frontmatter.mjs';
import { walkMarkdown } from './md-walk.mjs';
import { resolveVaultRoot, buildAllowedVaultMap } from './vault-crud.mjs';
import { normalizeToken, jaccard } from './knowledge-dedupe.mjs';
import { sha256Text, isExcludedKnowledgePath } from './util.mjs';

export { sha256Text };

export const CHUNKER_VERSION = 1;
export const EXTRACTOR_VERSION = 1;
export const INDEX_VERSION = 1;
export const INDEX_REL = join('docs', 'generated', 'graph-memory', 'index.json');
export const MAX_SEARCH_RESULTS = 20;
export const DEFAULT_LOCAL_AI = 'http://127.0.0.1:1000/v1';
// Keyless direct TEI embeddings server — fallback when the gateway needs auth or is down.
export const DEFAULT_TEI_URL = 'http://127.0.0.1:1002/v1';
export const DEFAULT_EMBED_MODEL = 'bge-m3';
export const DEFAULT_EMBED_DIM = 1024;
// TEI (bge-m3) caps client batches at 32; the gateway path enforces the same. Larger → HTTP 413.
export const EMBED_BATCH_SIZE = 32;


const MUTATION_TOOL_RE = /^(add|delete|clear|write|mutate|upsert|remove)_/i;
const FORBIDDEN_WRITE_PREFIXES = [
  'memory/',
  '.claude/memory/',
  '.claude/rules/lessons.md',
  '.cursor/rules/lessons.mdc',
];

/** @type {ReadonlySet<string>} */
export const READ_ONLY_TOOLS = new Set([
  'graph_memory_status',
  'search_context',
  'get_context_item',
  'related_items',
  'check_conflicts',
  'recent_changes',
]);

/**
 * @param {string} text
 */
/** Alias — canonical impl in util.mjs (shared with knowledge-dedupe). */
export const isExcludedGraphSource = isExcludedKnowledgePath;

/**
 * Heading-aware markdown chunks. Code fences stay intact inside a chunk.
 * @param {string} markdown
 * @returns {Array<{ heading_path: string, content: string }>}
 */
export function chunkMarkdown(markdown) {
  const text = String(markdown || '');
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const stack = [];
  /** @type {Array<{ heading_path: string, lines: string[] }>} */
  const sections = [{ heading_path: '', lines: [] }];
  let inFence = false;

  for (const line of lines) {
    if (/^```/.test(line)) inFence = !inFence;
    const hm = !inFence ? /^(#{1,6})\s+(.+?)\s*$/.exec(line) : null;
    if (hm) {
      const level = hm[1].length;
      const title = hm[2].trim();
      while (stack.length >= level) stack.pop();
      stack.length = level - 1;
      stack[level - 1] = title;
      sections.push({ heading_path: stack.filter(Boolean).join(' > '), lines: [line] });
      continue;
    }
    sections[sections.length - 1].lines.push(line);
  }

  return sections
    .map((s) => ({
      heading_path: s.heading_path || '(root)',
      content: s.lines.join('\n').trim(),
    }))
    .filter((s) => s.content.length > 0);
}

/**
 * @param {string} relPath
 * @param {object} data
 */
function sourceKind(relPath, data) {
  const norm = relPath.replace(/\\/g, '/');
  if (norm === '.claude/rules/lessons.md') return 'lesson';
  if (norm.startsWith('rules/')) return 'rule';
  if (norm.startsWith('memory/') || norm.startsWith('.claude/memory/')) return 'memory';
  if (data?.type) return String(data.type);
  return inferType(norm) || 'doc';
}

/**
 * Collect canonical sources from a vault root (live walk).
 * @param {string} vaultRoot
 * @param {string} vaultId
 */
/**
 * Most-recent commit time (epoch seconds) per tracked source path, in ONE git call.
 * Fail-open: returns an empty map when the vault is not a real repo / has no commits,
 * so recentChanges falls back to path order rather than throwing (T12).
 * @param {string} vaultRoot
 * @returns {Map<string, number>}
 */
export function collectGitMtimes(vaultRoot) {
  const map = new Map();
  try {
    // Reverse-chronological; first occurrence of a path is its latest commit time.
    const out = execFileSync('git', ['-C', vaultRoot, 'log', '--format=%ct', '--name-only'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 32 * 1024 * 1024,
    });
    let ts = null;
    for (const line of out.split('\n')) {
      if (/^\d+$/.test(line)) {
        ts = Number(line);
      } else if (line.trim() && ts != null) {
        const p = line.replace(/\\/g, '/');
        if (!map.has(p)) map.set(p, ts);
      }
    }
  } catch {
    /* not a repo / no commits — fail-open to empty */
  }
  return map;
}

export function collectVaultSources(vaultRoot, vaultId) {
  /** @type {Array<object>} */
  const sources = [];
  const paths = [
    { under: 'docs', label: 'docs' },
    { under: 'rules', label: 'rules' },
  ];
  for (const mem of ['memory', join('.claude', 'memory')]) {
    if (existsSync(join(vaultRoot, mem))) paths.push({ under: mem, label: 'memory' });
  }

  for (const p of paths) {
    const files = walkMarkdown(vaultRoot, { under: p.under });
    for (const f of files) {
      if (isExcludedGraphSource(f.rel, f.text)) continue;
      const { data, body, hasFm } = parseFrontmatter(f.text);
      sources.push({
        project_id: vaultId,
        vault_id: vaultId,
        source_path: f.rel.replace(/\\/g, '/'),
        source_kind: sourceKind(f.rel, data),
        title: data.title || basename(f.rel, '.md'),
        lifecycle: data.lifecycle || inferLifecycle(f.rel),
        status: data.status || 'active',
        scope: data.scope || 'project',
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
        related: Array.isArray(data.related) ? data.related : [],
        wikilinks: extractWikilinks(body),
        has_frontmatter: hasFm,
        body,
        source_sha256: sha256Text(f.text),
        text: f.text,
      });
    }
  }

  const lessons = join(vaultRoot, '.claude', 'rules', 'lessons.md');
  if (existsSync(lessons)) {
    const text = readFileSync(lessons, 'utf8');
    if (!sources.some((s) => s.source_path === '.claude/rules/lessons.md')) {
      sources.push({
        project_id: vaultId,
        vault_id: vaultId,
        source_path: '.claude/rules/lessons.md',
        source_kind: 'lesson',
        title: 'lessons',
        lifecycle: 'official',
        status: 'active',
        scope: 'project',
        keywords: ['lessons', 'corrections'],
        related: [],
        wikilinks: [],
        has_frontmatter: false,
        body: text,
        source_sha256: sha256Text(text),
        text,
      });
    }
  }

  return sources;
}

/**
 * @param {object} source
 * @param {number} chunkerVersion
 */
export function buildChunksForSource(source, chunkerVersion = CHUNKER_VERSION) {
  const parts = chunkMarkdown(source.body || source.text || '');
  return parts.map((part, i) => {
    const content_sha256 = sha256Text(part.content);
    const id = sha256Text(
      `${source.vault_id}|${source.source_path}|${part.heading_path}|${content_sha256}|${chunkerVersion}`,
    ).slice(0, 24);
    const tokens = normalizeToken(`${source.title} ${part.heading_path} ${part.content}`);
    return {
      id,
      project_id: source.project_id,
      vault_id: source.vault_id,
      source_path: source.source_path,
      source_kind: source.source_kind,
      heading_path: part.heading_path,
      title: source.title,
      lifecycle: source.lifecycle,
      status: source.status,
      scope: source.scope,
      source_sha256: source.source_sha256,
      content_sha256,
      chunker_version: chunkerVersion,
      excerpt: part.content.replace(/\s+/g, ' ').trim().slice(0, 320),
      content: part.content,
      tokens,
      keywords: source.keywords || [],
      related: source.related || [],
      wikilinks: source.wikilinks || [],
      embedding: null,
      embedding_model: null,
      embedding_dim: null,
    };
  });
}

/**
 * Lightweight file-backed KG from headings, related[], wikilinks.
 * @param {object[]} sources
 * @param {object[]} chunks
 */
export function buildGraphFromSources(sources, chunks) {
  /** @type {Map<string, object>} */
  const nodes = new Map();
  /** @type {object[]} */
  const edges = [];
  /** @type {object[]} */
  const facts = [];

  for (const s of sources) {
    const nid = `src:${s.vault_id}:${s.source_path}`;
    nodes.set(nid, {
      id: nid,
      kind: 'source',
      source_path: s.source_path,
      source_kind: s.source_kind,
      title: s.title,
      lifecycle: s.lifecycle,
      status: s.status,
      source_sha256: s.source_sha256,
      vault_id: s.vault_id,
      project_id: s.project_id,
    });
    for (const rel of s.related || []) {
      const target = String(rel).replace(/\\/g, '/');
      edges.push({
        from: nid,
        to: `ref:${s.vault_id}:${target}`,
        kind: 'related',
        source_path: s.source_path,
      });
      if (!nodes.has(`ref:${s.vault_id}:${target}`)) {
        nodes.set(`ref:${s.vault_id}:${target}`, {
          id: `ref:${s.vault_id}:${target}`,
          kind: 'ref',
          source_path: target,
          vault_id: s.vault_id,
          project_id: s.project_id,
        });
      }
    }
    for (const w of s.wikilinks || []) {
      const target = String(w).replace(/\\/g, '/');
      edges.push({
        from: nid,
        to: `wiki:${s.vault_id}:${target}`,
        kind: 'wikilink',
        source_path: s.source_path,
      });
    }
  }

  for (const c of chunks) {
    const fid = `fact:${c.id}`;
    facts.push({
      id: fid,
      chunk_id: c.id,
      source_path: c.source_path,
      heading_path: c.heading_path,
      text: c.excerpt,
      status: c.status === 'superseded' || c.status === 'deprecated' ? 'stale' : 'active',
      source_sha256: c.source_sha256,
      content_sha256: c.content_sha256,
      vault_id: c.vault_id,
      project_id: c.project_id,
      source_kind: c.source_kind,
      lifecycle: c.lifecycle,
    });
  }

  return { nodes: [...nodes.values()], edges, facts };
}

/**
 * Optional local-ai embeddings — fail-open (T11).
 * Endpoint order (all fail-open): (1) gateway `baseUrl` with `Authorization: Bearer <key>` when a
 * key is present; (2) keyless TEI `fallbackUrl` — tried ONLY when the primary yields zero vectors
 * (e.g. gateway 401 / down). Batches ALL chunks; never reports ok when coverage < total. Enforces
 * index-wide dim consistency: the first accepted vector sets the dim; length-mismatched vectors are
 * rejected (a model/dim drift can't silently poison cosine).
 * @param {object[]} chunks
 * @param {{ baseUrl?: string, fallbackUrl?: string, apiKey?: string, model?: string, timeoutMs?: number, batchSize?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ ok: boolean, reason: string, chunks: object[], model?: string, embedded_count: number, total: number, partial?: boolean, endpoint?: string|null, embedding_dim?: number|null }>}
 */
export async function maybeEmbedChunks(chunks, opts = {}) {
  const total = chunks.length;
  if (process.env.LUNA_MEMORY_KG === 'off') {
    return { ok: false, reason: 'LUNA_MEMORY_KG=off', chunks, embedded_count: 0, total };
  }
  const model = opts.model || process.env.LUNA_EMBED_MODEL || DEFAULT_EMBED_MODEL;
  const timeoutMs = opts.timeoutMs ?? 2500;
  const batchSize = Math.max(1, opts.batchSize ?? EMBED_BATCH_SIZE);
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, reason: 'fetch_unavailable', chunks, embedded_count: 0, total };
  }

  if (!total) return { ok: true, reason: 'empty', chunks, model, embedded_count: 0, total: 0 };

  const primaryUrl = (opts.baseUrl || process.env.LUNA_LOCAL_AI_URL || DEFAULT_LOCAL_AI).replace(/\/$/, '');
  const primaryKey = opts.apiKey ?? process.env.LUNA_LOCAL_AI_KEY ?? '';
  const fallbackUrl = (opts.fallbackUrl || process.env.LUNA_EMBED_URL || DEFAULT_TEI_URL).replace(/\/$/, '');
  const endpoints = [{ url: primaryUrl, key: primaryKey }];
  if (fallbackUrl && fallbackUrl !== primaryUrl) endpoints.push({ url: fallbackUrl, key: '' });

  let dim = null;
  let lastError = null;
  let usedEndpoint = null;

  /** Fill still-empty chunks against one endpoint; returns how many it embedded. */
  const embedAgainst = async ({ url, key }) => {
    let count = 0;
    for (let offset = 0; offset < total; offset += batchSize) {
      const pending = chunks.slice(offset, offset + batchSize).filter((c) => !Array.isArray(c.embedding));
      if (!pending.length) continue;
      const inputs = pending.map((c) => c.excerpt || c.content || '');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const headers = { 'content-type': 'application/json' };
        if (key) headers.Authorization = `Bearer ${key}`;
        const res = await fetchImpl(`${url}/embeddings`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ model, input: inputs }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          lastError = `http_${res.status}`;
          break;
        }
        const json = await res.json();
        const data = Array.isArray(json?.data) ? json.data : [];
        for (let i = 0; i < pending.length; i++) {
          const emb = data[i]?.embedding;
          if (!Array.isArray(emb) || !emb.length) continue;
          if (dim == null) dim = emb.length;
          if (emb.length !== dim) {
            lastError = `dim_mismatch:${emb.length}`;
            continue;
          }
          pending[i].embedding = emb;
          pending[i].embedding_model = model;
          pending[i].embedding_dim = emb.length;
          count++;
        }
        // Fewer vectors than requested → stop and report partial.
        if (data.length < pending.length) {
          lastError = 'short_batch';
          break;
        }
      } catch (e) {
        lastError = String(e?.name || e?.message || e);
        break;
      } finally {
        clearTimeout(timer);
      }
    }
    return count;
  };

  let embedded_count = 0;
  for (const ep of endpoints) {
    const got = await embedAgainst(ep);
    if (got > 0 && usedEndpoint == null) usedEndpoint = ep.url;
    embedded_count += got;
    // Only advance to the fallback when the primary produced nothing at all.
    if (embedded_count > 0) break;
  }

  if (embedded_count === 0) {
    return {
      ok: false,
      reason: lastError || 'no_embeddings',
      chunks,
      embedded_count: 0,
      total,
      endpoint: null,
      embedding_dim: null,
    };
  }
  const partial = embedded_count < total;
  return {
    ok: true,
    reason: partial ? (lastError ? `partial:${lastError}` : 'partial') : 'ok',
    chunks,
    model,
    embedded_count,
    total,
    partial,
    endpoint: usedEndpoint,
    embedding_dim: dim,
  };
}

/**
 * Embed a single query string for the semantic retrieval lane — fail-open (T19).
 * Returns the vector, or null when embeddings are unavailable (caller falls back to lexical).
 * Reuses the exact endpoint/auth/fallback path as rebuild embeddings.
 * @param {string} query
 * @param {Parameters<typeof maybeEmbedChunks>[1]} [opts]
 * @returns {Promise<number[]|null>}
 */
export async function embedQuery(query, opts = {}) {
  const q = String(query || '').trim();
  if (!q) return null;
  const probe = [{ excerpt: q, embedding: null }];
  const res = await maybeEmbedChunks(probe, opts);
  return res.ok && Array.isArray(probe[0].embedding) ? probe[0].embedding : null;
}

/**
 * Cosine similarity for optional embedding lane.
 */
export function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * @param {string} vaultRoot
 */
export function indexPathForVault(vaultRoot) {
  return join(vaultRoot, INDEX_REL);
}

/**
 * @param {string} vaultRoot
 */
export function loadIndex(vaultRoot) {
  const p = indexPathForVault(vaultRoot);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    const err = new Error('graph-memory index corrupt');
    err.code = 'INDEX_CORRUPT';
    throw err;
  }
}

/**
 * Compare knowledge.json snapshot ages vs live sources — warn only.
 * @param {string} pluginRoot
 * @param {object[]} liveSources
 */
export function assessKnowledgeSnapshot(pluginRoot, liveSources) {
  const knowledgePath = join(pluginRoot, 'docs', 'generated', 'knowledge.json');
  if (!existsSync(knowledgePath)) {
    return { present: false, stale: false, warnings: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(knowledgePath, 'utf8'));
    const items = Array.isArray(raw.items) ? raw.items : [];
    const byPath = new Map(items.map((i) => [i.path, i]));
    let mismatches = 0;
    for (const s of liveSources) {
      const snap = byPath.get(s.source_path);
      if (!snap) continue;
      // Snapshot has no content hash historically — compare title/kind drift as weak signal.
      if (snap.title && snap.title !== s.title) mismatches++;
      if (snap.kind && snap.kind !== s.source_kind && s.source_kind !== 'lesson') mismatches++;
    }
    const stale = mismatches > 0;
    return {
      present: true,
      stale,
      warnings: stale
        ? ['knowledge.json snapshot disagrees with live vault sources — live walk preferred']
        : [],
    };
  } catch {
    return {
      present: true,
      stale: true,
      warnings: ['knowledge.json unreadable — ignored; live walk used'],
    };
  }
}

/**
 * Rebuild graph-memory index for an authorized vault.
 * @param {{ vaultId: string, pluginRoot?: string, registry?: object, embed?: boolean, fetchImpl?: typeof fetch }} opts
 */
export async function rebuildGraphMemory(opts) {
  const vaultId = String(opts.vaultId || '');
  const vault = resolveVaultRoot(vaultId, {
    pluginRoot: opts.pluginRoot,
    registry: opts.registry,
  });
  const pluginRoot = resolve(opts.pluginRoot || process.env.LUNA_PLUGIN_ROOT || process.cwd());

  const sources = collectVaultSources(vault.root, vault.id);
  const gitMtimes = collectGitMtimes(vault.root);
  const snap = assessKnowledgeSnapshot(pluginRoot, sources);

  /** @type {object[]} */
  let chunks = [];
  for (const s of sources) {
    chunks.push(...buildChunksForSource(s));
  }

  const warnings = [...(snap.warnings || [])];
  let embedStatus = 'skipped';
  let embedModel = null;
  let embedDim = null;
  let embedEndpoint = null;
  let embedded_count = 0;
  const chunk_total = chunks.length;
  if (opts.embed !== false && process.env.LUNA_MEMORY_KG !== 'off') {
    const emb = await maybeEmbedChunks(chunks, {
      fetchImpl: opts.fetchImpl,
      baseUrl: opts.localAiUrl,
      apiKey: opts.localAiKey,
      fallbackUrl: opts.embedFallbackUrl,
      model: opts.embedModel,
      batchSize: opts.embedBatchSize,
    });
    embedded_count = emb.embedded_count ?? 0;
    embedDim = emb.embedding_dim ?? null;
    embedEndpoint = emb.endpoint ?? null;
    if (emb.ok && !emb.partial && embedded_count === chunk_total) {
      embedStatus = 'ok';
      embedModel = emb.model || DEFAULT_EMBED_MODEL;
    } else if (emb.ok && (emb.partial || embedded_count < chunk_total)) {
      embedStatus = 'partial';
      embedModel = emb.model || DEFAULT_EMBED_MODEL;
      warnings.push(
        `embeddings partial: ${embedded_count}/${chunk_total} (${emb.reason})`,
      );
    } else {
      embedStatus = 'unavailable';
      warnings.push(`embeddings degraded: ${emb.reason}`);
    }
    // Advisory: bge-m3 must be 1024-dim; a mismatch signals a wrong model/endpoint.
    if (embedModel && /bge-m3/i.test(embedModel) && embedDim && embedDim !== DEFAULT_EMBED_DIM) {
      warnings.push(`embedding dim ${embedDim} != expected ${DEFAULT_EMBED_DIM} for ${embedModel}`);
    }
  } else {
    embedStatus = 'skipped';
  }

  const graph = buildGraphFromSources(sources, chunks);

  // Strip heavy content from persisted chunks (keep excerpt + tokens + optional embedding).
  const persistedChunks = chunks.map((c) => {
    const { content, ...rest } = c;
    return rest;
  });

  let mode = 'complete';
  if (embedStatus === 'skipped') mode = 'lexical-only';
  else if (embedStatus === 'partial') mode = 'embedding-partial';
  else if (embedStatus !== 'ok') mode = 'embedding-degraded';
  if (snap.stale) mode = mode === 'complete' ? 'stale-source' : mode;

  const index = {
    version: INDEX_VERSION,
    vault_id: vault.id,
    project_id: vault.id,
    built_at: new Date().toISOString(),
    chunker_version: CHUNKER_VERSION,
    extractor_version: EXTRACTOR_VERSION,
    status: {
      mode,
      local_ai:
        embedStatus === 'ok' || embedStatus === 'partial'
          ? 'ok'
          : embedStatus === 'skipped'
            ? 'skipped'
            : 'unavailable',
      embeddings: embedStatus,
      embedding_model: embedModel,
      embedding_dim: embedDim,
      embedding_endpoint: embedEndpoint,
      embedded_count,
      chunk_total,
      graph_backend: 'file-json',
      graphiti: 'unavailable',
      pgvector: 'unavailable',
      gitnexus: 'external',
      warnings,
    },
    sources: sources.map((s) => ({
      source_path: s.source_path,
      source_kind: s.source_kind,
      title: s.title,
      lifecycle: s.lifecycle,
      status: s.status,
      source_sha256: s.source_sha256,
      scope: s.scope,
      git_mtime: gitMtimes.get(s.source_path) ?? null,
    })),
    chunks: persistedChunks,
    nodes: graph.nodes,
    edges: graph.edges,
    facts: graph.facts,
  };

  const out = indexPathForVault(vault.root);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  return { ok: true, vaultId: vault.id, path: out, index };
}

/**
 * Authority boost for ranking.
 */
function authorityScore(chunk) {
  let s = 0;
  if (chunk.lifecycle === 'official') s += 0.35;
  if (chunk.lifecycle === 'pre_official') s += 0.05;
  if (chunk.lifecycle === 'post_official') s -= 0.2;
  if (['architecture', 'spec', 'decision'].includes(chunk.source_kind)) s += 0.4;
  if (chunk.source_kind === 'lesson') s += 0.45;
  if (chunk.source_kind === 'plan' && chunk.status === 'active') s += 0.3;
  if (chunk.status === 'superseded' || chunk.status === 'deprecated') s -= 0.5;
  if (String(chunk.source_path || '').includes('SYSTEM_DESIGN') || String(chunk.source_path || '').includes('/decisions/')) {
    s += 0.25;
  }
  if (String(chunk.source_path || '').includes('/plans/')) s += 0.15;
  return s;
}

/**
 * @param {object} index
 * @param {string} query
 * @param {{ limit?: number, queryEmbedding?: number[] }} [opts]
 */
export function searchIndex(index, query, opts = {}) {
  const limit = Math.min(opts.limit ?? MAX_SEARCH_RESULTS, MAX_SEARCH_RESULTS);
  const qTokens = new Set(normalizeToken(query));
  const qLower = String(query || '').toLowerCase();
  const hits = [];

  for (const c of index.chunks || []) {
    const tokSet = new Set(c.tokens || []);
    const lex = jaccard(qTokens, tokSet);
    let emb = 0;
    if (opts.queryEmbedding && c.embedding) {
      emb = cosine(opts.queryEmbedding, c.embedding);
    }
    const auth = authorityScore(c);
    const lessonBoost =
      c.source_kind === 'lesson' && [...qTokens].some((t) => (c.tokens || []).includes(t)) ? 0.2 : 0;
    const score = lex * 0.55 + emb * 0.25 + auth + lessonBoost;
    if (score <= 0.05 && lex === 0 && emb === 0) continue;

    const why = [];
    if (lex > 0) why.push({ lane: 'lexical', score: Number(lex.toFixed(4)) });
    if (emb > 0) why.push({ lane: 'embedding', score: Number(emb.toFixed(4)) });
    if (auth) why.push({ lane: 'authority', score: Number(auth.toFixed(4)) });
    if (c.source_kind === 'lesson') why.push({ lane: 'lesson', score: lessonBoost });

    const stale =
      c.status === 'superseded' ||
      c.status === 'deprecated' ||
      (index.sources || []).find((s) => s.source_path === c.source_path)?.source_sha256 !==
        c.source_sha256;

    hits.push({
      project_id: c.project_id,
      vault_id: c.vault_id,
      source_path: c.source_path,
      source_kind: c.source_kind,
      heading_path: c.heading_path,
      title: c.title,
      excerpt: c.excerpt,
      lifecycle: c.lifecycle,
      status: c.status,
      source_sha256: c.source_sha256,
      content_sha256: c.content_sha256,
      chunk_id: c.id,
      lane: emb > lex ? 'embedding' : 'lexical',
      score: Number(score.toFixed(4)),
      why,
      stale: Boolean(stale),
      scope: c.scope || 'vault',
      _q: qLower,
    });
  }

  hits.sort((a, b) => b.score - a.score || a.source_path.localeCompare(b.source_path));
  return hits.slice(0, limit).map(({ _q, ...h }) => h);
}

/**
 * @param {object} index
 * @param {string} sourcePathOrChunkId
 */
export function getContextItem(index, sourcePathOrChunkId) {
  const key = String(sourcePathOrChunkId || '');
  const chunk =
    (index.chunks || []).find((c) => c.id === key) ||
    (index.chunks || []).find((c) => c.source_path === key);
  if (!chunk) return null;
  return {
    project_id: chunk.project_id,
    vault_id: chunk.vault_id,
    source_path: chunk.source_path,
    source_kind: chunk.source_kind,
    heading_path: chunk.heading_path,
    title: chunk.title,
    excerpt: chunk.excerpt,
    lifecycle: chunk.lifecycle,
    status: chunk.status,
    source_sha256: chunk.source_sha256,
    content_sha256: chunk.content_sha256,
    chunk_id: chunk.id,
    lane: 'get',
    score: 1,
    why: [{ lane: 'exact', score: 1 }],
    stale: chunk.status === 'superseded' || chunk.status === 'deprecated',
    scope: chunk.scope || 'vault',
  };
}

/**
 * @param {object} index
 * @param {string} sourcePath
 */
export function relatedItems(index, sourcePath, limit = MAX_SEARCH_RESULTS) {
  const path = String(sourcePath || '');
  const edgeTargets = new Set();
  for (const e of index.edges || []) {
    if (e.source_path === path || String(e.from).endsWith(`:${path}`)) {
      const m = String(e.to).split(':');
      edgeTargets.add(m.slice(2).join(':') || m[m.length - 1]);
    }
  }
  const hits = [];
  for (const c of index.chunks || []) {
    if (c.source_path === path) continue;
    const related =
      edgeTargets.has(c.source_path) ||
      (c.related || []).some((r) => String(r).includes(path)) ||
      (c.wikilinks || []).some((w) => String(w).includes(basename(path, '.md')));
    if (!related) continue;
    hits.push({
      project_id: c.project_id,
      vault_id: c.vault_id,
      source_path: c.source_path,
      source_kind: c.source_kind,
      heading_path: c.heading_path,
      title: c.title,
      excerpt: c.excerpt,
      lifecycle: c.lifecycle,
      status: c.status,
      source_sha256: c.source_sha256,
      content_sha256: c.content_sha256,
      chunk_id: c.id,
      lane: 'kg',
      score: 0.7 + authorityScore(c),
      why: [{ lane: 'kg_neighborhood', score: 0.7 }],
      stale: c.status === 'superseded' || c.status === 'deprecated',
      scope: c.scope || 'vault',
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/**
 * Conflicting lessons / contradictory keywords — surface, don't resolve.
 * @param {object} index
 */
export function checkConflicts(index, limit = MAX_SEARCH_RESULTS) {
  const lessons = (index.chunks || []).filter((c) => c.source_kind === 'lesson');
  const conflicts = [];
  // Pairwise opposite cue detection in lesson excerpts
  const NEG = /\b(avoid|never|don't|do not|instead)\b/i;
  for (let i = 0; i < lessons.length; i++) {
    for (let j = i + 1; j < lessons.length; j++) {
      const a = lessons[i];
      const b = lessons[j];
      const overlap = jaccard(new Set(a.tokens || []), new Set(b.tokens || []));
      if (overlap < 0.2) continue;
      const aNeg = NEG.test(a.excerpt || '');
      const bNeg = NEG.test(b.excerpt || '');
      if (aNeg || bNeg || overlap > 0.45) {
        conflicts.push({
          id: `conflict:${a.id}:${b.id}`,
          kind: 'lesson_overlap',
          score: Number(overlap.toFixed(4)),
          items: [
            {
              source_path: a.source_path,
              heading_path: a.heading_path,
              excerpt: a.excerpt,
              chunk_id: a.id,
            },
            {
              source_path: b.source_path,
              heading_path: b.heading_path,
              excerpt: b.excerpt,
              chunk_id: b.id,
            },
          ],
          note: 'Surfaced for review — graph memory does not pick a canonical truth',
        });
      }
    }
  }
  // Also: same heading tokens across superseded vs active docs
  const byHeading = new Map();
  for (const c of index.chunks || []) {
    if (!c.heading_path || c.heading_path === '(root)') continue;
    const k = normalizeToken(c.heading_path).slice(0, 6).join('|');
    if (!k) continue;
    if (!byHeading.has(k)) byHeading.set(k, []);
    byHeading.get(k).push(c);
  }
  for (const [, group] of byHeading) {
    const active = group.filter((c) => c.status === 'active' || !c.status);
    const stale = group.filter((c) => c.status === 'superseded' || c.status === 'deprecated');
    if (active.length && stale.length) {
      conflicts.push({
        id: `conflict:lifecycle:${stale[0].id}:${active[0].id}`,
        kind: 'lifecycle_contradiction',
        score: 0.6,
        items: [...stale.slice(0, 1), ...active.slice(0, 1)].map((c) => ({
          source_path: c.source_path,
          heading_path: c.heading_path,
          excerpt: c.excerpt,
          chunk_id: c.id,
          status: c.status,
        })),
        note: 'Superseded/active pair — prefer active with stale warning',
      });
    }
  }
  return conflicts.slice(0, limit);
}

/**
 * @param {object} index
 */
export function recentChanges(index, limit = MAX_SEARCH_RESULTS) {
  const sources = [...(index.sources || [])];
  const hasMtime = sources.some((s) => typeof s.git_mtime === 'number');
  // T12: when git mtimes are indexed, order by real recency (newest first, nulls last).
  // Otherwise fall back to path order and label the cohort honestly.
  if (hasMtime) {
    sources.sort((a, b) => {
      const am = typeof a.git_mtime === 'number' ? a.git_mtime : -Infinity;
      const bm = typeof b.git_mtime === 'number' ? b.git_mtime : -Infinity;
      return bm - am || String(a.source_path).localeCompare(String(b.source_path));
    });
  }
  return sources.slice(0, limit).map((s) => ({
    project_id: index.project_id,
    vault_id: index.vault_id,
    source_path: s.source_path,
    source_kind: s.source_kind,
    title: s.title,
    lifecycle: s.lifecycle,
    status: s.status,
    source_sha256: s.source_sha256,
    git_mtime: s.git_mtime ?? null,
    changed_at: typeof s.git_mtime === 'number' ? new Date(s.git_mtime * 1000).toISOString() : null,
    built_at: index.built_at,
    lane: 'recent',
    why: [{ lane: hasMtime ? 'git_mtime' : 'index_cohort', score: 1 }],
  }));
}

/**
 * Reject mutation tools / forbidden write payloads.
 * @param {string} toolName
 * @param {object} [payload]
 */
export function assertReadOnlyTool(toolName, payload = {}) {
  const name = String(toolName || '');
  if (MUTATION_TOOL_RE.test(name)) {
    const err = new Error(`Mutation tool rejected: ${name}`);
    err.code = 'MUTATION_REJECTED';
    throw err;
  }
  if (!READ_ONLY_TOOLS.has(name)) {
    const err = new Error(`Unknown or forbidden graph-memory tool: ${name}`);
    err.code = 'TOOL_FORBIDDEN';
    throw err;
  }
  const rel = payload.relPath || payload.path || payload.targetPath;
  if (rel && payload.body != null) {
    const norm = String(rel).replace(/\\/g, '/');
    if (
      FORBIDDEN_WRITE_PREFIXES.some((p) => norm === p || norm.startsWith(p)) ||
      (norm.includes('.claude/projects/') && norm.includes('/memory/'))
    ) {
      const err = new Error('Write to memory/lessons/native paths forbidden');
      err.code = 'WRITE_FORBIDDEN';
      throw err;
    }
    const err = new Error('Graph-memory tools are read-only');
    err.code = 'MUTATION_REJECTED';
    throw err;
  }
  if (payload.nativeMemoryPath || payload.claudeMemoryPath) {
    const err = new Error('Native Claude memory is out of bounds');
    err.code = 'WRITE_FORBIDDEN';
    throw err;
  }
  return true;
}

/**
 * Ensure tool never writes forbidden paths (probe for tests).
 */
export function wouldWriteForbidden(relPath) {
  const norm = String(relPath || '').replace(/\\/g, '/');
  if (FORBIDDEN_WRITE_PREFIXES.some((p) => norm === p || norm.startsWith(p))) return true;
  if (/^~\/\.claude\/projects\/.+\/memory\//.test(norm)) return true;
  if (norm.includes('.claude/projects/') && norm.includes('/memory/')) return true;
  return false;
}

/**
 * Invoke a read-only tool against a vault index.
 * @param {string} toolName
 * @param {object} input
 * @param {{ pluginRoot?: string, registry?: object }} [ctx]
 */
export function invokeGraphMemoryTool(toolName, input = {}, ctx = {}) {
  assertReadOnlyTool(toolName, input);

  const vaultId = String(input.vaultId || '');
  if (!vaultId) {
    const err = new Error('vaultId required');
    err.code = 'VAULT_ID';
    throw err;
  }

  const vault = resolveVaultRoot(vaultId, {
    pluginRoot: ctx.pluginRoot,
    registry: ctx.registry,
  });

  if (toolName === 'graph_memory_status') {
    const index = loadIndex(vault.root);
    if (!index) {
      return {
        ok: true,
        tool: toolName,
        vaultId: vault.id,
        status: {
          mode: 'missing',
          local_ai: 'unknown',
          embeddings: 'missing',
          graph_backend: 'file-json',
          graphiti: 'unavailable',
          pgvector: 'unavailable',
          warnings: ['index missing — run: node scripts/graph-memory.mjs rebuild --vault <id>'],
        },
      };
    }
    return { ok: true, tool: toolName, vaultId: vault.id, status: index.status, built_at: index.built_at };
  }

  const index = loadIndex(vault.root);
  if (!index) {
    const err = new Error('graph-memory index missing — rebuild first');
    err.code = 'INDEX_MISSING';
    throw err;
  }

  switch (toolName) {
    case 'search_context':
      return {
        ok: true,
        tool: toolName,
        vaultId: vault.id,
        hits: searchIndex(index, String(input.query || ''), {
          limit: input.limit,
          queryEmbedding: input.queryEmbedding,
        }),
      };
    case 'get_context_item':
      return {
        ok: true,
        tool: toolName,
        vaultId: vault.id,
        item: getContextItem(index, String(input.id || input.source_path || '')),
      };
    case 'related_items':
      return {
        ok: true,
        tool: toolName,
        vaultId: vault.id,
        hits: relatedItems(index, String(input.source_path || input.id || ''), input.limit),
      };
    case 'check_conflicts':
      return {
        ok: true,
        tool: toolName,
        vaultId: vault.id,
        conflicts: checkConflicts(index, input.limit),
      };
    case 'recent_changes':
      return {
        ok: true,
        tool: toolName,
        vaultId: vault.id,
        hits: recentChanges(index, input.limit),
      };
    default: {
      const err = new Error(`Unhandled tool: ${toolName}`);
      err.code = 'TOOL_FORBIDDEN';
      throw err;
    }
  }
}

/**
 * Delete index dir (for rebuild-from-scratch tests).
 * @param {string} vaultRoot
 */
export function wipeGraphMemoryIndex(vaultRoot) {
  const dir = join(vaultRoot, 'docs', 'generated', 'graph-memory');
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
}

/**
 * List vault ids from the allow-list (CLI helpers).
 */
export function listAllowedVaultIds(opts = {}) {
  const map = buildAllowedVaultMap(opts);
  return [...map.values()].map((v) => v.id);
}
