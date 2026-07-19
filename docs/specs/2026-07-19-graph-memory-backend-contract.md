---
title: Graph memory backend — rebuildable KG + embeddings contract
scope: project
type: spec
lifecycle: official
status: active
keywords: [graph-memory, context-engineering, graphiti, embeddings, mcp, local-ai, phase-3]
related:
  - docs/plans/2026-07-18-luna-studio.md
  - docs/pre-official/research/2026-07-19-context-engineering-coding-agents.md
  - docs/pre-official/research/2026-07-19-graph-memory-system-design.md
  - docs/specs/2026-07-18-sync-agent-views-contract.md
  - docs/specs/2026-07-18-vault-crud-contract.md
  - docs/specs/2026-07-18-studio-server-actions-contract.md
  - docs/specs/2026-07-19-dedupe-assistant-contract.md
  - docs/specs/2026-07-19-fleet-sync-contract.md
updated: 2026-07-19
---

# Contract — graph memory backend (Phase 3)

> **Status:** ACTIVE — signed off 2026-07-19 (gate amends applied).
> Implements Luna Studio Phase 3: graph memory backend (`LUNA_MEMORY_KG`) as a rebuildable
> context index over canonical markdown. Phase 4 owns context packs, correction inbox,
> drift alerts, ADR why-view, and cross-project reuse UX.

## 1. Purpose / scope honesty

**v1:** build and query a rebuildable KG + embedding layer over canonical Luna knowledge so
agents can retrieve project rules, docs, lessons, memory notes, and related context with
provenance and scope boundaries.

**v1 does not make graph memory authoritative.** Markdown + git remain source of truth.
Graph tables, vector rows, generated JSON, and MCP query results are indexes that can be
dropped and rebuilt without data loss.

**Non-goals:**

| Out of v1 | Owner / when |
|-----------|--------------|
| Temporal reasoning UX ("what was true when?") | Phase 4; v1 keeps provenance timestamps only |
| Cross-project reuse product UX | Phase 4; Phase 3 may expose read-only scoped queries |
| Correction inbox / lesson merge UI | Phase 4; v1 indexes existing corrections only |
| Productized context packs | Phase 4 — not a Phase 3 MCP tool |
| Auto-writing `memory/*.md`, `lessons.md`, or native Claude memory | Never through graph-memory MCP |
| Replacing GitNexus code intelligence | Never; GitNexus stays the code graph |
| Replacing `jscpd` / `dedupe-guard` code-clone detection | Never; embeddings are additive retrieval signals |
| Making local-ai / Graphiti / FalkorDB / pgvector mandatory for Studio | Never; fail-open is load-bearing |

## 2. Source of truth and generated outputs

### 2.1 Canonical inputs

| Input | Role |
|-------|------|
| `docs/**/*.md` excluding generated / archive rules | Architecture, specs, plans, decisions, research |
| `rules/*.md` | Fleet-canonical shared rules in the plugin vault |
| `memory/**/*.md`, `.claude/memory/**/*.md` | Project / user memory notes when present |
| `.claude/rules/lessons.md` | Agent-owned durable corrections; indexed, never overwritten |
| `docs/generated/knowledge.json` | Optional input snapshot; **never silently trusted if stale** (§4.1) |
| Git metadata | Commit/source hash/freshness metadata for provenance |
| GitNexus query/context results | Optional retrieval lane for code symbols/processes; not ingested as markdown truth |

Generated rule views under `.claude/rules/**` and `.cursor/rules/**` are excluded except
for the protected `lessons.md` special-case. `docs/generated/**` is excluded as a source
except when consuming a generated feed explicitly as an input snapshot under §4.1.

### 2.2 Rebuildable outputs

| Output | Authority |
|--------|-----------|
| `{vault}/docs/generated/graph-memory/index.json` | Rebuildable file-backed index (gitignored) |
| KG nodes / edges / facts inside that index | Rebuildable from canonical inputs |
| Embedding rows (optional, in-index or pgvector later) | Rebuildable from chunks + model metadata |
| MCP query results | Read-only projections of indexes |
| Status / freshness reports | Rebuildable diagnostics |

No generated graph or embedding output may be edited by hand. No generated conclusion may
be written back to canonical markdown without going through the existing vault CRUD,
protected lessons, doc lifecycle, or sync flows.

## 3. Concrete v1 stack

