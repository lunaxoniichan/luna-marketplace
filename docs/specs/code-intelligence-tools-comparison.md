# GitNexus vs codebase-memory-mcp vs CodeGraph: Research Report

*Generated: 2026-06-17 | Sources: 24 | Confidence: **High** for Luna recommendation; **Medium** for third-party benchmark claims*

> **Audience:** Vibe-coding cleanup — prevent duplicate code during new work, refactor an accumulated codebase, and remove dead/legacy code.  
> **Context:** Luna Agent Kit already integrates **GitNexus + jscpd** with hooks, rules, and skills. This report answers whether adding **codebase-memory-mcp** or **CodeGraph** on top would help those three problems or add noise.

**Implementation status (2026-06-17):** §6.2 steps 3–5 implemented — `.jscpd.json` + `package.json` jscpd pin, `dev-refactor` skill, `refactor-cleaner` agent, `refactor` workflow variant, tightened diff-scoped `review-simplify`. **0.2.1:** submodule hooks (`gitnexus-submodule-advisory`, `gitnexus-submodule-sync`), monorepo playbook, freshness gate extended to `rename`/`group_query`.

---

## Executive Summary

For the three vibe-coding pain points (prevent duplication during new work, refactor accumulated mess, clean up dead code), **the existing Luna stack — GitNexus + jscpd + Luna hooks/skills — is already the right primary toolchain**. Adding a second code-intelligence MCP (codebase-memory-mcp or CodeGraph) would mostly **duplicate indexing, inflate agent context with overlapping tools, and create “which tool do I call?” friction** without solving the gaps that actually block you (OOP judgment, file-size heuristics, behavioral safety).

**Per-problem winners:**

| Problem | Best tool(s) | Why |
|---------|--------------|-----|
| **1. Prevention (understand before write)** | **GitNexus `query` / `group_query` + `codebase-awareness` rule + `dedupe-guard` (jscpd)** | Proactive semantic discovery + reactive clone floor; Luna already wires this |
| **2. Refactoring (merge dupes, reshape modules)** | **GitNexus `impact` + `rename` + `detect_changes` + processes + `review-simplify`** | Only stack with coordinated multi-file rename and process-grouped blast radius |
| **3. Cleanup (dead/legacy code)** | **GitNexus `impact`/Cypher + tests**; optional **one-off** codebase-memory-mcp dead-code scan | GitNexus has no dedicated dead-code MCP tool; CBM has explicit dead-code detection but overlaps 80%+ elsewhere |

**Recommendation for luna-marketplace:** **Keep GitNexus + jscpd. Do not add CBM or CodeGraph as permanent MCP servers.** Index `luna-marketplace` with GitNexus, run a structured refactor/cleanup initiative using existing Luna skills, and only consider CBM as an **occasional CLI audit** for dead-code candidates — not a second always-on MCP.

---

## 0. Luna Agent Kit — What You Already Have

Exploration of `/home/l/REPOS/PROJECTS/luna-marketplace` shows a deliberate, problem-targeted stack ([TOOLS_LIST.md](../TOOLS_LIST.md) § "Code-intelligence tooling — audit"):

| Layer | Component | Role for your 3 problems |
|-------|-----------|--------------------------|
| **Proactive discovery** | `codebase-awareness` rule (`.cursor/rules/codebase-awareness.mdc`) | Forces `query` / `context` / `impact` (or `group_query` multi-module) **before writing new code** |
| **Freshness** | `gitnexus-freshness` hook | Fail-closed stale-read gate; sync reindex before GitNexus reads |
| **Post-commit index** | `gitnexus-post-commit` hook | Async `gitnexus analyze` after commit/merge |
| **Reactive clones** | `dedupe-guard` hook (`scripts/hooks/dedupe-guard.js`) | jscpd on **staged** files before `git commit` (advisory, warn-only) |
| **Deep cleanup skill** | `review-simplify` | Full jscpd + GitNexus semantic `query`/`group_query` pass |
| **Refactor skills** | `gitnexus-refactoring`, `gitnexus-impact-analysis`, `gitnexus-exploring` | Impact → rename → verify workflow |
| **Deterministic dupes** | jscpd (via `doc-init` `.jscpd.json`) | Copy-paste and near-clone detection across 150+ langs |

