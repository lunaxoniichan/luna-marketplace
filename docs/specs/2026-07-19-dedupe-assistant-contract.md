---
title: Dedupe assistant — knowledge overlap (keyword pass) contract
scope: project
type: spec
lifecycle: official
status: active
keywords: [dedupe, knowledge, overlap, keyword, studio, Task5]
related:
  - docs/plans/2026-07-18-luna-studio.md
  - docs/specs/2026-07-18-vault-crud-contract.md
  - docs/specs/2026-07-18-studio-server-actions-contract.md
  - docs/specs/2026-07-19-fleet-sync-contract.md
  - docs/specs/2026-07-18-sync-agent-views-contract.md
  - templates/docs/FRONTMATTER.md
updated: 2026-07-19
---

# Contract — dedupe assistant (Task 5, lexical keyword pass)

> **Status:** ACTIVE (Task 5 / phase-2) — signed off 2026-07-19.
> Implements Luna Studio Phase 2 sub-task 5: surface overlapping / near-duplicate
> **knowledge** (docs, canonical rules, memory) as candidate clusters for human review.
> Semantic (embeddings) is deferred to Phase 3 and must plug into the same output shape.

## 1. Purpose / scope honesty

**v1:** a **read-only** assistant that, given a scoped knowledge corpus, emits
**candidate clusters** of overlapping items using a deterministic **lexical / keyword**
pass. The human consolidates by editing in the existing vault editor (CRUD / merge /
lifecycle). v1 never writes vault files, never commits, and never auto-merges.

**Non-goals:**

| Out of v1 | Owner / when |
|-----------|--------------|
| Semantic / embedding similarity (bge-m3 + pgvector cosine) | Phase 3 — additive signal (§8) |
| Auto-merge / destructive consolidation | Never in this assistant; human + vault CRUD |
| Code-clone detection | `jscpd` + `dedupe-guard` (§2) — no shared surface |
| Whole-registry default scan | Optional later; v1 default is per-vault (§5) |
| Cross-project “find where I solved this” product UX | Phase 4 reuse search |

## 2. 🔴 Boundary vs jscpd / dedupe-guard

| Surface | What it detects | When | Mutates? |
|---------|-----------------|------|----------|
| **`jscpd` + `dedupe-guard`** | **Code** clones (JS/TS/… source) | Pre-commit (staged) / `review-simplify` | No (warn) |
| **Task 5 dedupe assistant** | **Knowledge content** overlap (markdown docs / rules / memory) | On-demand in Studio / CLI report | No (v1 report only) |

**Rules:**

1. Do **not** invoke `jscpd`, `npm run jscpd*`, or `dedupe-guard` from the dedupe assistant.
2. Do **not** share thresholds, indexes, or report schemas with jscpd.
3. Do **not** change `scripts/hooks/dedupe-guard.js` or `.jscpd.json` as part of Task 5.
4. Docs and UI copy must say **“knowledge overlap”** / **“Dedupe”** in the Studio sense —
   never imply this replaces code-clone detection.

## 3. 🔴 Corpus hygiene — canonical only

### 3.1 Problem

`scripts/build-knowledge.mjs` today walks **`.claude/rules/`** for `kind: rule`. Those
files are **generated agent views** of plugin (or local) `rules/*.md`. Pairing a
generated mirror with its canonical source is a **false duplicate** on every sync.

### 3.2 Decision (load-bearing)

Dedupe (and the knowledge corpus it consumes) MUST index **canonical** knowledge only:

| Include | Path examples | Notes |
|---------|---------------|-------|
| Canonical rules | `rules/*.md` | Fleet source on plugin; optional local experiments on consumers |
| Docs | `docs/**/*.md` except exclusions below | Specs, plans, decisions, architecture, pre/post buckets |
| Memory | `memory/**/*.md`, `.claude/memory/**/*.md` | Project / user memory |
| Agent-owned lessons | `.claude/rules/lessons.md` only | Protected from sync; still real knowledge |

| Exclude (always) | Why |
|------------------|-----|
| `.claude/rules/**` except `lessons.md` | Generated Claude views (`luna:generated` / fleet) |
| `.cursor/rules/**` | Generated Cursor views |
| `docs/generated/**` | Rebuildable indexes |
| `docs/_archive/**` | Git-history only |
| Any file whose body contains `luna:generated` / `GENERATED_MARKER` | Belt-and-suspenders if a generated file lands under an include prefix |
| Paths vault CRUD already forbids as generated trees | Same wall as `assertAllowedPath` `PATH_GENERATED` |