| Layer | v1 choice | Confidence | Notes |
|-------|-----------|------------|-------|
| Corpus source | Vault walk + optional `knowledge.json` snapshot | High | Same canonical hygiene as dedupe / build-knowledge |
| Markdown chunking | Heading-aware chunks with source metadata | High | Code fences kept intact |
| Embeddings | Optional `bge-m3` via local-ai OpenAI-compatible API | Medium-High | Fail-open when down |
| Vector store | In-index vectors first; pgvector optional later | Medium | No hard Postgres dependency in v1 |
| KG framework | File-backed graph + optional Graphiti adapter | Medium-High | Graphiti enrichment when available |
| Graph backend | **File-JSON** locked for v1; FalkorDB optional adapter | Medium | Kuzu deferred; no Docker hard-dep |
| Code graph | GitNexus | High | Not duplicated in memory KG |
| MCP surface | Fixed read-only tool set (§5.1) | High | Mutation verbs rejected |

`LUNA_MEMORY_KG=off` skips optional enrichment and keeps lexical rebuild/query only.

## 4. Boundary / authorization

Graph-memory rebuild and query share the **same outer wall** as vault CRUD / gateway / fleet:

1. Clients (Studio Server Actions, MCP facade callers) pass **`vaultId` only** — never absolute
   roots, never client-supplied absolute paths.
2. **`resolveVaultRoot` + `buildAllowedVaultMap`** are the sole entry points for vault access.
3. Authorized vault is a **branded handle** (WeakSet); raw `vaultRoot` strings are rejected.
4. Paths are confined with **realpath** allow-list (plugin root + live registry projects that
   `existsSync`).
5. Unknown payload keys are rejected (`UNKNOWN_KEY`).
6. Dead / missing registry targets are **skipped with warnings** (fleet parity) — never invent
   roots.
7. CLI (`scripts/graph-memory.mjs`) uses the **same confinement path** as the gateway.
8. Registry-scope queries are explicit opt-in and **read-only**; they never copy memory or
   rules across vaults.

## 4.1 Stale `knowledge.json` behavior

When a rebuild consumes `docs/generated/knowledge.json` as a snapshot:

| Condition | Required behavior |
|-----------|-------------------|
| Snapshot missing | Rebuild from live vault markdown walk; do not fail solely for missing snapshot |
| Snapshot present but source files on disk disagree (hash / mtime policy) | **Warn**, mark status `stale-source`, prefer live vault walk for identities; never silently treat the snapshot as canonical truth |
| Index corrupt / unreadable | Fail loud with `INDEX_CORRUPT`; require rebuild |

Hash mismatch on a retrieved item → `stale: true` warning in the result (not hard refusal).
Hard refusal only for corrupt index or unauthorized vault.

## 5. Rebuild path

1. Authorize `vaultId` via §4.
2. Walk canonical markdown in the vault (and optional plugin rules when scope needs them).
3. Optionally load `knowledge.json` under §4.1 hygiene.
4. Split markdown into deterministic chunks with source path, heading path, source hash,
   lifecycle, status, type, scope, and chunker version.
5. Optionally enrich chunks with embeddings when local-ai is available.
6. Optionally extract KG nodes / edges / facts (file-backed; Graphiti adapter when available).
7. Write only under `{vault}/docs/generated/graph-memory/` (index-owned storage).
8. Emit status distinguishing: `complete`, `lexical-only`, `embedding-degraded`,
   `embedding-partial`, `kg-degraded`, `stale-source`, `failed`. Embedding status MUST
   include `embedded_count` / `chunk_total`; never report `embeddings: ok` / `mode: complete`
   when coverage is less than all chunks.

**Full rebuild guarantee:** deleting the graph-memory directory and re-running rebuild from
canonical markdown must restore the same active source identities for the same source tree
and tool versions. Model nondeterminism may change extracted summaries; tests assert stable
source identity, provenance, and cleanup — not byte-identical model text.

## 5.1 One-way ingestion and MCP read-only surface

| Direction | Allowed? | Notes |
|-----------|----------|-------|
| Canonical markdown → chunks → KG/vector index | Yes | Rebuildable pipeline |
| Index → MCP / gateway read/query result | Yes | Read-only |
| MCP / gateway → `memory/*.md` | No | Two-writer forbidden |
| MCP / gateway → `.claude/rules/lessons.md` / `.cursor/rules/lessons.mdc` | No | Protected |
| MCP / gateway → `~/.claude/projects/<slug>/memory/*` | No | Native memory is agent-owned |
| Generated KG conclusion → canonical docs | No direct write | Use vault CRUD / lifecycle / sync |

### Fixed v1 read-only tools

