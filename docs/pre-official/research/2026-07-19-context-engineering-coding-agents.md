---
title: Context Engineering for Coding Agents
scope: project
type: research
lifecycle: pre_official
status: draft
keywords: [context-engineering, memory, graphiti, mcp, local-ai, luna-studio]
related:
  - docs/plans/2026-07-18-luna-studio.md
  - docs/specs/2026-07-18-sync-agent-views-contract.md
  - docs/specs/2026-07-19-dedupe-assistant-contract.md
  - docs/specs/2026-07-19-fleet-sync-contract.md
updated: 2026-07-19
---

# Context Engineering for Coding Agents: Research Report
*Generated: 2026-07-19 | Sources: 34 | Confidence: Medium-High*

## Executive Summary

Luna Studio Phase 3 should treat Graphiti + embeddings as a rebuildable context index over canonical markdown, not as a new source of truth. That preserves the local-first invariant while still adding temporal graph structure, semantic recall, and queryable memory for agents [S1][S2][S4][S24].

The strongest near-term architecture is hybrid retrieval: GitNexus/code graph for live code impact, markdown/doc chunks for durable project truth, canonical memory/lessons for preferences and corrections, and bge-m3/pgvector or Graphiti hybrid search for semantic recall. Graphiti/Zep evidence supports fusing BM25, cosine, and graph traversal, while Anthropic and GitHub both frame good coding-agent context as targeted, just-in-time retrieval rather than dumping large indexes into the window [S4][S5][S8][S9].

Phase 3 should be honest v1 infrastructure: rebuild job, stable node identity, read/query-only MCP surface, local-ai fail-open behavior, and drift detection. Phase 4 should own productized context packs, correction inbox review, temporal reasoning UX, drift alerts, and cross-project reuse search [S25][S26][S27][S28].

The new scope pressure is real: large / multi-project vibe-coding fails less from "no context" than from uncoordinated, stale, or duplicated context. Parallel sessions can fix the same bug differently; agents can ignore existing design and invent fresh architecture; AI-assisted PRs can accumulate semantic clones that reviewers miss; and registry-wide search can leak project-local memory if scope is not explicit [S29][S30][S31][S32][S33].

The Phase 3 graph-memory contract now exists as a GO-WITH-AMENDS draft, not an ACTIVE contract; use the focused system-design summary for the Phase 3 decision spine and Phase 4 handoff [ref:graph-contract] [ref:graph-system-design] [ref:studio-plan].

## 1. Memory Architectures

Temporal knowledge graphs win when the agent needs evolving relationships, contradiction history, provenance, and multi-hop reasoning. Graphiti's model stores raw episodes, semantic entities, relationships, and communities; it tracks valid time and transaction time on facts, invalidating old edges instead of deleting them when newer contradictory facts arrive [S1][S2][S4]. For a moving codebase, this maps well to "rule changed," "plan superseded," "lesson corrected," and "project A solved this before, but only under old constraints" [S2][S21].

Vector RAG wins for broad fuzzy recall over prose, especially when the query vocabulary does not match the target document. GitHub's Copilot retrieval work reports a 37.6% relative lift from a code/doc embedding model trained with hard negatives, which is directly relevant to finding "almost right" versus "actually right" snippets in coding work [S9]. bge-m3 is attractive for Luna's local-ai path because it supports dense, sparse, and multi-vector retrieval, more than 100 languages, and up to 8192 tokens, but the contract should still benchmark chunk size and latency locally instead of assuming a model card is sufficient [S8].

Hybrid beats either one alone for agent memory. Zep's retrieval path uses cosine similarity, BM25, breadth-first graph search, reranking, and a constructor that formats facts/entities into context; Qoder describes a similar multi-path recall fan-out across vector, full-text, graph, fuzzy, exact, and fixed queries [S4][S18]. For Luna, this argues for additive signals: lexical dedupe stays, semantic embedding similarity adds later, and graph neighborhoods add context without replacing canonical markdown [S26].