**Operational note:** GitNexus MCP currently indexes other repos (`flynance-main`, `data-pipeline`, etc.) but **`luna-marketplace` itself is not indexed** until you run `gitnexus analyze` in that repo (creates `.gitnexus/`). The freshness hooks only activate once `.gitnexus/` exists.

---

## 1. Tool Profiles (disambiguated)

### 1.1 GitNexus ([abhigyanpatwari/GitNexus](https://github.com/abhigyanpatwari/GitNexus))

**What it is:** MCP-native code intelligence engine. Indexes repos into a knowledge graph (LadybugDB), exposes tools + lightweight MCP resources.

**Graph model:** Nodes — File, Function, Class, Interface, Method, Community, Process. Edges — CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS.

**Differentiators for vibe-coding:**
- **Process-grouped search** — `query` returns execution flows (call chains), not just symbol hits
- **Coordinated `rename`** — multi-file rename with confidence-tagged edits (graph + AST search)
- **Multi-repo `group_query`** — RRF merge across product groups (your `flynance-main` + `data-pipeline` pattern)
- **Clusters/communities** — Leiden clustering with cohesion scores
- **MCP resources** — `gitnexus://repo/{name}/processes`, `/clusters`, `/schema` (~100–500 tokens)

**Indexing:** Tree-sitter native bindings; hybrid BM25 + semantic vector + RRF for `query`. Embeddings optional (indexed repos in this environment show `embeddings: 0` — keyword/graph-heavy mode still works).

**Luna fit:** Deepest — hooks adapted from flynance, skills reused not re-authored, `Plan:` traceability separate from graph layer.

### 1.2 codebase-memory-mcp ([DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp))

**What it is:** Single static C binary MCP server. SQLite knowledge graph, 158 tree-sitter grammars, **Hybrid LSP** type resolution for 9 language families.

**Graph model:** Richer node set (Project, Package, Route, Resource, …) and edge set (HTTP_CALLS, DATA_FLOWS, SIMILAR_TO, CROSS_*, EMITS/LISTENS_ON, …).

**Differentiators:**
- **Sub-ms queries**, extreme indexing speed (claims: Linux kernel in ~3 min)
- **Explicit dead-code detection** (~150 ms full-graph scan, zero inbound CALLS, entry-point aware)
- **`SIMILAR_TO` / `SEMANTICALLY_RELATED` edges** — MinHash near-clone + vocabulary-mismatch semantic relatedness
- **Team-shareable artifact** — `.codebase-memory/graph.db.zst` committed to repo
- **ADR tooling** — `manage_adr` for architectural decisions across sessions
- **Install mutates agent config** — auto-writes MCP entries, skills, PreToolUse hooks for 11 agents