| Tool | Purpose | Max results |
|------|---------|-------------|
| `graph_memory_status` | Degraded/complete status + backend flags | n/a |
| `search_context` | Ranked context hits for a query string | 20 |
| `get_context_item` | Open one item by source identity / chunk id | 1 |
| `related_items` | Neighborhood / related sources for an item | 20 |
| `check_conflicts` | Conflicting lessons/facts for review | 20 |
| `recent_changes` | Recently rebuilt / hash-changed sources | 20 |

**DTO fields (hits):** `project_id`, `vault_id`, `source_path`, `source_kind`, `heading_path`,
`title`, `excerpt`, `lifecycle`, `status`, `source_sha256`, `content_sha256`, `lane`, `score`,
`why[]`, `stale` (bool), `scope`.

**Rejected:** any mutation verb or tool name matching `/^(add|delete|clear|write|mutate|upsert|remove)_/i`,
Graphiti-style `add_memory` / `delete_entity` / `clear_graph`, or payloads with `body`+`relPath`
write shapes aimed at memory/lessons/native paths. Server-side routes must reject these even if a
lower-level library supports them.

**Not in v1:** `context_pack_*` tools (Phase 4). Retrieval may include a read-only `why` explanation;
that is not a productized context pack.

## 6. Stable identity and orphan prevention

Every source-derived node must carry a stable source identity keyed to the markdown file and
source-local anchor (not extracted model text).

| Identity field | Requirement |
|----------------|-------------|
| `project_id` / `vault_id` | Required; no absolute machine paths in IDs |
| `source_path` | Required; vault-relative POSIX path |
| `source_kind` | Required; doc, rule, memory, lesson, plan, decision, etc. |
| `heading_path` or block anchor | Required where available; deterministic fallback when absent |
| `source_sha256` | Required for stale detection |
| `content_sha256` | Required for chunk-level edit detection |
| `lifecycle` / `status` | Required for ranking and stale/superseded warnings |
| `chunker_version` / `extractor_version` / `embedding_model` | Required where applicable |

On edit, delete, move, promote, demote, or supersede:

1. Rebuild compares current source identities against indexed identities.
2. Missing source identities are tombstoned or removed from active query results.
3. Changed source hashes mark existing extracted facts stale before replacement facts
   become active.
4. Deleted files leave no active orphan facts detached from a source path.
5. **v1 identity is path-keyed:** moves = old path retired + new path indexed. Optional
   logical document IDs are deferred.

## 7. Retrieval and ranking contract

Phase 3 defines candidate retrieval lanes; Phase 4 owns polished context packs.

| Lane | Use | Authority |
|------|-----|-----------|
| Lexical / keyword | Deterministic fallback and cheap exact-ish recall | Medium |
| Embedding similarity | Fuzzy markdown/memory recall when vectors exist | Medium |
| KG neighborhood | Related rules, decisions, lessons, contradictions | Medium |
| GitNexus | Code symbols, processes, impact, reuse checks | High for code graph |
| Dedupe assistant | Knowledge overlap / semantic redundancy signal | Advisory |
| Docs lifecycle/status | Authority and freshness ranking | High |
| Lessons/corrections | Behavioral constraints and user corrections | High when relevant |

Ranking must prefer: official architecture/spec/ADR over weak semantic matches; lessons when
query matches correction keywords; active plans / recent-fix docs for divergent-fix queries.
Retrieved items must explain why they appeared (`why[]`). Superseded or stale items appear only
with `stale: true` (and preferably alongside current evidence).

## 8. Correction / lesson loop

Corrections are durable queryable memory only when they exist in canonical protected files.
Phase 3 indexes them and boosts them when relevant, but it does not author new lessons.

## 9. Cross-project scope and vault boundaries

| Scope | Meaning | v1 behavior |
|-------|---------|-------------|
| `vault` | Current vault only | Default (Studio + CLI) |
| `vault+plugin` | Current vault plus plugin/fleet rules | Explicit opt-in |
| `registry` | All live registered vaults | Explicit opt-in read-only (CLI + gateway); Studio UI polish → Phase 4 |

Rules: provenance on every hit; never copy memory/rules across vaults; fleet-managed consumer
rules readable not editable; dead registry paths skipped with warnings.

## 10. Vibe-coding failure coverage

| Failure mode | Required countermeasure |
|--------------|-------------------------|
| Divergent fixing | Surface related active plans / recent-fix docs / lessons; include accepted diagnosis when present |
| Forgotten design / inventing anew | Rank official architecture/spec/ADR ahead of weak semantic matches |
| Redundant / duplicate functions | GitNexus lane for code; keep `jscpd` boundary separate |
| Knowledge duplication | Optional similarity signal into dedupe shape; never auto-merge |
| Cross-project leakage | Default vault scope; explicit registry + provenance |
| Stale context | Source hashes; `stale: true` + current evidence when available |
| Contradictions | `check_conflicts` surfaces conflict sets; no auto-picked truth |