Staleness and contradiction handling are the main reason not to build a pure vector store. T-GRAG identifies temporal ambiguity, time-insensitive retrieval, and redundant node contents as failure modes in evolving corpora; LedgerRAG frames dynamic retrieval around explicit gap, drift, and conflict triggers with an evidence ledger [S21][S22]. Luna can keep v1 simpler than those systems, but should copy the invariants: every retrieved claim needs source path, source version/hash, lifecycle/status, and freshness metadata [S21][S22][S24].

## 2. Retrieval and Context Packs

Context engineering is the per-step selection of the smallest high-signal token set, not just prompt writing. Anthropic recommends just-in-time context using file paths, stored queries, links, and tools, plus compaction, structured notes, and focused subagents for long-horizon work [S5]. This matches Luna's existing markdown + git shape: a context pack can be a manifest of selected files/chunks/symbols/lessons with provenance, not a hidden prompt blob.

For coding agents, retrieval should fuse four lanes. GitNexus remains the live code graph for callers, impact, and execution flows; docs and plans provide official design truth; canonical memory and lessons provide preferences and corrections; dedupe/semantic similarity prevents repeated or near-duplicate knowledge from polluting retrieval [S24][S25][S26]. The context pack builder should rank by task match, authority, freshness, lifecycle, scope, and diversity, with explicit token budgets [S5][S17].

Task-scoped packs should be typed. A planning pack wants phase language, invariants, related specs, and open questions; an implementation pack wants exact plan task, impacted symbols, relevant tests, and current rules; a review pack wants diff scope, acceptance criteria, security/performance rules, and recent corrections. This mirrors Anthropic's point that different decisions need different context, and Superpowers' subagent pattern that the controller should curate exactly what a worker needs instead of handing it the whole session [S5][S23].

Retrieval should avoid all-or-nothing graph reads. The MCP memory reference server exposes `read_graph`, `search_nodes`, and `open_nodes`, but issue/PR discussion around lightweight read modes highlights context explosion from returning every observation and recommends limits, metadata-only reads, filters, and pagination [S14][S15]. Luna's MCP memory server should provide narrow query shapes by default: `search_context`, `open_context_items`, `related_items`, `recent_changes`, `find_conflicts`, and `context_pack_preview`.

## 3. Corrections and Lessons

The current correction loop is directionally right: `lessons.md` / `lessons.mdc` are protected, user-visible, and agent-owned, while generated views must not overwrite them [S24]. Agent-memory literature converges on extracting durable corrections after sessions, making them short and specific, then retrieving them only when relevant; Qoder and AgentPatterns both warn that memory which only grows becomes noise [S18][S19].

Phase 3 should index corrections as first-class, queryable memory nodes keyed to their canonical line/file identity. Corrections should influence retrieval through boosted authority and fixed-query lanes for always-relevant behavioral constraints, but they should not silently mutate canonical memory or native Claude memory [S18][S19][S24]. When a correction conflicts with a prior lesson, the correction inbox should surface the conflict for human review instead of letting the KG decide truth [S22][S24].

Durable memory without bloat requires lifecycle metadata. Recommended fields are source path, heading/line anchor when available, canonical hash, scope, lifecycle/status, extracted type (`correction`, `preference`, `decision`, `procedure`, `risk`), confidence, created/updated commit, supersedes/superseded_by, and last_retrieved/access count. This follows memory systems' emphasis on provenance, expiration, contradiction handling, and quality scoring [S18][S19][S20].

Phase 4's correction inbox should be the human review layer, not an auto-merge wizard. It should show candidate lessons, duplicates, contradictions, stale lessons, and "this lesson affected retrieval" traces; writes should go through existing markdown edit paths and protected-file rules [S19][S24][S27].

## 4. Chunking and Embeddings

Markdown knowledge should be chunked structurally, not by raw characters. Current RAG guidance recommends splitting markdown by headings, preserving heading breadcrumbs, avoiding code-fence splits, adding metadata to every chunk, and using parent-child retrieval when small chunks are good for search but larger sections are needed for generation [S16][S17]. For Luna docs, the stable chunk unit should usually be a heading section with fallback subchunks for oversized sections.

