---
title: T11 graph/vector enrichment adapter — decision-grade evaluation
scope: project
type: research
lifecycle: pre_official
status: draft
keywords: [graph-memory, t11, pgvector, graphiti, falkordb, kuzu, local-ai, bge-m3, enrichment, phase-3]
related:
  - docs/specs/2026-07-19-graph-memory-backend-contract.md
  - docs/pre-official/research/2026-07-19-graph-memory-system-design.md
  - docs/pre-official/research/2026-07-19-context-engineering-coding-agents.md
  - docs/plans/2026-07-18-luna-studio.md
updated: 2026-07-23
---

# T11 graph/vector enrichment adapter — decision-grade evaluation

> **Status:** PRE_OFFICIAL research (draft). RESEARCH ONLY — no feature code. The contract/decision
> is a separate gated step after this is reviewed. Verified hands-on against the running local-ai
> stack on 2026-07-23.

## 1. Executive summary + recommendation

**Recommendation: adopt Option F′ — fix the already-shipped embedding lane, keep in-index vectors,
and DEFER every graph DB and pgvector until a falsifiable scale/scope trigger fires.** Confidence: **High.**

The blunt finding from probing the real stack: the enrichment we already designed is 90% built and
currently **not running**, and the enrichment the T11 row names (Graphiti + FalkorDB) is net-new infra
whose only 2026 embedded option (Kuzu) **died upstream in October 2025**. The highest-lift, lowest-cost
move is not to add a database — it is to make `maybeEmbedChunks` actually reach a bge-m3 endpoint (the
LiteLLM gateway now returns **401 without an API key**; the shipped code sends none), so the semantic
lane that already exists in `graph-memory.mjs` starts producing vectors.

Concretely:

- **Do now (v1, T11 rescoped):** teach the embedding lane to authenticate to the local-ai gateway
  (`LUNA_LOCAL_AI_KEY`) with TEI `:1002` as a keyless fallback; keep vectors **in the file-JSON index**
  (already supported) and keep in-JS cosine. No new service. Fully fail-open. This turns `mode:
  lexical-only` into `mode: complete` on machines where local-ai is up.
- **Defer (write the trigger, not the code) — the *reuse-Postgres* family:** a **pgvector lane** (vectors)
  and, if a graph store is ever truly needed, **Apache AGE** (openCypher inside the *same* Postgres) —
  both in a *separate* `luna_memory` database (the postgres server + `vector` 0.8.3 are already present;
  AGE is active and PG17-supported). Adopt only when in-JS cosine / traversal stops being adequate:
  corpus **> ~5k chunks in one vault** or **registry-scope cross-vault** fan-out. Until then both are pure
  ops surface with no measurable lift.