## 11. Local-ai fail-open behavior

| Unavailable dependency | Required behavior |
|------------------------|-------------------|
| local-ai endpoint down | Lexical corpus builds; embeddings/extraction skipped; degraded status |
| embedding model missing | Keep lexical/KG paths; report model missing |
| graph backend / Graphiti down | Keep lexical (+ embedding if any); report KG unavailable |
| pgvector unavailable | Expected in v1 file-backed mode; not fatal |
| GitNexus stale/unavailable | Warn and omit code graph lane; do not fabricate callers |

No degraded mode may silently pretend semantic/KG retrieval succeeded.

## 12. Negative tests / acceptance

- [ ] **Read-only MCP:** mutation tool names/payloads rejected; no writes to `memory/*.md`,
      `.claude/rules/lessons.md`, `.cursor/rules/lessons.mdc`, or `~/.claude/projects/*/memory/*`.
- [ ] **Outer wall:** raw roots / unknown keys / unauthorized vaultId rejected; CLI uses same wall.
- [ ] **Rebuild from scratch:** delete `docs/generated/graph-memory/`, rebuild, same active source identities.
- [ ] **Local-ai fail-open:** with local-ai offline, lexical rebuild/query succeeds; status degraded.
- [ ] **Source edit cleanup:** chunk hash change → old facts stale/retired; new facts point at new hash.
- [ ] **Source delete cleanup:** deleted fixture leaves no active orphan facts for that path.
- [ ] **Generated-view exclusion:** generated `.claude`/`.cursor` rules excluded; `lessons.md` indexed.
- [ ] **Scope default:** vault query does not return another project's memory.
- [ ] **Fleet read-only:** graph-memory tools cannot edit/copy fleet-managed consumer rules.
- [ ] **Stale context warning:** stale/superseded items marked `stale: true`.
- [ ] **Contradiction surfaced:** conflicting lessons produce conflict results, not auto-truth.
- [ ] **Divergent fixing fixture:** query about a known fix surfaces related active plan / recent-fix doc when present.
- [ ] **Forgotten design fixture:** architecture/spec/ADR outranks a weak memory-only semantic match for design queries.
- [ ] **Dedupe / GitNexus boundaries:** no jscpd invocation; no invented callers/callees.
- [ ] **Stale knowledge.json:** mismatched snapshot does not become silent canonical truth.

## 13. Resolved decisions (were open questions)

1. **Identity:** path-keyed v1; logical doc IDs deferred.
2. **Backend:** file-JSON locked for v1; FalkorDB/Graphiti optional adapters; Kuzu deferred.
3. **MCP set:** fixed table in §5.1; no context-pack tools.
4. **Temporal:** provenance timestamps only until Phase 4 UX.
5. **Registry scope:** CLI + gateway in Phase 3; Studio UI defaults to vault; registry UX → Phase 4.
6. **Freshness:** warn + `stale`; hard refuse only for corrupt index / auth failures.

## 14. Out of scope

- UI flows for context packs, correction inbox, drift alerts, ADR why-view, or reuse search
- Auto-merging duplicate docs, lessons, rules, or code
- Writing native Claude memory (`~/.claude/projects/<slug>/memory/*`)
- Editing generated agent views or fleet-managed consumer rules
- Replacing GitNexus, `jscpd`, or the existing dedupe assistant
- Committing generated graph-memory indexes by default

## File index

| Ref | Path |
|-----|------|
| This contract | `docs/specs/2026-07-19-graph-memory-backend-contract.md` |
| Research report | `docs/pre-official/research/2026-07-19-context-engineering-coding-agents.md` |
| System design summary | `docs/pre-official/research/2026-07-19-graph-memory-system-design.md` |
| Studio plan | `docs/plans/2026-07-18-luna-studio.md` |
| Vault CRUD wall | `docs/specs/2026-07-18-vault-crud-contract.md` |
| Sync / MCP feed boundary | `docs/specs/2026-07-18-sync-agent-views-contract.md` |
| Dedupe assistant | `docs/specs/2026-07-19-dedupe-assistant-contract.md` |
| Fleet sync | `docs/specs/2026-07-19-fleet-sync-contract.md` |
| Knowledge builder | `scripts/build-knowledge.mjs` |
| Graph memory lib | `scripts/lib/graph-memory.mjs` |
| Graph memory CLI | `scripts/graph-memory.mjs` |