Code should not be embedded as anonymous text chunks when GitNexus already owns code structure. For code context, use GitNexus symbol/process data first and embeddings only as a supplemental "find conceptually similar code/docs" signal; GitHub's Copilot work shows embeddings are valuable for semantic code retrieval, but code graph relationships are still needed for impact and correctness [S9][S25]. This keeps Luna from rebuilding a second partial code-intelligence system.

bge-m3 fits the local-ai candidate stack because it supports dense, sparse, and multi-vector retrieval in one model family, and its sparse mode can complement BM25-like lexical search [S8]. pgvector is a practical local store because it keeps vectors near relational metadata and supports exact and approximate nearest-neighbor search; HNSW gives better speed/recall at higher build/memory cost, while IVFFlat builds faster but generally has lower query performance and needs training data [S10].

Every embedding row should include enough metadata to rebuild and delete cleanly: `project_id`, `vault_id`, `source_path`, `source_sha256`, `git_commit`, `lifecycle`, `doc_type`, `heading_path`, `chunk_id`, `chunker_version`, `embedding_model`, `embedding_dim`, `content_sha256`, and `deleted_at`/tombstone state. This supports deterministic rebuilds, filtered retrieval, stale-index detection, and orphan cleanup without making pgvector authoritative [S10][S16][S24].

## 5. MCP Memory Server Patterns

MCP memory surfaces should be query-first and read-only for Luna. The reference MCP memory server includes mutation tools, and Graphiti's MCP server includes add/delete/clear operations, but Luna's invariant says the MCP memory server never writes `memory/*.md` or native memory; therefore those write tools must not be exposed in Luna's server [S3][S14][S24].

Useful query shapes for coding agents are narrower than generic graph CRUD: "what rules apply to this task?", "what lessons corrected this behavior?", "what official docs govern this subsystem?", "what related plans/specs exist?", "what changed since this pack was built?", "what memories conflict?", and "where did another project solve a similar problem?". Graphiti's `search_nodes`, `search_memory_facts`, `get_episodes`, group filters, and valid-time filters show the underlying capability, but Luna should wrap them in project-safe, provenance-heavy read APIs [S3][S14].

Read-only enforcement should happen at multiple layers. Tool registration should omit write tools; server routes should reject mutation verbs; generated indexes should be recreated from markdown rather than patched; and the UI should route any accepted edit back to vault CRUD, lifecycle, sync, or protected lesson flows [S24][S26][S27].

## 6. Guardrails and Rebuildability

The rebuild contract is load-bearing. Canonical markdown and git remain authoritative; KG tables, vector rows, JSON feeds, and graph snapshots are rebuildable indexes. This is already how `sync-agent-views` treats generated rule views and `docs/generated/mcp-memory-feed.json`, and how the dedupe contract treats semantic signals as additive Phase 3 data [S24][S26].

Stable node identity should be keyed to canonical source, not model output. Recommended identity: `project_id + vault_id + source_path + source_kind + heading_path_or_block_id + content_sha256`, with extracted entity/fact nodes carrying provenance back to one or more chunk IDs. When a markdown file is edited, deleted, moved, or demoted, the rebuild should update, tombstone, or retire affected nodes by source identity so there are no orphaned facts detached from source files [S2][S4][S24].

local-ai must be fail-open. If `http://127.0.0.1:1000/v1` is down, Phase 3 should still build canonical JSON and lexical indexes, mark semantic/KG status degraded, and keep Studio usable. Graphiti itself needs LLM/embedding providers for extraction, but Luna should make that an optional enrichment path, not a hard dependency for docs, rules, memory, or sync [S1][S3][S26].