- **Decline for the foreseeable future — the *net-new-service / LLM-extraction* family:** Graphiti +
  FalkorDB/Neo4j/Kuzu and a raw-Cypher custom graph (Options B/C/D/E), the GraphRAG/extraction tools
  (**Microsoft GraphRAG**, graphify, LightRAG, nano-graphrag), and the two-writer memory frameworks
  (Mem0/Cognee/Zep). They are net-new services and/or writers, and our small-model gateway makes their
  LLM extraction unreliable, nondeterministic, and (for GraphRAG's global search) literally
  non-functional at 7B scale — while our workload is *specific lookup*, where plain semantic search
  already wins. The file-JSON KG neighborhood lane already covers the read-only "related items /
  conflicts" surface the contract asks for. See §4.2 for the on-merits argument.

The T11 backlog row ("Optional Graphiti + FalkorDB enrichment adapters") should be **rescoped**: its
premise (Kuzu-embedded or FalkorDB-first) is stale, and the real gap it should close is the dead
embedding lane. This is a **go on F′ / defer on graph DB** recommendation, not a survey.

## 2. Already settled — out of scope (non-duplication map)

Read and NOT re-derived here (build on, do not relitigate):

| Source | What it already settles — treated as fixed |
|--------|--------------------------------------------|
| `2026-07-19-graph-memory-backend-contract.md` (ACTIVE) | Markdown+git = only source of truth; every KG/vector/JSON = rebuildable index; MCP is read-only (§5.1 tool set + mutation rejection); no two-writer of memory/lessons/native; per-vault outer wall (§4); enrichment optional + fail-open (§11); file-JSON locked as v1 default (§3, §13). |
| `2026-07-19-graph-memory-system-design.md` | Hybrid KG+vector+lexical+GitNexus is the right shape; rebuildable index beats authoritative DB; path-keyed identity for v1; FalkorDB-first / Kuzu-spike **as of July** (this doc updates that). |
| `2026-07-19-context-engineering-coding-agents.md` | "Temporal KG / hybrid retrieval is valuable" — established, NOT re-argued; failure-mode taxonomy (divergent fixing, forgotten design, duplicate code, cross-vault bleed, stale context); bge-m3+pgvector named as the local semantic direction. |
| `scripts/lib/graph-memory.mjs` (shipped v1) | File-JSON rebuildable index; heading-aware chunker; `maybeEmbedChunks` (fail-open, batched, honest partial coverage); in-JS `cosine`; read-only tool facade; status reports `graphiti/pgvector = 'unavailable'`. |
| `docs/TODO.md` T11 / `AGENTS.md` | T11 is additive follow-up; GitNexus owns the code graph; jscpd owns clone detection — neither is replaced. |

**This doc adds exactly one thing:** an integration/operations decision — *which* enrichment adapter (if
any) to wire now — measured against the reuse-local-ai baseline and today's verified landscape.

## 3. Ground truth — what local-ai + pgvector actually provide right now

Probed live on 2026-07-23 (loopback only). Reality vs. the prompt's stated assumptions:

| Thing | Assumption in brief | **Verified reality** |
|-------|---------------------|----------------------|
| LiteLLM gateway `:1000/v1` | Open OpenAI-compatible router | **Running, but requires an API key** — `/models` and `/embeddings` return **HTTP 401 "No api key passed in."** The `litellm-db` spend-tracking profile is ON, which implies a `LITELLM_MASTER_KEY` is set. |
| Shipped embedding lane | Working through `:1000` | **Currently dead** — `maybeEmbedChunks` posts to `:1000/v1/embeddings` with **no `Authorization` header** → 401 → fail-open → `embeddings: unavailable`, `mode: lexical-only`. The semantic lane silently never fires against this gateway. |
| bge-m3 dim | 1024-dim | **Confirmed 1024.** TEI `:1002` (`neuro_tei`, v1.6.1, `BAAI/bge-m3`, cls pooling, 8192 max input) returns 1024-length vectors on both `/embed` and `/v1/embeddings`, **no auth**. |
| pgvector | "Enable a profile + add a DB/schema" | **Server already running** (`neuro_litellm_db`, `pgvector/pgvector:pg17`, `127.0.0.1:1032`). `vector` extension **0.8.3 available but NOT installed**. Only DBs: `postgres`, `litellm`. |
| pgvector schema | "reuse it" | The `litellm` DB is **fully occupied by LiteLLM's Prisma-migrated operational tables** (~25 `LiteLLM_*` tables). No Luna DB/schema exists. Reuse ≠ share this DB; it means **create a separate `luna_memory` DB + `CREATE EXTENSION vector`** in the same server. |
| Postgres availability | Near-zero marginal cost | True *when the `litellm-db` profile is enabled* — which is a **current, opt-in** state, not a guarantee. A local-ai instance run without spend tracking has **no postgres at all**. So a pgvector lane must stay **fail-open / when-present**, exactly like embeddings. |

Two load-bearing consequences:

1. **The cheapest, highest-lift work is an auth fix, not a database.** The vector capability is already
   coded; it just can't reach a model. Fixing that is strictly smaller than any adapter in Options A–G.
2. **"Reuse pgvector = near-zero ops" is only half-true.** The *server* is free; a *usable Luna vector
   store* still needs a dedicated DB, the extension, connection/credential handling, and fail-open when
   the profile is off. That is real (if modest) surface — and it buys nothing over in-JS cosine at our
   corpus size.

Could not read `local-ai/.env` (correctly blocked by the `.env` deny rule), so the exact
`LITELLM_MASTER_KEY` / `POSTGRES_PASSWORD` values are unconfirmed. This does **not** change the
decision — it only means the wiring step must source credentials from the operator's env, never hardcode.

## 4. Option matrix + verdicts (each scored vs the reuse-local-ai baseline)

Baseline to beat = **what ships today**: file-JSON lexical + authority ranking, in-index bge-m3 vectors
with in-JS cosine, file-JSON KG neighborhoods (headings/`related`/wikilinks). The question for every
option: *what does it add over that, and is the lift worth the net-new ops cost?*

| Option | Net-new infra? | Local-first / fail-open | Rebuildable + cleanup | Read-only fit | Provenance | Ops footprint (solo) | Graphiti lock-in | Measurable lift over shipped lanes | License | Maturity 2026 | Verdict |
|--------|----------------|-------------------------|-----------------------|---------------|-----------|----------------------|------------------|-------------------------------------|---------|---------------|---------|
| **A** pgvector-only semantic lane (reuse postgres+bge-m3) | Low (DB+ext; when profile on) | Good, if kept when-present | Yes (drop DB/rows, rebuild) | Fine | Full (metadata cols) | Low–moderate | None | **Low now** — replaces in-JS cosine only; identical results < ~5k vectors | PostgreSQL (perm.) | Mature (0.8.3) | **Defer** — right *when* scale/registry triggers fire |
| **A2** Apache AGE graph lane (openCypher **inside** the same Postgres) | Low-moderate (no new *service*, but not in the pgvector image → custom image / source build) | Good, if kept when-present | Yes (drop graph, rebuild from frontmatter) | Fine (read Cypher) | Full (nodes carry source identity) | Moderate (build/maintain the extension) | None | **Low now** — buys multi-hop Cypher; graph *content* still comes from frontmatter that file-JSON already produces; in-JS 1–2 hop traversal already serves `related_items`/`check_conflicts` | Apache-2.0 (permissive) | **Active — PG17 supported, rel. Jan 2026** | **Defer** — graph analog of pgvector; same trigger; the *reuse-postgres* graph option |
| **B** Graphiti + FalkorDB | **Yes** (FalkorDB service) | Extra service to keep fail-open | Graphiti owns its store; rebuild = external drop | Needs write-tool suppression | Graphiti-native, but coupled | High | **High** | Temporal KG facts — but our file-JSON KG already serves the read lane; small-model extraction unreliable | **SSPLv1** (source-available) | Active | **Decline** |
| **C** Graphiti + Kuzu (embedded) | Was "no service" | — | — | — | — | — | High | — | — | **Kuzu archived Oct 2025 (Apple acqui-hire); Graphiti deprecated it** | **Dead — reject** |
| **D** Graphiti + Neo4j | **Yes** (JVM service) | Heaviest to run/back up | External store | Write-tool suppression | Graphiti-native | **Highest** | High | Same as B, heavier | GPLv3 / commercial | Mature | **Decline** |
| **E** Raw-Cypher custom over FalkorDB/Kuzu | **Yes** (graph service) + hand-rolled | You own fail-open + logic | You own rebuild/tombstone | You build it | You build it | High + bespoke code | None | Marginal over file-JSON neighborhoods; more code to maintain | n/a | n/a | **Decline** |
| **F′** File-JSON + fix embedding lane; defer pgvector/graph (**recommended**) | **None** | Native fail-open (already) | Yes (already tested) | Already read-only | Already full | **Lowest** (auth header + fallback) | None | **Highest lift/cost ratio** — turns dead semantic lane on | own code | shipped | **Adopt** |
| **G** 2026 memory / GraphRAG frameworks | mixed | mixed | mixed | mostly writers | mixed | mixed | varies | multi-hop QA gains on paper | mixed | mixed | **Decline** (see §4.1) |

### 4.1 Option G triage (2026 landscape — keep viable, discard the rest with reasons)

| Candidate | Shape | Verdict + one-line reason |
|-----------|-------|---------------------------|
| **Apache AGE** | openCypher graph **inside Postgres** | ***Defer, not decline*** — promoted to A2 above. The one graph option that reuses our postgres with no new service; active + PG17. Not a v1 because content still comes from frontmatter and in-JS traversal already serves the read lane. |
| **Microsoft GraphRAG** | Batch LLM entity/community-summary indexing pipeline | *Decline (on the merits).* Built for **global sensemaking over large *unstructured* corpora**; **loses to plain semantic search on specific-lookup queries** (our workload). **4–6 LLM calls/chunk, ~20–100× embedding cost**; MS says don't use it for small corpora; and **7B-class models can't synthesize community summaries** — so it can't even run its value prop on our gateway. We already have an authored, deterministic graph. |
| **graphify** | LLM-extraction graph builder | *Decline.* Same extraction-based class as GraphRAG — nondeterministic, small-model-fragile, immature; no read-only-facade fit. |
| **LanceDB** | Embedded, in-process vector store (no server) | *Discard for v1; note as the pgvector alternative.* Genuinely local-first, but net-new dep with **zero lift** over in-JS cosine at our corpus size; revisit only if we outgrow in-JS *and* don't want postgres. |
| **Cognee** | Memory framework (SQLite+LanceDB+**Kuzu** local) | *Discard.* A **writer** that owns its own store (two-writer conflict); local graph backend is the now-dead Kuzu. Its own "Just Postgres: drop the graph DB" post corroborates our defer-graph thesis. |
| **Mem0** | Agent memory service/lib | *Discard.* Writer-owned memory store — direct conflict with the no-two-writer invariant. |
| **LightRAG / nano-graphrag** | GraphRAG libs (LLM-extract own graph) | *Discard.* Rebuild the graph via LLM extraction — overlaps the file-JSON KG, adds small-model nondeterminism, no read-only-facade fit. |
| **Zep (self-host)** | Now Graphiti-backed memory server | *Discard.* Net-new service; upstream pushes cloud; inherits Graphiti coupling. |
| **Qdrant / Weaviate** | Vector DB services | *Discard.* Net-new service when pgvector is already present and in-JS suffices. |
| **Memgraph / SurrealDB / LadybugDB** | Graph / multi-model services | *Discard for now.* Net-new services; LadybugDB (MIT Kuzu successor) is nascent and **not yet a Graphiti driver** (open issue) — watch, don't adopt. |
| **ACE (Agentic Context Engineering)** | Evolving context-playbook *technique* | *Out of T11 scope.* A retrieval/context-assembly strategy (Phase-4 context packs), not an enrichment storage backend. (Apache ACE = OSGi provisioning — unrelated.) |

### 4.2 Why the whole GraphRAG / LLM-extraction family loses here — on the merits, not just infra

Four independent reasons, any one sufficient:

1. **Wrong problem.** GraphRAG-family value is *global sensemaking* ("what are the themes across the corpus"). Coding-agent retrieval is *specific lookup* ("which spec/lesson governs this task"). Microsoft's own results show semantic search **beats** GraphRAG on lookup queries — and lookup is what our `search_context` does.
2. **Wrong corpus.** These systems LLM-*extract* a graph because their input is unstructured prose. Ours is a few hundred markdown files that already carry an authored graph (frontmatter `related`, wikilinks, headings, lifecycle). We don't have the missing-structure problem they solve; extracting one would only add nondeterminism over a graph we already have deterministically.
3. **Wrong model.** Extraction and community-summarization need a capable LLM; our local gateway is small gemma. The literature explicitly finds ~7B models can't faithfully synthesize community summaries, and 2026 ablations ("verbatim chunks beat extracted artifacts", "extraction-free" graph construction) find extraction often doesn't beat good chunking anyway.
4. **Wrong cost/authority shape.** 4–6 LLM calls per chunk (20–100× embedding cost) buys facts that would then look more authoritative than the markdown they came from — the exact hidden-authority failure the contract forbids.

Apache AGE escapes reasons 3–4 (no LLM extraction — we'd populate it deterministically), which is *why* it's a defer and the extraction frameworks are a decline. It still doesn't clear the v1 bar on reasons 1–2 at our scale.

## 5. Recommended adapter — integration sketch (shapes only, every invariant preserved)

F′ is additive to the shipped pipeline; it changes **one** enrichment edge and leaves the index format,
MCP surface, and walls untouched.

**Embedding-lane fix (do now):**

- Resolve endpoint in this order, all fail-open: (1) gateway `LUNA_LOCAL_AI_URL` + `Authorization:
  Bearer ${LUNA_LOCAL_AI_KEY}` when a key is present; (2) keyless TEI `LUNA_EMBED_URL` (default
  `:1002`) as fallback; (3) none → `embeddings: skipped/unavailable`, `mode: lexical-only` (unchanged).
- `embedding_dim` recorded on every chunk (assert 1024 for bge-m3) so a model/dim change invalidates
  rather than silently mismatches. No change to the honest partial-coverage reporting already in place.
- **Invariants held:** still writes only under `{vault}/docs/generated/graph-memory/`; still rebuildable
  and droppable; MCP stays read-only; no memory/lessons/native write path introduced; per-vault wall
  untouched; a down/keyless gateway degrades exactly as today.

**Deferred pgvector lane (write the trigger, not the code):**

- When triggered, mirror the *same* chunk rows into a **separate `luna_memory` DB** (never the `litellm`
  Prisma DB) with `CREATE EXTENSION vector`, keyed by `(vault_id, source_path, content_sha256,
  chunk_id, embedding_model, embedding_dim)` — a **projection of the file-JSON index**, not a new source.
- pgvector remains a **rebuildable, when-present** lane: `pgvector: unavailable` when the `litellm-db`
  profile is off; the file-JSON vectors stay the default and the fallback. Rebuild = `TRUNCATE` +
  re-upsert from the index; delete cleanup = rows keyed to retired `content_sha256` are dropped. No MCP
  mutation verb, no cross-vault copy.
- **If a graph store is ever genuinely needed** (multi-hop Cypher the file-JSON KG can't serve), the
  deferred choice is **Apache AGE in the same `luna_memory` DB** — populated *deterministically* from
  frontmatter/`related`/wikilinks (no LLM extraction), so the rebuildable + no-two-writer + determinism
  invariants hold. This keeps the whole enrichment stack on the one Postgres we already run; it does
  **not** reintroduce a graph service. Same trigger and same `graph_backend: unavailable`-when-absent
  fail-open posture as pgvector.

**What is explicitly NOT built:** no Graphiti dependency, no graph-DB container, no `add_memory`-style
tool, no writer into canonical files. The KG neighborhood lane stays the existing file-JSON
headings/`related`/wikilinks graph.

## 6. Honest v1 vs deferred + falsifiable acceptance criteria

| Area | v1 (this decision) | Deferred (future contract, gated) |
|------|--------------------|-----------------------------------|
| Semantic lane | Fix auth → in-index bge-m3 vectors + in-JS cosine | pgvector projection DB when scale/scope trigger fires |
| Graph lane | File-JSON neighborhoods (shipped) | **Apache AGE in the `luna_memory` Postgres** (deterministic population, no service) **only** if a temporal/multi-hop query the file-JSON KG demonstrably can't serve appears — never a net-new graph service |
| KG extraction | None (deterministic structure only) | LLM fact extraction only with a capable model + human review; never with the small gateway model unattended |

**Falsifiable acceptance criteria for the deferred pgvector contract (a trigger must be provable):**

- [ ] **Scale trigger:** a real vault produces **> ~5,000 embedded chunks** *and* p95 `search_context`
      latency with in-JS cosine exceeds an agreed budget (e.g. > 150 ms). Below that, pgvector is rejected.
- [ ] **Scope trigger:** registry-scope cross-vault search is turned on and fan-out over N vaults'
      file-JSON vectors is measurably too slow. Otherwise rejected.
- [ ] **Parity:** for the same corpus, pgvector top-k results equal the in-JS cosine top-k (no ranking
      regression) — else the lane is not adopted.
- [ ] **Fail-open:** with the `litellm-db` profile off, rebuild and query still succeed on file-JSON;
      status reports `pgvector: unavailable`, never a hard failure.
- [ ] **Separation:** Luna writes only to `luna_memory`; a probe asserts **zero** Luna tables in the
      `litellm` DB.

**Acceptance for the v1 embedding fix (do-now):**

- [ ] With gateway key present, a rebuild reports `mode: complete`, `embedded_count == chunk_total`,
      `embedding_dim: 1024`.
- [ ] With gateway keyless but TEI up, the fallback yields the same complete status.
- [ ] With both down, `mode: lexical-only` and no thrown error (fail-open preserved).

## 7. Founding-goal tradeoff flags

- **Fail-open:** any pgvector or graph lane MUST be when-present. The `litellm-db` profile is opt-in and
  currently-on-by-coincidence; treating postgres as guaranteed would break fail-open. (F′ adds no new
  hard dep.)
- **Two-writer ban:** every rejected "G" framework (Mem0, Cognee, LightRAG, Zep) is a memory *writer* —
  adopting one would create a second source of truth. Graphiti's MCP write tools (`add_memory`,
  `clear_graph`) fall under the same ban; only read wrappers are ever acceptable.
- **Rebuildable index:** Graphiti/graph-DB stores externalize state that must be dropped-and-rebuilt from
  markdown; keeping that guarantee across an external service is extra burden with no lift here. The
  pgvector projection stays a rebuildable mirror, never canonical.
- **Local-first, no second model stack:** F′ and the deferred pgvector both reuse the existing local-ai
  bge-m3 gateway/TEI — no parallel embedder. Graphiti's warning that **small local models extract
  unreliable KG JSON** means a Graphiti path would pressure us toward a bigger/second model — a
  local-first red flag.
- **Determinism honesty:** LLM KG extraction (Graphiti et al.) is nondeterministic; the contract tolerates
  nondeterministic *summaries* but the current structure-only KG is fully deterministic. Adding extraction
  trades a guarantee for marginal recall.

## 8. Sources, methodology, known gaps

**Hands-on (2026-07-23, loopback):** `docker ps`; `psql` into `neuro_litellm_db` (extensions, DBs,
`pg_available_extensions`, table list); `fetch` probes of `:1000/v1` (401) and TEI `:1002`
(`/info`, `/embed`, `/v1/embeddings` → dim 1024). `local-ai/docker-compose.yml` + `.mac.yml` (profiles,
`pgvector/pgvector:pg17`, port 1032, default `POSTGRES_PASSWORD=change-me-before-enabling`).

**Primary web (dated 2026-07-23 access):**
- [getzep/graphiti (GitHub)](https://github.com/getzep/graphiti) and [graphiti-core (PyPI)](https://pypi.org/project/graphiti-core/) — backends Neo4j 5.26 / FalkorDB 1.1.2 / Neptune / **Kuzu 0.11.2 deprecated**.
- [Kuzu's Legacy — gdotv](https://gdotv.com/blog/kuzu-legacy-embedded-graph-database-landscape/) and [FalkorDB: Kuzu→FalkorDB migration](https://www.falkordb.com/blog/kuzudb-to-falkordb-migration/) — **Kuzu archived Oct 2025, Apple acqui-hire, read-only**.
- [FalkorDB blog (SSPL, Graphiti support)](https://blog.getzep.com/graphiti-knowledge-graphs-falkordb-support/) + [FalkorDB docs](https://docs.falkordb.com/) — **SSPLv1**.
- [Graphiti embedding/reranking (DeepWiki)](https://deepwiki.com/getzep/graphiti/4.4-embedding-and-reranking), [issue #1116 (api_base ignored → 401 w/ local LLM)](https://github.com/getzep/graphiti/issues/1116), [Zep LLM config](https://help.getzep.com/graphiti/configuration/llm-configuration) — custom `base_url` via `OpenAIGenericClient`/`OpenAIEmbedder`; **small local models warned unreliable for extraction**.
- [LadybugDB driver request — Graphiti #1509](https://github.com/getzep/graphiti/issues/1509) — MIT Kuzu successor, not yet a driver.
- [Encore: best vector DBs 2026](https://encore.dev/articles/best-vector-databases), [Cognee "Just Postgres: drop the graph DB"](https://www.cognee.ai/blog/deep-dives/just-postgres), [Cognee open-source memory frameworks 2026](https://www.cognee.ai/blog/guides/open-source-memory-frameworks-llm-agents) — LanceDB embedded profile; pgvector adequate < ~5M vectors; memory frameworks own their stores.
- [Apache AGE (GitHub)](https://github.com/apache/age) + [AGE release notes](https://age.apache.org/release-notes/) — openCypher-in-Postgres, **PG11–18 incl. 17**, release Jan 21 2026 (RLS, id indexes); Apache-2.0.
- [GraphRAG local↔global summarization](https://beancount.io/bean-labs/research-logs/2026/06/04/graphrag-local-to-global-query-focused-summarization) + [GraphRAG on consumer hardware (arXiv 2605.20815)](https://arxiv.org/pdf/2605.20815) — 4–6 LLM calls/chunk, 20–100× embedding cost, small corpora / lookup queries / 7B-model limits.
- [Verbatim Chunks Beat Extracted Artifacts (arXiv 2601.00821)](https://arxiv.org/pdf/2601.00821) + [ContextRAG: extraction-free graphs (arXiv 2605.19735)](https://arxiv.org/pdf/2605.19735) — 2026 ablations that extraction often doesn't beat good chunking.

**Methodology:** (1) read the three prior docs + shipped lib to fix non-duplication scope; (2) probe the
real stack to separate assumption from reality; (3) re-verify each candidate's *current* status/license/
embedder-fit rather than trust the July doc; (4) score every option against the shipped baseline, biased
toward the simplest thing that clears the bar.

**Known gaps:** (a) `.env` credentials unread (deny rule) — wiring must source them from operator env,
unconfirmed values don't change the decision; (b) no live latency benchmark of in-JS cosine at large
corpus size — hence the *falsifiable* scale trigger rather than an assumed one; (c) Graphiti-with-gemma
extraction quality not empirically run here — declined on documented small-model warnings + net-new-infra
cost, not on a local benchmark.

## File index

| Ref | Path |
|-----|------|
| ACTIVE contract | `docs/specs/2026-07-19-graph-memory-backend-contract.md` |
| System-design summary | `docs/pre-official/research/2026-07-19-graph-memory-system-design.md` |
| Context-engineering research | `docs/pre-official/research/2026-07-19-context-engineering-coding-agents.md` |
| Shipped v1 lib | `scripts/lib/graph-memory.mjs` |
| Graph-memory CLI | `scripts/graph-memory.mjs` |
| Backlog row | `docs/TODO.md` (T11) |
| Front-matter schema | `templates/docs/FRONTMATTER.md` |
| Studio plan | `docs/plans/2026-07-18-luna-studio.md` |
| local-ai stack | `/home/l/REPOS/PROJECTS/local-ai/docker-compose.yml` |