**Protected basenames** (`lessons.*`, `RULES.*`, `*.local.*`, `luna.mdc`) are **not**
excluded from the corpus — they are protected from **sync overwrite**, not from overlap
reporting. `lessons.md` is explicitly included; `RULES.md` / `*.local.*` if present under
an include prefix are eligible.

### 3.3 Knowledge builder change (prerequisite)

Task 5 implementation **must** amend `scripts/build-knowledge.mjs` `collectScope`:

1. Walk **`rules/`** (not `.claude/rules/`) for `kind: rule`.
2. Keep the existing **lessons.md** special-case under `.claude/rules/lessons.md`.
3. Continue skipping `_archive/` and `generated/`.
4. Optionally stamp each item with `canonical: true` (informational; filter still path-based).

Dedupe lib MUST also apply the §3.2 exclude filter at report time so a stale
`knowledge.json` cannot reintroduce mirror↔source false positives.

### 3.4 Identity key

Cluster members are identified by `{ project_id, path }` (posix, vault-relative).
Never compare absolute machine paths.

## 4. Keyword-pass algorithm (deterministic + explainable)

### 4.1 Inputs per item

From `knowledge.json` (post-§3.3) plus optional body tokens for scoring:

| Field | Use |
|-------|-----|
| `keywords[]` | Primary set for Jaccard + inverted index |
| `title` | Tokenized for title overlap |
| `excerpt` (aka summary) | Token / shingle overlap when keywords are sparse |
| `kind`, `path`, `project_id` | Filtering, display, identity |

v1 does **not** re-read full file bodies for scoring (keeps the pass cheap and hermetic
off fixtures). Tests may supply richer `excerpt` strings. A future opt-in “deep body”
mode is out of scope.

### 4.2 Normalization

```
normalizeToken(s):
  lower-case; replace [^a-z0-9]+ with space; split; drop empty;
  drop tokens length < 2; drop STOPWORDS (a,an,the,and,or,of,to,for,in,on,is,…)
normalizeKeywords(arr): unique sorted normalizeToken of each keyword string
titleTokens(title): normalizeToken(title)
excerptTokens(excerpt): normalizeToken(excerpt).slice(0, 80)   # cap
shingles(tokens): set of consecutive bigrams "t_i|t_{i+1}" (empty if <2 tokens)
```

### 4.3 Inverted index (prune before N²)

Build `keyword → sorted list of itemIndex` for every normalized keyword with
**document frequency ≤ DF_MAX** where
`DF_MAX = max(2, floor(0.4 × corpusSize))`
(floor of 2 so small fixtures can still form pairs; `floor(0.4×3)=1` would
drop every overlapping keyword).

**Candidate pair** iff two items share **≥ K_MIN shared keywords** where:

| Condition | `K_MIN` |
|-----------|---------|
| Both have ≥1 keyword after normalize | **1** |
| Else (sparse keywords) | fall back: share ≥ **2** title tokens **or** ≥ **1** title bigram |

Items with **zero** keywords and **zero** title tokens are skipped (unscorable).

Hard caps (§5): after prune, if candidate-pair count would exceed `MAX_CANDIDATE_PAIRS`,
keep pairs ordered by `(sharedKeywordCount desc, itemA path asc, itemB path asc)` and
truncate — still deterministic.

### 4.4 Pair score

For candidate pair `(A, B)`:

```
kwJ  = |KwA ∩ KwB| / |KwA ∪ KwB|     # 0 if both empty (should not reach here)
ttJ  = |TitleA ∩ TitleB| / |TitleA ∪ TitleB|   # 0 if either empty
shJ  = |ShA ∩ ShB| / |ShA ∪ ShB|               # from excerptTokens shingles; 0 if either empty

score = max(kwJ, 0.6 * ttJ + 0.4 * shJ)
```

**Emit pair** when `score ≥ THRESHOLD` where **`THRESHOLD = 0.45`** (fixed in v1;
overridable only in tests via lib option, not Studio UI).

`why` for the pair (rolled into cluster — §6):

```
{
  shared_keywords: sorted(KwA ∩ KwB),
  keyword_jaccard: kwJ,
  title_token_jaccard: ttJ,
  shingle_jaccard: shJ,
  score
}
```

### 4.5 Clustering

Union-find over emitted pairs. Cluster `score` = **max** pairwise score inside the
component. Cluster `why` = the **argmax** pair’s `why` (ties: lexicographically smaller
`(pathA, pathB)`).

Determinism:

1. Sort corpus items by `(project_id, path)` before indexing.
2. Enumerate candidate pairs with `i < j` in that order.
3. Emit clusters sorted by `(score desc, min(project_id+path) asc)`.
4. Within a cluster, sort items by `(project_id, path)`.
5. Same filtered input → **byte-identical** JSON report (stable key order in serializers).