Cross-project query needs scope boundaries. Fleet rules are shared from plugin `rules/`, but project memory remains local to each target; Phase 3 may query across projects without writing native session memory, and Phase 4 can make reuse search a product surface [S27]. The query contract should require `scope: "vault" | "vault+plugin" | "registry"` (or equivalent), default to vault, show project provenance, and never copy memory across vaults without an explicit markdown edit path [S26][S27].

## 7. Big / Multi-Project Vibe-Coding Failure Modes

**Divergent fixing:** when parallel agents or sessions attack the same bug with partial context, they can each produce a locally plausible fix that encodes a different diagnosis. Git worktrees prevent file-level interference, but not semantic divergence; CAID-style asynchronous SWE systems still require a manager, structured task boundaries, self-verification, and merge-time integration [S31]. Practical multi-agent workspace guidance and Scout-and-Wave both emphasize disjoint ownership, approved plans, isolated worktrees, and sequential integration because Git only catches textual conflicts, not contradictory assumptions spread across different files [S32]. Luna's context memory should therefore surface "related active plans / recent fixes / open bug investigations" before an agent starts a fix, and context packs should include current issue state plus the accepted diagnosis when one exists.

**Forgotten design / inventing anew:** architecture drift happens when a model treats a generic pattern as easier to invent than the repo's existing design. Luna already encodes the countermeasure in its workflow: route through docs, GitNexus, schemas, and lessons before implementation [ref:vibe-rules]. Phase 3 should make that cheaper by ranking official architecture docs, active contracts, and symbol/process context ahead of weaker semantic matches. A memory hit should never be "here is a similar pattern somewhere"; it should say which design doc owns the topic, what lifecycle/status it has, and whether a newer decision supersedes it.

**Redundant / duplicate functions:** AI coding is measurably prone to duplicate and less-refactored code. GitClear's 2025 study reports a rise in copy/pasted changed lines and a drop in moved/refactored lines across a large change corpus, while a later AI-generated PR study found more semantic redundancy and warned that reviewers often do not punish the resulting hidden technical debt [S29][S30]. Luna should keep the boundaries crisp: GitNexus answers "what existing symbol/process should I reuse?"; `jscpd` / `dedupe-guard` catch structural code clones; the Studio dedupe assistant catches knowledge overlap; Phase 3 embeddings add semantic similarity signals for retrieval and knowledge clusters, not a replacement for code-clone detection [S25][S26][S29][S30].

**Cross-project scale:** fleet rules are shared, but vault memory is not. Registry-wide retrieval is useful for "where did another project solve this?", but it is dangerous if it silently imports another project's local preferences, secrets-adjacent context, or unreviewed lessons. Phase 3 should default to the current vault, require explicit `vault+plugin` or `registry` scope, label every result with project/vault/path/source hash, and keep fleet-managed consumer rules read-only [S27]. Cross-project reuse search belongs in Phase 4 as read-only discovery first, not automatic memory propagation.

**Stale context / contradictions:** stale retrieved snippets are actively harmful, not just low-value noise. A controlled stale-repository-context study found that plausible old helper signatures can bias models toward obsolete APIs; co-retrieving current declarations reduces that failure channel [S33]. Temporal KG techniques help preserve "what was true then" versus "what is true now," but only if Luna attaches source hashes, lifecycle/status, commit freshness, and contradiction metadata to every retrieved item [S2][S21][S22][S33]. For v1, stale/conflicting evidence should be surfaced as a warning or review queue, not resolved by model judgment.

## Recommendations for Phase 3 (Graph Memory) — Load-Bearing Decisions

1. **High confidence — KG + embeddings are rebuildable indexes.** Specify a rebuild path that starts from canonical markdown (`rules/`, `memory/`, `docs/`, protected lessons) plus git metadata, writes generated KG/vector/JSON outputs, and can drop/recreate them without data loss [S24][S26].

2. **High confidence — one-way ingestion, MCP read-only.** Canonical `memory/*.md` may feed graph and vector indexes; MCP serves read/query tools only; writes go through vault CRUD, protected lessons flow, sync, or doc lifecycle tools [S14][S24][S26].

