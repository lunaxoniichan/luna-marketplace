/**
 * Knowledge dedupe — lexical keyword pass (read-only).
 * Contract: docs/specs/2026-07-19-dedupe-assistant-contract.md
 */
import { createHash } from 'node:crypto';
import { isExcludedKnowledgePath } from './util.mjs';

export const DEFAULT_THRESHOLD = 0.45;
export const MAX_ITEMS = 2000;
export const MAX_CANDIDATE_PAIRS = 50000;
export const MAX_CLUSTERS = 100;

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'of',
  'to',
  'for',
  'in',
  'on',
  'is',
  'are',
  'be',
  'as',
  'by',
  'at',
  'it',
  'its',
  'with',
  'from',
  'this',
  'that',
  'into',
  'via',
  'not',
  'no',
  'do',
  'does',
  'if',
  'than',
  'then',
  'so',
  'such',
  'only',
  'also',
  'can',
  'may',
  'will',
  'when',
  'where',
  'which',
  'who',
  'what',
  'how',
  'why',
  'all',
  'any',
  'each',
  'per',
  'vs',
]);

/**
 * @param {string} s
 * @returns {string[]}
 */
export function normalizeToken(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * @param {unknown} arr
 * @returns {string[]}
 */
export function normalizeKeywords(arr) {
  const out = new Set();
  if (!Array.isArray(arr)) return [];
  for (const k of arr) {
    for (const t of normalizeToken(String(k))) out.add(t);
  }
  return [...out].sort();
}

/**
 * @param {string[]} tokens
 * @returns {string[]}
 */
export function shingles(tokens) {
  if (!tokens || tokens.length < 2) return [];
  const out = new Set();
  for (let i = 0; i < tokens.length - 1; i++) {
    out.add(`${tokens[i]}|${tokens[i + 1]}`);
  }
  return [...out].sort();
}

/**
 * @param {Set<string>|string[]} a
 * @param {Set<string>|string[]} b
 */
export function jaccard(a, b) {
  const A = a instanceof Set ? a : new Set(a);
  const B = b instanceof Set ? b : new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * @param {string} path
 * @param {string} [excerpt]
 */
/** Alias — canonical impl in util.mjs (shared with graph-memory). */
export const isExcludedPath = isExcludedKnowledgePath;

/**
 * @param {Array<object>} items
 */
export function filterCorpus(items) {
  return (items || []).filter((it) => !isExcludedPath(it.path, it.excerpt));
}

/**
 * @param {object} item
 */
function prepareItem(item, index) {
  const keywords = normalizeKeywords(item.keywords);
  const titleTokens = normalizeToken(item.title);
  const excerptTokens = normalizeToken(item.excerpt).slice(0, 80);
  return {
    index,
    project_id: item.project_id,
    path: item.path,
    kind: item.kind,
    title: item.title,
    keywords,
    kwSet: new Set(keywords),
    titleTokens,
    titleSet: new Set(titleTokens),
    excerptTokens,
    shingleSet: new Set(shingles(excerptTokens)),
  };
}

class UnionFind {
  constructor(n) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = Array(n).fill(0);
  }
  find(x) {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a, b) {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    if (this.rank[ra] === this.rank[rb]) this.rank[ra]++;
  }
}

/**
 * @param {ReturnType<typeof prepareItem>[]} prepared
 * @param {{ threshold?: number, maxCandidatePairs?: number }} [opts]
 */
function scorePairs(prepared, opts = {}) {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const maxPairs = opts.maxCandidatePairs ?? MAX_CANDIDATE_PAIRS;
  const n = prepared.length;
  // Floor 2 so a shared keyword can still form a pair on small corpora
  // (floor(0.4*3)=1 would otherwise drop every overlapping keyword).
  const dfMax = Math.max(2, Math.floor(n * 0.4));

  /** @type {Map<string, number[]>} */
  const inv = new Map();
  for (const p of prepared) {
    for (const kw of p.keywords) {
      if (!inv.has(kw)) inv.set(kw, []);
      inv.get(kw).push(p.index);
    }
  }

  /** @type {Map<string, { i: number, j: number, shared: number }>} */
  const cand = new Map();
  for (const [kw, idxs] of inv) {
    if (idxs.length > dfMax) continue;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = Math.min(idxs[a], idxs[b]);
        const j = Math.max(idxs[a], idxs[b]);
        const key = `${i}:${j}`;
        const prev = cand.get(key);
        if (prev) prev.shared += 1;
        else cand.set(key, { i, j, shared: 1 });
      }
    }
  }

  // Sparse fallback: title token pairs
  /** @type {Map<string, number[]>} */
  const titleInv = new Map();
  for (const p of prepared) {
    if (p.keywords.length > 0) continue;
    for (const t of p.titleTokens) {
      if (!titleInv.has(t)) titleInv.set(t, []);
      titleInv.get(t).push(p.index);
    }
  }
  for (const idxs of titleInv.values()) {
    if (idxs.length > dfMax) continue;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = Math.min(idxs[a], idxs[b]);
        const j = Math.max(idxs[a], idxs[b]);
        const key = `${i}:${j}`;
        if (!cand.has(key)) cand.set(key, { i, j, shared: 0 });
      }
    }
  }

  let candidates = [...cand.values()];
  candidates.sort((a, b) => {
    if (b.shared !== a.shared) return b.shared - a.shared;
    const pa = prepared[a.i];
    const pb = prepared[a.j];
    const qa = prepared[b.i];
    const qb = prepared[b.j];
    const ka = `${pa.project_id}\0${pa.path}\0${pb.project_id}\0${pb.path}`;
    const kb = `${qa.project_id}\0${qa.path}\0${qb.project_id}\0${qb.path}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  let truncatedPairs = false;
  if (candidates.length > maxPairs) {
    candidates = candidates.slice(0, maxPairs);
    truncatedPairs = true;
  }

  /** @type {Array<object>} */
  const emitted = [];
  for (const { i, j, shared } of candidates) {
    const A = prepared[i];
    const B = prepared[j];
    const bothHaveKw = A.keywords.length >= 1 && B.keywords.length >= 1;
    if (bothHaveKw) {
      if (shared < 1) continue;
    } else {
      const titleInter = [...A.titleSet].filter((t) => B.titleSet.has(t)).length;
      let titleBigram = 0;
      const shA = new Set(shingles(A.titleTokens));
      for (const s of shingles(B.titleTokens)) if (shA.has(s)) titleBigram++;
      if (titleInter < 2 && titleBigram < 1) continue;
    }

    const kwJ = jaccard(A.kwSet, B.kwSet);
    const ttJ = jaccard(A.titleSet, B.titleSet);
    const shJ = jaccard(A.shingleSet, B.shingleSet);
    const score = Math.max(kwJ, 0.6 * ttJ + 0.4 * shJ);
    if (score < threshold) continue;

    const shared_keywords = [...A.kwSet].filter((k) => B.kwSet.has(k)).sort();
    emitted.push({
      i,
      j,
      score,
      why: {
        shared_keywords,
        keyword_jaccard: kwJ,
        title_token_jaccard: ttJ,
        shingle_jaccard: shJ,
        score,
      },
    });
  }

  return { emitted, truncatedPairs };
}

/**
 * @param {Array<object>} items
 * @param {{
 *   scope: { mode: string, vaultId: string },
 *   generatedAt?: string,
 *   threshold?: number,
 *   maxItems?: number,
 *   maxCandidatePairs?: number,
 *   maxClusters?: number,
 *   projectId?: string,
 * }} opts
 */
export function buildReport(items, opts) {
  const scope = opts?.scope || { mode: 'vault', vaultId: '' };
  const threshold = opts?.threshold ?? DEFAULT_THRESHOLD;
  const maxItems = opts?.maxItems ?? MAX_ITEMS;
  const maxClusters = opts?.maxClusters ?? MAX_CLUSTERS;

  let filtered = filterCorpus(items);
  if (scope.mode === 'vault' && scope.vaultId) {
    filtered = filtered.filter((it) => it.project_id === scope.vaultId);
  } else if (scope.mode === 'vault+plugin' && scope.vaultId && opts.pluginProjectId) {
    filtered = filtered.filter(
      (it) => it.project_id === scope.vaultId || it.project_id === opts.pluginProjectId,
    );
  }
  // registry: keep all filtered

  filtered = [...filtered].sort((a, b) => {
    const ka = `${a.project_id}\0${a.path}`;
    const kb = `${b.project_id}\0${b.path}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  let truncated = false;
  if (filtered.length > maxItems) {
    filtered = filtered.slice(0, maxItems);
    truncated = true;
  }

  const prepared = filtered.map((it, idx) => prepareItem(it, idx));
  // Fix index to match array position after prepare
  for (let i = 0; i < prepared.length; i++) prepared[i].index = i;

  const { emitted, truncatedPairs } = scorePairs(prepared, {
    threshold,
    maxCandidatePairs: opts?.maxCandidatePairs ?? MAX_CANDIDATE_PAIRS,
  });
  if (truncatedPairs) truncated = true;

  const uf = new UnionFind(prepared.length);
  /** @type {Map<string, object>} bestWhy per undirected edge key inside component tracking */
  const pairMeta = [];
  for (const e of emitted) {
    uf.union(e.i, e.j);
    pairMeta.push(e);
  }

  /** @type {Map<number, number[]>} */
  const groups = new Map();
  for (let i = 0; i < prepared.length; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }

  /** @type {Array<object>} */
  let clusters = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const memberSet = new Set(members);
    let best = null;
    for (const e of pairMeta) {
      if (!memberSet.has(e.i) || !memberSet.has(e.j)) continue;
      if (
        !best ||
        e.score > best.score ||
        (e.score === best.score &&
          `${prepared[e.i].path}\0${prepared[e.j].path}` <
            `${prepared[best.i].path}\0${prepared[best.j].path}`)
      ) {
        best = e;
      }
    }
    if (!best) continue;

    const clusterItems = members
      .map((idx) => {
        const p = prepared[idx];
        return {
          project_id: p.project_id,
          path: p.path,
          kind: p.kind,
          title: p.title,
        };
      })
      .sort((a, b) => {
        const ka = `${a.project_id}\0${a.path}`;
        const kb = `${b.project_id}\0${b.path}`;
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });

    const idSeed = clusterItems.map((it) => `${it.project_id}:${it.path}`).join('\n');
    const id =
      'c-' + createHash('sha256').update(idSeed, 'utf8').digest('hex').slice(0, 12);

    clusters.push({
      id,
      score: best.score,
      items: clusterItems,
      why: best.why,
      signals: [{ kind: 'lexical_keyword', version: 1, score: best.score }],
    });
  }

  clusters.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const amin = a.items[0] ? `${a.items[0].project_id}\0${a.items[0].path}` : '';
    const bmin = b.items[0] ? `${b.items[0].project_id}\0${b.items[0].path}` : '';
    return amin < bmin ? -1 : amin > bmin ? 1 : 0;
  });

  if (clusters.length > maxClusters) {
    clusters = clusters.slice(0, maxClusters);
    truncated = true;
  }

  return {
    version: 1,
    generated_at: opts?.generatedAt || new Date().toISOString(),
    scope: {
      mode: scope.mode,
      vaultId: scope.vaultId,
    },
    corpus: {
      item_count: (items || []).length,
      compared_count: prepared.length,
      truncated,
    },
    clusters,
  };
}