**No ML, no randomness, no wall-clock in the score.**

## 5. Scope + caps

### 5.1 v1 default scope — **per-vault**

| Mode | Meaning | v1 |
|------|---------|----|
| **`vault`** | Items whose `project_id` matches the open Studio vault (plugin or selected project) | **Default** |
| `vault+plugin` | Selected project vault **plus** plugin/user-scope items | Optional flag; not default |
| `registry` | All items in `knowledge.json` | **Out of v1 UI**; CLI may support behind `--scope registry` for dogfood only |

Rationale: registry-wide N² and cross-project product UX belong to Phase 3/4; per-vault
matches the VaultWorkspace surface and keeps acceptance fixtures small.

### 5.2 Caps

| Cap | Default | Behavior when exceeded |
|-----|---------|------------------------|
| `MAX_ITEMS` | **2000** | Deterministic truncate: keep first 2000 by `(project_id, path)`; report `truncated: true` |
| `MAX_CANDIDATE_PAIRS` | **50000** | Truncate per §4.3; `truncated: true` |
| `MAX_CLUSTERS` | **100** | Return top 100 by cluster score; `truncated: true` |

Gateway reject unknown scope strings (`SCOPE_INVALID`).

## 6. Output shape — candidates for human review (semantic-extensible)

### 6.1 Report DTO

```ts
type DedupeReport = {
  version: 1;
  generated_at: string;          // ISO — display only; tests may freeze via inject
  scope: { mode: "vault" | "vault+plugin" | "registry"; vaultId: string };
  corpus: { item_count: number; compared_count: number; truncated: boolean };
  clusters: DedupeCluster[];
};

type DedupeCluster = {
  id: string;                    // stable: "c-" + sha256(sorted identities).slice(0, 12)
  score: number;                 // 0..1
  items: Array<{
    project_id: string;
    path: string;
    kind: string;
    title: string;
  }>;
  why: {
    shared_keywords: string[];
    keyword_jaccard: number;
    title_token_jaccard: number;
    shingle_jaccard: number;
    score: number;
  };
  /** Additive signal bag — mirror fleet `origin` discipline */
  signals: DedupeSignal[];
};

type DedupeSignal =
  | {
      kind: "lexical_keyword";
      version: 1;
      score: number;
    }
  | {
      kind: "semantic_embedding";   // Phase 3 only — must not appear in v1
      version: 1;
      model: string;                // e.g. "bge-m3"
      score: number;                // cosine similarity
    };
```

v1 **always** emits exactly one signal per cluster: `{ kind: "lexical_keyword", version: 1, score }`.
Phase 3 **appends** a `semantic_embedding` signal and may raise cluster `score` via a
documented combine function later — **without** changing `items[]` / `why` lexical fields
or renaming `signals[]`.

### 6.2 Mutation policy

| Action | v1 |
|--------|----|
| Emit report | Yes |
| Write / delete / merge vault files | **No** |
| Call vault CRUD / lifecycle / sync apply | **No** from the assistant |
| UI “Open in editor” | Yes — navigates to existing VaultWorkspace selection |

Consolidation the user chooses uses **existing** vault CRUD (`scripts/lib/vault-crud.mjs`
/ gateway) only. No parallel mutation path.

## 7. Studio surface

### 7.1 Placement

New **Dedupe** tab on `VaultWorkspace` (alongside Memory / Rules / Docs / Sync), scoped to
the current `vaultId`.

### 7.2 UX (read-only)

1. On tab focus (or explicit **Refresh**): call read-only gateway → list clusters.
2. Each row: **score**, member **paths** (+ titles), compact **why** (shared keywords).
3. Expand / select cluster → side preview: excerpts (from knowledge items) + simple
   side-by-side text of the two highest-scoring members’ excerpts (not a full git diff).
4. Each path is a link/button that switches to the appropriate vault tab and `vaultRead`s
   that file in the existing editor (Rules / Docs / Memory).
5. Banner: “Candidates for review — consolidate in the editor. No auto-merge.”
6. Empty state when zero clusters above threshold.
7. Show `truncated` warning when caps hit.

No apply / merge / delete controls on this tab in v1.

### 7.3 Gateway

```
vaultDedupeReport({ vaultId, scopeMode?: "vault" | "vault+plugin" })
  → { ok, report: DedupeReport } | { ok: false, error }
```

- Read-only; no `planToken`; no mutex required for mutation (optional short read lock is
  unnecessary in v1).
- Loads `docs/generated/knowledge.json` from the **plugin** root (same as
  `loadKnowledge()`), filters to scope, runs lib, returns DTO.