3. **High confidence — local-ai fail-open.** Treat local bge-m3/gemma/pgvector enrichment as degraded-but-optional. Studio should report semantic/KG unavailable rather than blocking docs, sync, dedupe lexical reports, or workflow operations [S1][S8][S26].

4. **High confidence — stable source identity.** Key chunks and extracted nodes to markdown source path, source hash, heading/block ID, lifecycle, and project/vault scope; retire or tombstone nodes on source edit/delete/move to prevent orphaned KG facts [S2][S4][S16][S24].

5. **Medium-High confidence — hybrid retrieval contract.** Phase 3 should define candidate generation from lexical keywords, bge-m3 embeddings, Graphiti facts/entities, and GitNexus/doc metadata, but defer polished pack assembly to Phase 4 [S4][S8][S9][S25][S26].

6. **High confidence — failure-mode coverage must be explicit.** The graph-memory contract should include negative tests for divergent parallel fixes, stale context, cross-vault leakage, semantic duplicates, and generated-view false positives. These are not polish issues; they are the core reasons Phase 3 exists [S29][S30][S31][S32][S33].

7. **Medium confidence — FalkorDB first, Kuzu as optional/experimental.** Graphiti documents FalkorDB, Kuzu, Neo4j, and Neptune backends, and FalkorDB offers OpenCypher, vector/full-text/range indexes, and Docker-friendly local startup [S1][S11][S12]. Kuzu's embedded model is appealing for local-first development, but backend support and Graphiti compatibility should be verified before locking it into the contract [S12][S13].

8. **High confidence — honest v1 boundary.** Phase 3 should not promise temporal reasoning UX, cross-project reuse UX, or autonomous correction merges. Build the index, query primitives, status/degraded modes, and provenance now; make temporal reasoning and reuse search Phase 4 features [S21][S22][S28].

## Recommendations for Phase 4 (Context Packs, Correction Inbox, Drift, Reuse Search)

1. **High confidence — context packs as manifests.** A context pack should record selected items, token budget, ranking reasons, source hashes, retrieval lanes, and freshness status. Agents can then load only the pack's needed files/chunks instead of receiving a hidden mega-prompt [S5][S16].

2. **High confidence — correction inbox before auto-memory.** Show extracted corrections, duplicates, conflicts, stale lessons, and suggested edits; require human confirmation through canonical markdown edit paths for durable changes [S18][S19][S24].

3. **Medium-High confidence — drift alerts from source hashes and lifecycle.** Alert when a pack references changed/deleted files, superseded plans, archived docs, old lessons with low recent use, or KG facts whose source hash no longer matches [S21][S22][S24].

4. **Medium-High confidence — cross-project reuse is read-only search first.** Start with "find where another project solved this" across registry scope, cite project/path/source hash, and provide copy/adapt guidance. Do not sync memory across vaults or write to consumer projects [S18][S27].

5. **Medium confidence — temporal reasoning as a Phase 4 affordance.** Use Graphiti valid/transaction time and source lifecycle to answer "what was true when?" only after Phase 3 provenance and rebuild paths are reliable [S2][S4][S21].

## Confidence Table