**No built-in LLM** — MCP client translates natural language to tool calls ([README](https://github.com/DeusData/codebase-memory-mcp/blob/main/README.md)).

**Luna fit:** Would **conflict** with Luna's hook philosophy — CBM's installer adds its own PreToolUse hooks (Grep/Glob augmentation) alongside Luna's `gitnexus-freshness`, `dedupe-guard`, and bash guards. Two graph indexes, two hook ecosystems.

### 1.3 CodeGraph — disambiguation

"CodeGraph" refers to **multiple unrelated projects**. For AI coding agents / MCP, the relevant comparison is:

| Project | Relevance | Verdict |
|---------|-----------|---------|
| **[codegraph-ai/CodeGraph](https://github.com/codegraph-ai/CodeGraph)** | **Primary candidate** — 45 MCP tools, tree-sitter, Rust binary, VS Code extension | Compare here |
| **[safishamsi/graphify](https://github.com/safishamsi/graphify)** | Multimodal (PDFs, images, docs) + LLM semantic extraction; not code-structure-first | **Different problem** (organizational knowledge, not refactor) |
| **Sourcegraph Cody "code graph"** | Enterprise cross-repo search/nav; not a local MCP duplicate-detection stack | Out of scope |
| **FalkorDB / misc npm "codegraph"** | Various graph DB wrappers | Not agent-MCP peers |

**CodeGraph (codegraph-ai) summary:**
- **Community:** 42 tools — navigation, impact, complexity, PR context, docs verification, memory layer (RocksDB)
- **Pro (paid):** `find_unused_code`, `find_duplicates`, `find_similar`, security scanners — the features most relevant to **Problems 2 & 3** are **behind Pro**
- **Embeddings:** Full-body BGE embeddings by default; `--graph-only` for CI/structural-only
- **No coordinated rename tool** — impact/navigation yes, automated multi-file rename no

---

## 2. Problem-First Analysis

### Problem 1: Prevention during new work

*"AI keeps creating redundant functions; agents don't understand existing design before implementing."*

| Capability | GitNexus + Luna | codebase-memory-mcp | CodeGraph (community) |
|------------|-----------------|---------------------|------------------------|
| Semantic "does this already exist?" | **`query` + `group_query` (RRF)** | `semantic_query`, `search_graph` | `symbol_search`, `get_curated_context` |
| Execution-flow context | **Processes in `query` results** | `trace_path`, `get_architecture` | `get_call_graph`, `get_ai_context` |
| Forced pre-write discipline | **`codebase-awareness` rule + freshness hook** | Installer adds agent instructions + Grep hook | `codegraph-rules-for-agents` (separate repo) |
| Copy-paste clone catch | **jscpd + `dedupe-guard`** | `SIMILAR_TO` edge (index-time, not pre-commit) | **`find_duplicates` = Pro only** |
| Multi-module discovery | **`group_query`** | `CROSS_*` edges (multi-repo store) | `cross_project_search` = Pro |

**Winner: GitNexus + jscpd (already in Luna).**  
CBM's `SIMILAR_TO` is interesting but redundant with GitNexus `query` + jscpd for your workflow. CodeGraph community lacks duplicate detection; Pro adds it at cost + second index.

**What to do (no new tools):**
1. Run `gitnexus analyze` in every active repo (including `luna-marketplace`)
2. Enforce `codebase-awareness` — `group_query` before new modules in polyglot/monorepo work
3. Keep `dedupe-guard` on; consider periodic **full-repo** jscpd (not just staged) via `review-simplify`

### Problem 2: Refactoring existing vibe-coded codebase

*"Merge duplicate functions, OOP best practices, balance file size vs module count, clear responsibilities."*

| Capability | GitNexus + Luna | codebase-memory-mcp | CodeGraph |
|------------|-----------------|---------------------|-----------|
| Blast radius before edit | **`impact` (depth + confidence)** | `detect_changes`, `trace_path` | `analyze_impact` |
| Coordinated rename | **`rename` (dry_run → apply)** | ❌ No equivalent | ❌ No equivalent |
| Post-edit verification | **`detect_changes` → affected processes** | `detect_changes` | `pr_context`, `get_edit_context` |
| Find semantic duplicates | `query` / `group_query` + jscpd | **`SIMILAR_TO`, `SEMANTICALLY_RELATED`** | `find_duplicates` / `find_similar` (**Pro**) |
| Process/flow understanding | **Processes + MCP resources** | `trace_path`, routes | `find_hot_paths`, `get_call_graph` |
| Complexity / hotspots | Clusters (community cohesion) | `get_architecture` hotspots | **`analyze_complexity`** (community) |
| OOP / file-size judgment | ❌ | ❌ | ❌ (complexity metrics only) |

**Winner: GitNexus + `review-simplify` + `gitnexus-refactoring`.**  
The **`rename` tool** is the decisive advantage for refactoring vibe-coded duplication — neither CBM nor CodeGraph community offers coordinated multi-file symbol renames. CBM's similarity edges could *suggest* merge candidates but won't execute renames. CodeGraph's `analyze_complexity` is a useful **supplement** for finding god-functions but not worth a second MCP for that alone.

**Refactor batch workflow (see §6):** impact → pick canonical implementation → rename/consolidate → detect_changes → tests.

### Problem 3: Cleanup — dead code, legacy, safe deletion

| Capability | GitNexus + Luna | codebase-memory-mcp | CodeGraph |
|------------|-----------------|---------------------|-----------|
| Dead function detection | Cypher: zero inbound CALLS (manual) | **Built-in dead-code scan (~150ms)** | `find_unused_code` (**Pro**) |
| Unused imports | grep/IDE | `search_graph` / degree filters | `find_dead_imports` (community) |
| Legacy / unreachable | `impact` + process traces | `trace_path` inbound empty | Pro + git history mining (Pro) |
| Safe-delete confidence | Confidence on `impact` edges | Entry-point exclusion in dead-code | Confidence scoring (Pro) |
| Pre-delete blast radius | **`impact` upstream** | `detect_changes` / trace | `analyze_impact` |

**Winner: GitNexus for safe deletion workflow; CBM for discovery.**  
GitNexus doesn't ship a one-shot "dead code" MCP tool, but `impact` + Cypher covers the safety half. CBM's explicit dead-code detection is the **one feature** that could justify *occasional* use — as a **CLI audit**, not a permanent second MCP:

```bash
codebase-memory-mcp cli query_graph '{"query": "MATCH (f:Function) WHERE NOT EXISTS { (f)<-[:CALLS]-() } RETURN f.name LIMIT 50"}'
```

**Never delete on graph alone** — dynamic calls, reflection, framework entry points, and stringly-typed references fool all static graphs.

---

## 3. Feature Comparison Matrix (refactor/cleanup focused)

| Feature | GitNexus + jscpd (Luna) | codebase-memory-mcp | CodeGraph (community) | CodeGraph Pro |
|---------|-------------------------|---------------------|----------------------|---------------|
| **Duplicate detection (copy-paste)** | ✅ jscpd | ⚠️ `SIMILAR_TO` (different mechanism) | ❌ | ✅ `find_duplicates` |
| **Duplicate detection (semantic)** | ✅ `query` / `group_query` | ✅ `semantic_query`, `SEMANTICALLY_RELATED` | ⚠️ embeddings search | ✅ `find_similar` |
| **Dead code detection** | ⚠️ Cypher / manual | ✅ **Dedicated tool** | ❌ | ✅ `find_unused_code` |
| **Impact / blast radius** | ✅ `impact` + processes | ✅ `detect_changes` | ✅ `analyze_impact` | ✅ |
| **Coordinated rename** | ✅ **`rename`** | ❌ | ❌ | ❌ |
| **Process / flow understanding** | ✅ **Processes** | ⚠️ `trace_path` | ⚠️ call graph tools | ✅ |
| **Multi-repo** | ✅ **`group_query`, group contracts** | ✅ `CROSS_*` edges | ❌ (community) | ✅ `cross_project_search` |
| **Pre-commit hooks** | ✅ **`dedupe-guard` + freshness** | ⚠️ Installer hooks (Grep augment) | ❌ (rules only) | ❌ |
| **Complexity metrics** | ⚠️ indirect (clusters) | ⚠️ hotspots in architecture | ✅ `analyze_complexity` | ✅ |
| **OOP / SRP judgment** | ❌ | ❌ | ❌ | ❌ |
| **File size heuristics** | ❌ | ❌ | ❌ | ❌ |
| **Operational cost** | 1 index + jscpd | 2nd index + hook conflict | 2nd index + embeddings | Paid + 2nd index |

---

## 4. Should You Combine Them?

### Short answer: **No permanent combination for luna-marketplace.**

| Combination | Verdict | Why |
|-------------|---------|-----|
| **GitNexus + jscpd (current)** | ✅ **Keep** | Already maps 1:1 to your 3 problems; Luna hooks/skills built around it |
| **+ codebase-memory-mcp MCP** | ❌ **Noise** | ~80% overlap on search/impact/trace; dual indexes; CBM installer fights Luna hooks; agent gets 14+ extra tools with unclear precedence |
| **+ CodeGraph MCP** | ❌ **Noise** | 42+ tools inflate context; key cleanup features (dupes, dead code) are Pro; no `rename`; third index |
| **CBM CLI one-off audit** | ⚠️ **Optional** | Dead-code candidate list before a cleanup sprint — run once, paste results, uninstall or disable MCP |
| **+ Graphify** | ❌ **Wrong tool** | Multimodal docs/PDFs — doesn't solve code dedupe/refactor ([graphify.net](https://graphify.net/)) |

### When combination *might* make sense (not your case)

- **Polyglot monorepo with heavy C++/Java** where Hybrid LSP call resolution materially beats tree-sitter-only — still weigh against maintaining two graphs
- **Team wants committed graph artifact** (`.codebase-memory/graph.db.zst`) for instant onboarding — GitNexus has no equivalent commit artifact today
- **CodeGraph Pro already licensed** — `find_duplicates` + `find_unused_code` could complement jscpd, but you'd still keep GitNexus for `rename` + `group_query`

### Redundancy / conflict risks

1. **Dual indexing** — two tools watching git, two staleness models (Luna `gitnexus-freshness` vs CBM watcher)
2. **Hook stacking** — CBM PreToolUse on Grep/Glob + Luna dedupe-guard + gitnexus-freshness + bash guards
3. **Agent confusion** — "should I `query`, `search_graph`, or `symbol_search`?" — documented failure mode for multi-MCP code intelligence
4. **Token tax** — each MCP server advertises tools in context; 3 servers ≈ 70+ tools before any work

---

## 5. Gap Analysis — What NONE of These Tools Solve Well

| Gap | Why graphs fail | Complementary practice |
|-----|-----------------|------------------------|
| **OOP design judgment** (SRP, cohesion, "right" abstraction level) | Graphs show structure, not intent or domain boundaries | Human review + `dev-brainstorm` / `docs/specs/` module boundaries; `review-simplify` complexity section |
| **File size balance** (avoid god files vs file explosion) | No tool optimizes file count vs readability | Team conventions in `docs/PROJECT_STRUCTURES.md`; `review-simplify` flags oversized functions/files manually |
| **Behavioral equivalence when merging dupes** | Static analysis can't prove two similar functions behave identically | **Tests** (`dev-tdd`, `dev-verify`); merge only when tests cover both paths |
| **Safe dead-code deletion** | Dynamic dispatch, plugins, config wiring, JS `import()` | Delete in small PRs; `impact` first; keep deprecated shims one release |
| **Framework magic** (DI, decorators, metaprogramming) | Missed edges → false "dead" or false "safe" | Prefer integration tests over graph-only confidence |
| **Design doc ↔ code alignment** | GitNexus doesn't index ADRs natively | `doc-update-project`; optional CodeGraph `verify_design` if you adopt docs indexing (not worth second MCP alone) |
| **Enforcement** | Rules/hooks nudge; graphs don't block bad writes | Strengthen `dedupe-guard` scope (see §6); mandatory `review-simplify` before merge on refactor branches |

---

## 6. Concrete Workflow Recommendation for luna-marketplace

### 6.1 What to keep (no changes required)

- GitNexus MCP + all `gitnexus-*` skills
- `codebase-awareness` rule
- `gitnexus-freshness` + `gitnexus-post-commit` hooks
- `dedupe-guard` + jscpd + `review-simplify` duplication pass
- `jscpd` as deterministic floor; GitNexus as semantic ceiling

### 6.2 What to add (configuration, not new tools)

| Step | Action | Addresses |
|------|--------|-----------|
| 1 | **`gitnexus analyze` in `luna-marketplace`** (and any kit-managed repo you edit) | Fresh graph for the repo you are actually cleaning |
| 2 | **Register multi-module groups** if cleaning `flynance-main` + submodules — use `group_query` / `group_status` | Problem 1 cross-module dupes |
| 3 | **Scaffold `.jscpd.json`** via `doc-init` if missing; run full-repo jscpd baseline | Problem 1–2 clone inventory |
| 4 | **Create cleanup plan** in `docs/plans/` with phases: inventory → consolidate → delete → verify | Traceability via `Plan:` trailers |
| 5 | **Optional: strengthen dedupe-guard** — today it only scans **staged** files; add a weekly/manual full-repo jscpd in `review-simplify` | Problem 1–2 |

### 6.3 Ordered refactor/cleanup initiative

**Phase A — Inventory (1–2 sessions)**

1. `gitnexus analyze` on target repo(s)
2. `npx jscpd --silent --reporters consolefull .` (respect `.jscpd.json`)
3. GitNexus `query` / `group_query` for each domain area ("auth validation", "plan registry", "hook dispatch", …)
4. Export list: **jscpd clones** | **semantic duplicates** | **zero-caller symbols** (Cypher below)

```cypher
MATCH (f:Function)
WHERE NOT EXISTS { MATCH ()-[:CodeRelation {type: 'CALLS'}]->(f) }
RETURN f.name, f.filePath
LIMIT 100
```

5. *(Optional one-off)* CBM dead-code scan via CLI — cross-check candidates only

**Phase B — Consolidate (ongoing, small batches)**

For each duplicate cluster:

1. `gitnexus_impact` on symbol to keep vs symbol to remove
2. Read `gitnexus://repo/{name}/process/{processName}` for affected flows
3. Merge implementation into canonical location
4. `gitnexus_rename` if renaming to unify APIs (dry_run first)
5. `gitnexus_detect_changes` — confirm affected processes match expectation
6. Run tests (`dev-verify`)

**Phase C — Reshape (module boundaries)**

1. `gitnexus-exploring` — clusters/communities as *hints* for module splits
2. `review-simplify` — flag god-files, deep nesting, orphaned helpers
3. Document target module map in `docs/PROJECT_STRUCTURES.md` **before** large moves
4. Extract modules using `gitnexus-refactoring` checklist (extract → impact → detect_changes)

**Phase D — Delete (highest risk — last)**

1. Only symbols with **zero inbound impact** AND test coverage on remaining paths
2. Small PRs; `impact` + `detect_changes` on each
3. Keep deprecated aliases one release if public API

### 6.4 What NOT to add

- ❌ codebase-memory-mcp as permanent MCP in Cursor/Claude alongside GitNexus
- ❌ CodeGraph MCP (community or Pro) as second graph — unless you later **replace** GitNexus, not stack it
- ❌ Graphify for this initiative — wrong problem class

---

## 7. Architecture & Indexing (summary)

| | GitNexus | codebase-memory-mcp | CodeGraph |
|---|----------|---------------------|-----------|
| **Storage** | LadybugDB (embedded graph + vectors) | SQLite WAL (`~/.cache/codebase-memory-mcp/`) | RocksDB (`~/.codegraph/graph.db`) |
| **Parsing** | Tree-sitter native | Tree-sitter + Hybrid LSP (9 langs) | Tree-sitter (38 langs) |
| **Search** | BM25 + vector + RRF; process-grouped | FTS5 + semantic_query (bundled embeddings) | BM25 + HNSW full-body embeddings |
| **Index trigger** | `gitnexus analyze`; Luna post-commit hook | Auto-sync watcher; `index_repository` | Index on MCP start / VS Code startup |
| **Shareable artifact** | ❌ (local `.gitnexus/`) | ✅ `.codebase-memory/graph.db.zst` | ❌ (local RocksDB) |

---

## 8. MCP Tools & Agent Integration (summary)

**GitNexus (core):** `query`, `context`, `impact`, `detect_changes`, `rename`, `cypher`, `list_repos`, `group_query`, `group_sync`, `group_list`, `group_status`, `group_contracts`, plus `api_impact`, `shape_check`, `tool_map`, `route_map`.

**codebase-memory-mcp (14):** `index_repository`, `search_graph`, `trace_path`, `detect_changes`, `query_graph`, `get_architecture`, `semantic_query`, `search_code`, `manage_adr`, `get_graph_schema`, `get_code_snippet`, `list_projects`, `delete_project`, `index_status`, `ingest_traces`.

**CodeGraph (45 community):** Prefixed `codegraph_*` — navigation (`get_callers`, `symbol_search`), analysis (`analyze_impact`, `analyze_complexity`), memory, docs, `pr_context`. Pro adds dedupe/dead-code/security.

**Luna integration depth:** GitNexus only — hooks, rules, skills, `TOOLS_LIST` audit decision.

---

## 9. Performance & Accuracy (cross-check)

| Claim | Source | Confidence |
|-------|--------|------------|
| GitNexus: single-query blast radius vs 10 chained greps | [MarkTechPost overview](https://www.marktechpost.com/2026/04/24/meet-gitnexus-an-open-source-mcp-native-knowledge-graph-engine-that-gives-claude-code-and-cursor-full-codebase-structural-awareness/) | Medium (vendor-adjacent) |
| CBM: 99% token reduction, sub-ms queries, 83% answer quality (31 repos) | [arXiv:2603.27277](https://arxiv.org/abs/2603.27277), README | Medium (self-evaluated) |
| CBM: Hybrid LSP ~95% Python resolution target | README | Medium (idiomatic code only) |
| CodeGraph: ~60 files/sec indexing, sub-100ms queries | [CodeGraph README](https://github.com/codegraph-ai/CodeGraph) | Medium |
| jscpd: deterministic clones — high precision, misses semantic dupes | Luna `review-simplify` design | **High** (by design) |

**Practical accuracy note for vibe-coded code:** All three struggle with dynamic patterns (callbacks, `getattr`, string imports). GitNexus `rename` explicitly tags `ast_search` edits as lower confidence — same class of uncertainty affects merge/delete decisions.

---

## Key Takeaways

1. **Your three problems are already mapped in Luna** — prevention (rule + GitNexus + jscpd), refactoring (`rename` + impact + processes), cleanup (impact + tests, with optional dead-code audit).
2. **Adding codebase-memory-mcp or CodeGraph on top adds noise** — overlapping tools, dual indexes, hook conflicts; key CodeGraph cleanup features are Pro-only.
3. **Immediate gap: `luna-marketplace` isn't GitNexus-indexed** — run `gitnexus analyze` before any cleanup initiative.
4. **CBM's only unique lure is explicit dead-code detection** — use as optional CLI audit, not second MCP.
5. **No tool replaces OOP judgment or file-size policy** — pair graph tools with `review-simplify`, specs, tests, and human review on module boundaries.
6. **Luna already documented this decision** in `TOOLS_LIST.md` — GitNexus + jscpd; don't re-litigate without new requirements (e.g. committed graph artifacts for teammates).

---

## Sources

1. [GitNexus README](https://github.com/abhigyanpatwari/GitNexus) — MCP tools, processes, group mode, rename
2. [GitNexus MCP docs](https://abhigyanpatwari-gitnexus.mintlify.app/api/commands/mcp) — tool/resource reference
3. [GitNexus PR #984](https://github.com/abhigyanpatwari/GitNexus/pull/984) — `@repo` group routing evolution
4. [MarkTechPost GitNexus article](https://www.marktechpost.com/2026/04/24/meet-gitnexus-an-open-source-mcp-native-knowledge-graph-engine-that-gives-claude-code-and-cursor-full-codebase-structural-awareness/) — architecture narrative
5. [codebase-memory-mcp README](https://github.com/DeusData/codebase-memory-mcp/blob/main/README.md) — tools, Hybrid LSP, dead code, SIMILAR_TO
6. [codebase-memory-mcp site](https://deusdata.github.io/codebase-memory-mcp/) — positioning, token claims
7. [arXiv:2603.27277](https://arxiv.org/abs/2603.27277) — CBM research preprint
8. [CBM v0.8.0 release notes](https://newreleases.io/project/github/DeusData/codebase-memory-mcp/release/v0.8.0) — Java/Kotlin/Rust LSP
9. [CodeGraph README](https://github.com/codegraph-ai/CodeGraph) — 45 tools, Pro features, profiles
10. [codegraph.codes](https://codegraph.codes/) — MCP marketing / local-first claims
11. [Graphify](https://graphify.net/) — disambiguation (multimodal, not code-refactor peer)
12. [Embed Coder comparison](https://www.embedcoder.com/2026/06/codegraph-vs-graphify-vs-gitnexus-which.html) — conflates GitNexus with git-history (inaccurate on history); useful for positioning only
13. `luna-marketplace/docs/TOOLS_LIST.md` — locked decision: GitNexus + jscpd
14. `luna-marketplace/docs/SYSTEM_DESIGN.md` — freshness hooks, three enforcement mechanisms
15. `luna-marketplace/.cursor/rules/codebase-awareness.mdc` — query-before-write rule
16. `luna-marketplace/skills/review-simplify/SKILL.md` — jscpd + GitNexus duplication pass
17. `luna-marketplace/scripts/hooks/dedupe-guard.js` — pre-commit jscpd advisory hook
18. `luna-marketplace/hooks/gitnexus-freshness` — fail-closed staleness gate
19. `luna-marketplace/hooks/gitnexus-post-commit` — async reindex
20. `~/.cursor/skills/gitnexus-guide/SKILL.md` — schema and tool reference
21. `~/.cursor/skills/gitnexus-refactoring/SKILL.md` — rename workflow
22. `~/.cursor/skills/gitnexus-impact-analysis/SKILL.md` — blast radius workflow
23. GitNexus MCP `list_repos` (live) — indexed repos in this environment
24. `luna-marketplace/hooks/hooks.json` — hook orchestration order

---

## Methodology

**Sub-questions addressed:** (1) architecture/graph model, (2) MCP overlap vs unique features, (3) performance/accuracy claims, (4) operational complexity, (5) Luna ecosystem fit, (6) combine or not — all reframed against Problems 1–3 per user directive.

**Research steps:**
1. Read Luna Agent Kit integrations locally (hooks, rules, skills, `TOOLS_LIST` audit, `SYSTEM_DESIGN`)
2. Read GitNexus guide + MCP tool descriptors + live `list_repos`
3. Deep-read codebase-memory-mcp README (tools, dead code, SIMILAR_TO, hooks installer)
4. Deep-read CodeGraph README (community vs Pro split)
5. Web search for disambiguation (Graphify, Sourcegraph, FalkorDB mentions)
6. Cross-reference claims; flag single-source benchmarks

**Gaps:** No hands-on A/B benchmark on `luna-marketplace` code; CodeGraph Pro not evaluated (paid). Recommendation is inference from feature matrix + Luna existing investment, not a live shootout.

**Confidence:** **High** on "don't stack MCPs" and GitNexus fit for refactor; **Medium** on relative call-resolution accuracy (CBM Hybrid LSP vs GitNexus tree-sitter) without repo-specific indexing comparison.