- Reuses vault allow-list (`resolveVaultRoot` / `vaultId`); never accepts client roots.
- Unknown keys rejected (same gateway hygiene as other ops).

## 8. Semantic deferral honesty (additive-later)

| Layer | v1 | Phase 3 |
|-------|----|---------|
| Lexical keyword pass | Required | Remains |
| `signals[].kind = lexical_keyword` | Required | Remains |
| Embeddings / pgvector / Graphiti | Absent | **Add** `semantic_embedding` signal |
| Cluster DTO (`items`, `why`, `signals`) | Stable | Stable — no redesign |
| Auto-merge | Forbidden | Still forbidden unless a later explicit product decision |

Mirror of fleet contract’s `origin: "plugin" | "project"` discipline: record the signal
**kind** now so later retrieval modes are additive entries in `signals[]`, not a fork of
the report schema.

## 9. Library / CLI / UI sketch

```
scripts/lib/knowledge-dedupe.mjs   # NEW — filterCorpus, buildInvertedIndex, scorePairs, cluster, buildReport
scripts/knowledge-dedupe.mjs       # CLI: --vault-id | --scope | --check-fixture
scripts/build-knowledge.mjs        # §3.3 canonical rules/ walk
scripts/lib/vault-gateway.mjs      # vaultDedupeReport (read-only)
studio/src/app/actions/vault.ts    # thin server action
studio/src/components/…            # DedupePanel or VaultWorkspace tab
tests/scripts/knowledge-dedupe.test.mjs
```

Reuse: `loadKnowledge` / knowledge JSON shape, gateway allow-list + `normalizeError`,
VaultWorkspace navigation patterns. **Do not** reuse jscpd.

## 10. Acceptance (Task 5 gate — not clean-only)

Hermetic tests + `npm run studio:typecheck` clean. **No** `jscpd` invocation in the
feature path or its tests.

- [x] Fixture corpus with **2 known-overlapping** docs (shared keywords + similar
      titles/excerpts) → they appear in **one** cluster above threshold
- [x] Unrelated docs (disjoint keywords, dissimilar titles) → **not** clustered together
- [x] Generated `.claude/rules/<name>.md` mirror is **not** flagged against canonical
      `rules/<name>.md` (corpus hygiene §3)
- [x] Same input → **identical** cluster ids / membership / scores (determinism)
- [x] Report path performs **zero** file mutation (no vault write, no commit, no
      knowledge.json rewrite from the assistant)
- [x] Output shape includes `signals: [{ kind: "lexical_keyword", … }]` and documents
      Phase-3 `semantic_embedding` as additive (§6 / §8)
- [x] Studio **Dedupe** view renders clusters (score + paths + why) and links into the
      vault editor
- [x] `npm run studio:typecheck` clean
- [x] Hermetic unit/lib tests (fixture knowledge items; no live registry required)
- [x] No jscpd / dedupe-guard changes or calls

## 11. Out of scope

- Embedding / TEI / pgvector / Graphiti wiring
- Auto-merge, auto-delete, or “apply consolidation” wizards
- Changing `dedupe-guard` or jscpd config
- Registry-wide default UI scan
- Full-body deep read scoring
- Playwright E2E (hermetic + typecheck sufficient for this gate)

## File index

| Ref | Path |
|-----|------|
| This contract | `docs/specs/2026-07-19-dedupe-assistant-contract.md` |
| Studio plan | `docs/plans/2026-07-18-luna-studio.md` |
| Knowledge builder | `scripts/build-knowledge.mjs` |
| Dedupe lib | `scripts/lib/knowledge-dedupe.mjs` |
| Dedupe CLI | `scripts/knowledge-dedupe.mjs` |
| Vault CRUD | `docs/specs/2026-07-18-vault-crud-contract.md` / `scripts/lib/vault-crud.mjs` |
| Gateway | `docs/specs/2026-07-18-studio-server-actions-contract.md` / `scripts/lib/vault-gateway.mjs` |
| Fleet / generated views | `docs/specs/2026-07-19-fleet-sync-contract.md` / `scripts/lib/agent-views.mjs` |
| jscpd boundary (reference) | `docs/specs/code-intelligence-tools-comparison.md` |
| Studio vault UI | `studio/src/components/VaultWorkspace.tsx` |
| Studio dedupe UI | `studio/src/components/DedupePanel.tsx` |
| Tests | `tests/scripts/knowledge-dedupe.test.mjs`, `tests/scripts/build-knowledge-canonical.test.mjs`, `tests/studio/vault-gateway.test.mjs` |