| Recommendation | Confidence | Why |
|---|---:|---|
| Rebuildable KG/vector indexes over markdown | High | Directly follows Luna invariants and sync/dedupe contracts; well-supported by provenance-heavy KG sources [S2][S24][S26]. |
| MCP memory server read/query only | High | Required by local two-writer invariant; MCP examples show both read and write tools, so Luna must deliberately expose only read shapes [S14][S24]. |
| Hybrid retrieval | High | Supported by Graphiti/Zep, Qoder, bge-m3, GitHub Copilot, and dedupe contract direction [S4][S8][S9][S18][S26]. |
| local-ai fail-open | High | Required by founding goals; external sources do not contradict it, and Graphiti/local embeddings can be optional enrichment [S1][S8]. |
| Stable node identity from source path/hash/block | High | Necessary to avoid orphaned graph facts; aligns with markdown-source authority and chunk metadata guidance [S16][S24]. |
| Explicit vibe-coding failure coverage | High | AI-assisted coding evidence points to duplicate code, semantic redundancy, stale-context bias, and multi-agent coordination failures; these map directly to Luna's founding goals [S29][S30][S31][S32][S33]. |
| Cross-project read-only scope gates | High | Fleet rules are shared but project memory is local; registry search without provenance would violate vault boundaries [S27]. |
| FalkorDB-first backend | Medium | FalkorDB is Graphiti default in its MCP docs and has local Docker/Cypher features; operational fit still needs repo-specific spike [S3][S11]. |
| Kuzu as optional embedded backend | Medium-Low | Kuzu fits local-first technically, but direct docs fetch was blocked and Graphiti backend status should be verified before commitment [S12][S13]. |
| Temporal reasoning in Phase 4, not Phase 3 v1 | Medium-High | Temporal KG value is strong, but product correctness depends on provenance and drift controls first [S2][S21][S22]. |

## Founding-Goal Tradeoff Flags

- **Hard tradeoff if adopted:** exposing Graphiti/MCP write tools (`add_memory`, `add_triplet`, `delete_episode`, `clear_graph`) directly to agents would violate the one-way ingestion and read-only MCP invariant. Use read/query wrappers only [S3][S14][S24].
- **Hard tradeoff if adopted:** writing generated KG conclusions back into `memory/*.md`, `lessons.md`, or native Claude memory would create a two-writer system. Keep generated outputs rebuildable and route accepted edits through canonical markdown flows [S24].
- **Hard tradeoff if adopted:** making local-ai, FalkorDB, pgvector, or Graphiti required for normal Studio operation would violate fail-open/local-first behavior. These services should degrade gracefully [S1][S8][S11].
- **Hard tradeoff if adopted:** registry-wide retrieval by default would blur per-vault boundaries and risk applying local memory from one project to another. Default to vault scope and require explicit registry scope with provenance [S27].
- **Hard tradeoff if adopted:** treating semantic embeddings as a replacement for GitNexus or `jscpd` would conflate "similar text" with code reuse and clone detection. Keep GitNexus for symbol/process reuse and `jscpd` for structural code clones [S25][S26][S29][S30].
- **No tradeoff flagged:** cross-project read-only search over registry-scoped indexes is compatible with centralization and maintainability if it never copies memory/rules across vaults without explicit markdown edits [S27].

## Key Takeaways

- Phase 3 should build the graph memory backend as an index contract, not as a new authoring surface.
- Graphiti is useful because of temporal provenance and hybrid retrieval, but Luna should expose a narrower, read-only MCP facade.
- bge-m3 + pgvector is a good local semantic layer, especially if chunk metadata and rebuild versioning are strict.
- Corrections should be powerful retrieval signals, but durable changes still belong in protected markdown files reviewed by humans.
- Big-project vibe-coding failures need first-class tests: divergent fixes, forgotten architecture, duplicate logic, cross-vault bleed, and stale contradictions.
- Phase 4 is where context packs, correction inbox, drift alerts, and cross-project reuse become user-facing features.

## Sources

1. [Graphiti Introduction](https://getzep-graphiti.mintlify.app/introduction) — Graphiti temporal KG, incremental updates, hybrid retrieval, backend/provider options.
2. [Graphiti Bi-Temporal Data Model](https://getzep-graphiti.mintlify.app/concepts/temporal-model) — valid time, transaction time, contradiction invalidation, point-in-time retrieval.
3. [Graphiti MCP Server README](https://github.com/getzep/graphiti/blob/b59d4ba0/mcp_server/README.md) — MCP tools, group filters, Graphiti server defaults, FalkorDB/Neo4j support.
4. [Zep: A Temporal Knowledge Graph Architecture for Agent Memory](https://arxiv.org/html/2501.13956) — episodic/semantic/community graph tiers, hybrid retrieval, benchmarks.
5. [Anthropic: Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — context as finite resource, just-in-time retrieval, compaction, notes, subagents.
6. [Anthropic Memory Tool Docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) — client-side file memory outside the context window.
7. [Anthropic Context Management Announcement](https://www.anthropic.com/news/context-management?=) — memory and context editing for long-running agents.
8. [BAAI bge-m3 Model Card](https://huggingface.co/BAAI/bge-m3) — dense/sparse/multi-vector, multilingual, long input, hybrid retrieval guidance.
9. [GitHub Copilot New Embedding Model](https://github.blog/news-insights/product-news/copilot-new-embedding-model-vs-code/) — code/doc embedding retrieval gains, hard negatives, evaluation.
10. [pgvector Documentation](https://pgxn.org/dist/vector/) — Postgres vector similarity, HNSW/IVFFlat, exact/approximate search.
11. [FalkorDB Docs](https://docs.falkordb.com/) — OpenCypher graph database, full-text/vector/range indexes, GraphRAG features, Docker startup.
12. [Kuzu GitHub](https://github.com/kuzudb/kuzu) — embedded property graph database, Cypher, vector/full-text search.
13. [Graphiti Kuzu Integration](https://getzep-graphiti.mintlify.app/integrations/kuzu) — Kuzu as embedded Graphiti backend and schema considerations.
14. [MCP Memory Server README](https://github.com/modelcontextprotocol/servers/blob/main/src/memory/README.md) — reference memory KG tools and resource shape.
15. [MCP Memory Lightweight Read Modes PR](https://github.com/modelcontextprotocol/servers/pull/3959) — filters, observation limits, pagination to avoid context explosion.
16. [Chunking Code, Tables, and Markdown for RAG](https://ai-tldr.dev/learn/rag/chunking-and-ingestion/chunk-code-tables-markdown/) — markdown heading splitters, breadcrumbs, code-fence safety.
17. [RAG Chunking Best Practices](https://llmbestpractices.com/ai-agents/rag-chunking) — metadata keys, chunk sizes, parent expansion, chunker versioning.
18. [Qoder Self-Evolving Memory](https://www.alibabacloud.com/blog/how-we-built-a-self-evolving-memory-system-for-qoder_603368) — coding-agent memory generation, organization, retrieval, decay.
19. [AgentPatterns: Memory Synthesis from Execution Logs](https://agentpatterns.ai/agent-design/memory-synthesis-execution-logs/) — lessons extraction, verification, expiry, bloat risks.
20. [Agentic Memory Overview](https://aipatternbook.com/memory) — corrections as durable memory and automated extraction pattern.
21. [T-GRAG: Dynamic GraphRAG](https://arxiv.org/pdf/2508.01680) — temporal ambiguity, time-aware retrieval, temporal subgraphs.
22. [LedgerRAG](https://www.mdpi.com/2079-9292/15/7/1376) — evidence ledger, gap/drift/conflict triggers, auditability.
23. [Superpowers Subagent-Driven Development](../../../fork/superpowers/skills/subagent-driven-development/SKILL.md) — context isolation and controller-curated subagent context.
24. [sync-agent-views Contract](../../specs/2026-07-18-sync-agent-views-contract.md) — one-way generated views, MCP memory feed, protected files, native memory non-write.
25. [GitNexus / Code Intelligence Invariants](../../../AGENTS.md) — code graph impact and query-first codebase awareness.
26. [Dedupe Assistant Contract](../../specs/2026-07-19-dedupe-assistant-contract.md) — canonical corpus, lexical v1, semantic Phase 3 additive signal.
27. [Fleet Sync Contract](../../specs/2026-07-19-fleet-sync-contract.md) — central rules, project memory local, cross-project query later.
28. [Luna Studio Plan](../../plans/2026-07-18-luna-studio.md) — Phase 3 and Phase 4 alignment language.
29. [GitClear AI Copilot Code Quality 2025](https://www.gitclear.com/ai_assistant_code_quality_2025_research) — code-clone growth, reduced moved/refactored lines, AI code quality metrics.
30. [More Code, Less Reuse](https://doi.org/10.48550/arxiv.2601.21276) — AI-generated PRs and semantic redundancy / hidden technical debt.
31. [Effective Strategies for Asynchronous Software Engineering Agents](https://arxiv.org/pdf/2603.21489) — manager/delegate patterns, worktree isolation, structured instructions, integration overhead.
32. [Scout-and-Wave README](https://github.com/blackwell-systems/scout-and-wave) — practical disjoint-file ownership and worktree-isolated wave execution patterns.
33. [When Retrieval Hurts Code Completion](https://arxiv.org/html/2605.14478v1) — stale repository context biasing code generation toward obsolete APIs.
34. [Sourcegraph: Context Engineering](https://sourcegraph.com/blog/context-engineering) — retrieval, memory, tools, and context management as a production pipeline.

## Methodology

Sub-questions:

1. What memory architecture best fits coding agents over a moving markdown/codebase corpus?
2. How should retrieval assemble context packs from code graph, docs, memory, rules, and dedupe signals?
3. How should corrections become durable, queryable lessons without creating bloat or two-writer conflicts?
4. What chunking/embedding strategy fits bge-m3, markdown knowledge, and code?
5. What MCP memory query surface and guardrails preserve Luna's founding goals?
6. Which big / multi-project vibe-coding failures must Phase 3 prevent or expose?

Search variations included: `Graphiti temporal knowledge graph agents memory coding`, `agent memory architecture vector RAG knowledge graph hybrid`, `coding agents context engineering memory retrieval context packs`, `MCP memory server read_graph search_nodes open_nodes`, `bge-m3 embedding markdown code chunking retrieval metadata`, `GitHub Copilot code retrieval embeddings`, `RAG chunking markdown metadata provenance`, `dynamic GraphRAG staleness drift contradiction`, `agent memory correction lessons extraction`, `AI coding assistants duplicate code technical debt`, `multi-agent software engineering parallel agents conflicts divergent fixes`, and `stale repository context code completion retrieval`.

Deep-read sources: Graphiti introduction and temporal model [S1][S2], Zep paper [S4], Anthropic context engineering [S5], Graphiti MCP README [S3], Qoder memory system [S18], T-GRAG [S21], LedgerRAG [S22], asynchronous SWE agents [S31], stale repository context [S33], and AI-code duplication / redundancy sources [S29][S30]. Additional sources were used for validation, implementation risk, and local alignment.

Vendored reference skim: `fork/superpowers` contributed useful patterns for context isolation and controller-curated worker context [S23]. `fork/ECC` contributed high-level memory/context hygiene patterns, especially disabling unused MCPs to preserve context budget and treating worktrees/forks as the practical boundary for parallel sessions; it did not provide a directly reusable graph-memory design.

Known gaps: I did not run a live benchmark of bge-m3/local-ai, pgvector, FalkorDB, Kuzu, or Graphiti in this repo. Direct fetch of Kuzu docs returned 403, so Kuzu recommendations are lower confidence and should be verified before contract lock-in.

## File Index

| Ref | Path |
|---|---|
| ref:studio-plan | `docs/plans/2026-07-18-luna-studio.md` |
| ref:todo | `docs/TODO.md` |
| ref:sync-contract | `docs/specs/2026-07-18-sync-agent-views-contract.md` |
| ref:dedupe-contract | `docs/specs/2026-07-19-dedupe-assistant-contract.md` |
| ref:fleet-contract | `docs/specs/2026-07-19-fleet-sync-contract.md` |
| ref:graph-contract | `docs/specs/2026-07-19-graph-memory-backend-contract.md` |
| ref:graph-system-design | `docs/pre-official/research/2026-07-19-graph-memory-system-design.md` |
| ref:superpowers-subagents | `fork/superpowers/skills/subagent-driven-development/SKILL.md` |
| ref:ecc-shortform | `fork/ECC/the-shortform-guide.md` |
| ref:vibe-rules | `docs/VIBE_RULES.md` |
