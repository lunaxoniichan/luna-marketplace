---
title: Context Pack + Phase 4 context-engineering contract
scope: project
type: spec
lifecycle: official
status: active
keywords: [context-pack, drift, correction-inbox, reuse-search, adr, phase-4, context-engineering]
related:
  - docs/plans/2026-07-18-luna-studio.md
  - docs/pre-official/research/2026-07-19-context-engineering-coding-agents.md
  - docs/pre-official/research/2026-07-19-graph-memory-system-design.md
  - docs/specs/2026-07-19-graph-memory-backend-contract.md
  - docs/specs/2026-07-19-dedupe-assistant-contract.md
  - docs/specs/2026-07-18-vault-crud-contract.md
  - docs/specs/2026-07-18-sync-agent-views-contract.md
  - docs/specs/2026-07-18-studio-server-actions-contract.md
  - docs/specs/2026-07-19-doc-lifecycle-promote-demote-contract.md
  - docs/specs/2026-07-19-fleet-sync-contract.md
updated: 2026-07-21
---

# Contract — Context Pack + Phase 4 context-engineering features

> **Status:** ACTIVE — signed off 2026-07-22 (GO-WITH-AMENDS A1–A4 applied).
> Implements Luna Studio Phase 4: Context Pack builder, drift alerts, correction inbox,
> cross-project reuse search, and ADR why-view. Builds on the ACTIVE Phase 3 graph-memory
> contract; does **not** invent a second retrieval engine or a second memory writer.

## 0. Inputs already satisfied (do not re-litigate)

Phase 3 shipped these **gate amends** from
[ref:graph-system-design] `docs/pre-official/research/2026-07-19-graph-memory-system-design.md`
§"Open questions / gate amends". Phase 4 treats them as settled:

| Gate amend (Phase 3) | How Phase 3 satisfied it | Phase 4 consequence |
|----------------------|--------------------------|---------------------|
| Outer-wall language | Same vault wall as CRUD/gateway (`resolveVaultRoot` + `buildAllowedVaultMap`); vaultId-only | Reuse wall; never re-author path confinement |
| Concrete MCP tool set | Fixed read-only tools in graph-memory §5.1; mutation rejected | Pack/preview tools are read-only w.r.t. **canonical** sources; `context_pack_build` may write only the gitignored rebuildable index (§4) |
| Falsifiable failure-mode tests | Cross-vault, stale, orphan, local-ai degraded, generated-view exclusion | Extend with pack/drift/inbox negatives (§12) |
| Identity caveat | Path-keyed v1; logical doc IDs deferred | Packs store path + source_sha256; moves = drift (deleted old + new identity) |
| Backend lock | File-JSON default; Graphiti/FalkorDB deferred (T11) | Packs consume file-JSON (+ lexical); no Graphiti hard-dep |
| Registry scope UX | CLI + gateway in Phase 3; Studio UI default vault | Phase 4 productizes registry **read-only** reuse UX with mandatory provenance |

Research inputs (must remain cited):

- [ref:research] `docs/pre-official/research/2026-07-19-context-engineering-coding-agents.md` — packs as manifests; correction inbox; drift; read-only reuse
- [ref:graph-system-design] `docs/pre-official/research/2026-07-19-graph-memory-system-design.md` — Phase 4 handoff table
- [ref:graph-contract] `docs/specs/2026-07-19-graph-memory-backend-contract.md` — lanes, DTO fields, fail-open, two-writer ban

## 1. Purpose / scope honesty

**v1:** turn Phase 0–3 indexes (graph-memory, dedupe, docs lifecycle, GitNexus) into
**task-shaped, provenance-checked context** that agents and Studio can load without
hand-assembling or trusting stale pointers.

**v1 does not make packs or the KG authoritative.** Markdown + git remain source of truth.
Pack manifests under `docs/generated/context-packs/` are **gitignored rebuildable artifacts**.

**Non-goals:**

| Out of v1 | Owner / when |
|-----------|--------------|
| Hidden mega-prompt blobs stored as canonical memory | Never |
| Auto-writing `memory/*.md` or native Claude memory; writing `lessons.md` via vault-crud or without human accept | Never — two-writer ban; sole lesson write is the bounded accept append helper (D5) |
| Auto-editing sources when drift is detected | Never — detection only |
| Copying memory/rules across vaults on reuse hit | Never — read-only discovery |
| Full temporal "what was true when?" UX over Graphiti valid-time | Deferred (needs T11 adapters + provenance maturity) |
| Replacing GitNexus / jscpd / dedupe assistant | Never |
| Making local-ai mandatory for pack build | Never — fail-open |

## 2. Seven load-bearing decisions (must not regress)

### D1 — Context Pack = read-only, rebuildable manifest

**Ruling:** A Context Pack is a **manifest of pointers** (files / chunks / symbols / lessons)
with ranking reasons, source hashes, lanes used, freshness, and token accounting — **not** a
cached prose blob that becomes a second truth.

**Protects:** markdown+git source of truth; rebuildable indexes; agents load only what they need.

**Shape (normative fields):**

| Field | Required | Notes |
|-------|----------|-------|
| `pack_id` | yes | Stable id for the built artifact (not a vault path) |
| `vault_id` | yes | Authorized vault; never absolute machine path |
| `pack_type` | yes | `planning` \| `implementation` \| `review` |
| `task` | yes | Free-text task description used for ranking |
| `token_budget` | yes | Soft cap; pack must not exceed without explicit overflow report |
| `built_at` | yes | ISO timestamp |
| `scope` | yes | Default `vault`; see D4 |
| `items[]` | yes | Ranked entries (see below) |
| `lanes` | yes | Per-lane status: `ok` \| `unavailable` \| `degraded` + reason |
| `status` | yes | `ok` \| `lexical-only` \| `degraded` \| `empty` |
| `source_hashes` | yes | Map of included `source_path` → `source_sha256` at build time |

**Item DTO (extends graph-memory hit fields):**

`project_id`, `vault_id`, `source_path`, `source_kind`, `heading_path?`, `title`, `excerpt?`,
`lifecycle`, `status`, `source_sha256`, `content_sha256?`, `lane`, `score`, `why[]`,
`token_estimate`, `stale?`, `scope`.

**Rejected:** storing full file bodies in the pack as the primary payload; writing pack contents
into `memory/*.md` or agent rules; treating pack JSON as editable canonical knowledge.

### D2 — Ranking reuses graph-memory lanes + typed packs + token budget

**Ruling:** Pack assembly **fans out to existing lanes** via `invokeGraphMemoryTool` (and
dedupe signals / GitNexus advisory). No second retrieval engine. Typed presets change
**weights and preferred kinds**, not the index.

| Pack type | Prefer | Deprioritize |
|-----------|--------|--------------|
| `planning` | specs, architecture, ADRs, open questions, active plans | large implementation diffs, low-authority memory |
| `implementation` | active plan task, impacted symbols (GitNexus), tests, current rules/lessons | exploratory research noise |
| `review` | acceptance criteria, security/perf rules, recent corrections, diff-adjacent docs | planning brainstorm dumps |

**Token budget:** fuse/rank then truncate by estimated tokens; report `truncated: true` +
dropped item ids when budget binds. Prefer authority (official/active) and lessons over weak
semantic ties (same ranking spine as graph-memory §7).

**Protects:** one retrieval stack to maintain; task-shaped context without context explosion.

### D3 — Drift = source-hash + lifecycle/status deltas (detection only)

**Ruling:** `detectPackDrift(packManifest)` recomputes current source hashes and lifecycle/
status against the manifest snapshot and classifies:

| Class | Trigger |
|-------|---------|
| `source-changed` | `source_sha256` mismatch on an included path |
| `source-deleted` | path missing from vault |
| `superseded-plan` | plan/doc now `status: superseded` or has `superseded_by` |
| `archived` | lifecycle moved to `post_official` / archive bucket |
| `stale-lesson` | lessons file hash changed (`.claude/rules/lessons.md` and/or `.cursor/rules/lessons.mdc`), or a previously included lesson **line text** is no longer present verbatim |
| `kg-hash-mismatch` | graph-memory index reports stale for an included identity (advisory) |

**Detection only** — never auto-edits markdown, never auto-rebuilds packs into commits, never
"fixes" by rewriting sources.

**Canonical-only false-positive guard:** churn under generated `.claude/rules/**` and
`.cursor/rules/**` (except protected `lessons.md` / `lessons.mdc`) **MUST NOT** flag drift.
Packs reference **canonical** sources only (same exclusion set as graph-memory / dedupe).
Stable per-line lesson IDs are **deferred** (§8 logical document IDs); v1 uses file hash and
verbatim line-presence only.

**Protects:** stale-context bias (agents trusting obsolete APIs); human control of remediation.

### D4 — Cross-project reuse respects per-vault walls + fleet read-only

**Ruling:**

| Scope | Default? | Behavior |
|-------|----------|----------|
| `vault` | **yes** | Current vault only |
| `vault+plugin` | explicit | Current vault + plugin/fleet rules (read) |
| `registry` | explicit | All live registered vaults — **read-only**; every hit provenance-labeled |

Provenance on every registry hit: `project_id`, `vault_id`, `source_path`, `source_sha256`
(and preferably title/lifecycle). **Never** copy memory or rules into the consumer vault from
a reuse hit. Fleet-managed consumer rules stay readable, not editable, via existing fleet
contract.

**Protects:** cross-vault bleed; secrets-adjacent / unreviewed preference leakage.

### D5 — Correction inbox accept uses one dedicated lesson append helper

**Ruling (fact check):** `vault-crud` treats `lessons.md` as `NEVER_BASENAMES` —
`assertAllowedPath` throws `PATH_PROTECTED`. `sync-agent-views` **skips** `lessons.md` as
protected-source-ignored; it never persists an accepted lesson. The only existing append-a-lesson
implementation today is `scripts/lib/approach-correction.py::append_lesson_line` (hook path).
There is no Node writer yet. Phase 4 therefore **owns exactly one new bounded writer** of
lessons — it must collapse onto that format, not invent a second format or route through CRUD.

**Accept path (normative):**

1. **Append-only** exactly one `- AVOID … — DO … (date)` line (optional `[portable] ` prefix)
   to **both** `.claude/rules/lessons.md` **and** `.cursor/rules/lessons.mdc`, via a **single
   dedicated append helper** that reuses `approach-correction.py::append_lesson_line`'s line
   format + keyword-overlap dedup logic (do not reimplement the format — divergence = T13 debt).
   Implementation may (a) shell out to that Python function or (b) provide a Node helper that
   shares the same format/dedup contract — either is fine; both must write the **.mdc mirror**.
2. The helper is **append-only**: never rewrite/truncate the file; never route through
   `vaultCreate` / `vaultUpdate` (those throw `PATH_PROTECTED`).
3. **Optional** post-accept `sync-agent-views`: if run, it **only** refreshes other generated
   Claude/Cursor views. It is **not** what persists the lesson (lessons are skipped by sync).
   Do not document sync as the lesson write path.

**Rejected:** writing `memory/*.md`; writing native `~/.claude/projects/*/memory/*`; wholesale
overwrite of lessons files; accept via vault-crud; a Node path that writes `.md` but forgets
`.mdc` (silent Claude↔Cursor desync). Reject writes nothing. Inbox candidates stay read-only
until accept.

**Protects:** two-writer invariant by collapsing onto the one lesson-writer format (hook + inbox
share format); keeps vault-crud protection intact.

### D6 — Fail-open when local-ai / embeddings / GitNexus degraded

**Ruling:** Pack still assembles from **lexical + available graph-memory lanes**. Missing
embeddings → `lanes.embedding: unavailable`, pack `status: lexical-only` (or `degraded`),
items still returned when lexical/KG/docs hits exist. GitNexus down/unindexed → omit code
lane with warning; do not fabricate callers. Drift detection must not crash without local-ai
(hash/lifecycle compare is pure filesystem + front-matter).

**Protects:** local-first / founding fail-open; packs usable before model server is healthy.

### D7 — Honest v1 vs deferred + falsifiable negatives

**Ruling:** Ship only what §3 and §11 list as v1; name deferred work explicitly; every
negative in §12 must be a test before claiming a slice done.

**Protects:** provable "done" instead of asserted completion (Phase-3 review lesson).

## 3. Concrete v1 stack (slices)

| Slice | Deliverable | Lib / surface |
|-------|-------------|-----------------|
| **S1a** Context Pack builder | `buildContextPack(...)` → manifest | `scripts/lib/context-pack.mjs`; CLI `scripts/context-pack.mjs` (`preview`/`build`); wipe + gitignore under `docs/generated/context-packs/`; Studio `ContextPackPanel` + read-only server action |
| **S1b** Drift alerts | `detectPackDrift(manifest)` | Same lib; surface in panel |
| **S2** Correction inbox | Candidate list + accept/reject | `scripts/lib/correction-inbox.mjs` (or equivalent); `CorrectionInboxPanel`; accept → dedicated lesson append helper (D5) only |
| **S3** Reuse search + ADR why-view | Registry-scoped search; ADR render | Read-only gateway/actions; ADR view over `docs/decisions/*` (no lifecycle mutation) |

### 3.1 Rebuildable outputs

| Output | Authority |
|--------|-----------|
| `{vault}/docs/generated/context-packs/*.json` | Rebuildable; **gitignored**; wipeable |
| Studio/CLI preview DTOs | Ephemeral projections |
| Inbox candidate lists | Rebuildable / ephemeral; durable only after accept → lessons.md + lessons.mdc via append helper |

### 3.2 Boundary / authorization

Same outer wall as vault CRUD / graph-memory / Studio actions:

1. Clients pass **`vaultId` only** (plus task, packType, tokenBudget, scope when explicit).
2. `resolveVaultRoot` + `buildAllowedVaultMap` sole vault entry.
3. Unknown payload keys rejected.
4. CLI uses the same confinement path.
5. Registry scope is explicit opt-in and read-only.

## 4. API sketch (normative for implementers)

```
buildContextPack({
  vault,                 // branded handle OR vaultId resolved server-side
  task: string,
  packType: 'planning' | 'implementation' | 'review',
  tokenBudget: number,
  scope?: 'vault' | 'vault+plugin' | 'registry',  // default vault
}) → PackManifest

detectPackDrift(packManifest) → {
  ok: boolean,
  drifts: Array<{ class, source_path, detail }>,
  checked_at: string,
}

// Correction inbox (S2)
listCorrectionCandidates({ vault, ... }) → candidates[]   // read-only
acceptCorrection({
  vault,
  candidateId,
  // Structured fields only — NOT caller-supplied prose for the persisted line.
  // The shared formatter (same contract as approach-correction.py::append_lesson_line)
  // produces: `- [portable ]?AVOID {what} — DO {preference} ({YYYY-MM-DD})`
  what_claude_did: string,
  implied_preference: string,
  applies_to?: 'this_project' | 'all_projects',
}) → { ok, appended: boolean, deduped?: boolean }
// sole durable write = append helper → lessons.md + lessons.mdc
// must NEVER call vaultCreate/vaultUpdate (PATH_PROTECTED)
// optional sync-agent-views after: refreshes other generated views only; not the lesson write

rejectCorrection({ vault, candidateId })                  // → no durable write
```

Studio Server Actions: vaultId-only gate key; build/drift/reuse/ADR are read-only w.r.t.
canonical sources (build may write gitignored pack JSON only). `acceptCorrection` is the sole
Phase-4 canonical write and **must** call the dedicated lesson append helper — never
`vaultCreate`/`vaultUpdate` into lessons or memory.

Optional MCP/tool names (canonical-source posture):

| Tool | Writes? | Notes |
|------|---------|-------|
| `context_pack_preview` | No | Ephemeral DTO |
| `context_pack_build` | Yes — **only** `{vault}/docs/generated/context-packs/` (gitignored rebuildable index) | **Not** "writes nothing"; read-only w.r.t. canonical markdown |
| `context_pack_drift` | No | Detection only |

Mutation-shaped names / payloads aimed at memory/lessons/native paths are rejected per
graph-memory rules. Pack build must not be labeled simply "read-only" without the canonical
vs. index distinction (honesty invariant D7).

## 5. ADR why-view (S3)

**Ruling:** Read-only render of `docs/decisions/*` (and related front-matter `related` /
`supersedes` links to plans/specs). Answers "*why* is it this way?" No promote/demote from
this view — lifecycle stays on existing doc-lifecycle contract / Phase 5 skill ownership.

## 6. Vibe-coding failure coverage (Phase 4 product layer)

| Failure mode | Phase 4 countermeasure |
|--------------|------------------------|
| Forgotten design / inventing anew | Pack ranks architecture/spec/ADR; ADR why-view |
| Divergent fixing | Implementation pack prefers active plan + lessons; related recent-fix context |
| Duplicate / redundant knowledge | Dedupe lane into pack ranking; inbox surfaces dup lessons |
| Cross-project leakage | Default vault; registry provenance; no copy |
| Stale context | Drift detection on packs; stale flags on items |
| Correction noise / two writers | Human inbox; accept only via dedicated lesson append helper (D5) |

## 7. Local-ai / dependency fail-open

| Unavailable | Required behavior |
|-------------|-------------------|
| Embeddings / local-ai | Lexical (+ KG if present) pack; `lexical-only` / degraded status |
| Graph-memory index missing | Attempt lexical/docs walk or prompt rebuild; do not invent semantic hits |
| GitNexus | Omit code lane; warn |
| Dedupe index | Omit dedupe signals; pack still builds |
| KG / Graphiti | Already optional (T11); no crash |

## 8. Honest v1 vs deferred

| Area | Phase 4 v1 | Deferred |
|------|------------|----------|
| Pack | Manifest + typed presets + token budget + Studio panel | Auto-inject pack into agent session / Ultraplan |
| Drift | Hash + lifecycle + verbatim lesson line-presence; UI warnings | Auto-remediation; pack auto-rebuild commits; per-line lesson logical IDs |
| Inbox | Candidates + accept→append helper (lessons.md + .mdc) / reject | Auto-merge; KG-decided truth; vault-crud lesson writes |
| Reuse | Registry read-only search + provenance | Cross-vault memory sync / adapt wizards that write |
| ADR | Read-only why-view | Temporal valid-time browser over Graphiti |
| Identity | Path + source_sha256 | Logical document IDs across moves |
| Graphiti adapters | Consume file-JSON | T11 enrichment |

## 9. Residual T-items (between slices; non-blocking)

Tracked in roadmap / `docs/TODO.md`; may run between Phase-4 slices:

| ID | Summary |
|----|---------|
| T7 | Front-matter on architecture docs; content-aware `build-docs-index --check` |
| T8 | Studio archive hint after plan demote (no auto-commit) |
| T12 | Honest `recent_changes` mtime ordering in graph-memory |
| T13 | Shared util consolidation (`sha256`, exclusion filter, `today()`, relpath); also keep lesson line format/dedup single-sourced with `approach-correction.py` (D5/A4) |

## 10. Implementation order (after ACTIVE)

1. Sign-off → flip this contract `draft` → `active`
2. **4.1** S1a Context Pack builder + tests
3. **4.2** S1b Drift alerts + tests (shares hashes)
4. Optional T-items while slice in review
5. **4.3** S2 Correction inbox + two-writer negative tests
6. **4.4** S3 Reuse search + ADR why-view
7. Phase 5 (separate) — lifecycle skill ownership + registry polish

## 11. Global verification (each slice)

```bash
for t in generators hooks sync-agent-views fleet-sync vault-crud vault-gateway \
         doc-lifecycle plans-registry knowledge-dedupe graph-memory studio; do
  npm run test:$t; done
# plus new: npm run test:context-pack (and test:correction-inbox when S2 lands)
npm run studio:typecheck
npm run build:indexes
node scripts/build-plans-registry.mjs --check
node scripts/doc-lifecycle.mjs --check
npm run jscpd
```

Invariant gate every slice: no new writer of memory/native; sole lessons writer is the D5
append helper (format shared with `approach-correction.py`); generated artifacts gitignored +
wipeable; query/MCP read-only w.r.t. canonical sources (`context_pack_build` may write the
gitignored pack index only); default scope = vault; local-ai down still yields a usable pack.

## 12. Negative tests / acceptance (falsifiable)

- [ ] **Pack writes only under** `docs/generated/context-packs/` (gitignore + wipe); never under
      `memory/`, `.claude/rules/`, `.cursor/rules/`, or native memory.
- [ ] **Manifest carries** `source_sha256` for every included source path.
- [ ] **Token budget enforced** — over-budget items truncated; `truncated` reported.
- [ ] **Fail-open pack:** embeddings/GitNexus down → lexical (or available-lane) pack returns;
      lane status marks unavailable; no throw pretending semantic success.
- [ ] **Default scope:** vault pack/search excludes other projects' memory.
- [ ] **Registry provenance:** every registry hit labels project/vault/path/source hash; no write
      into consumer vault.
- [ ] **Drift on edit:** change a canonical source → `source-changed` (or deleted).
- [ ] **Generated-view false-positive guard:** sync churn of generated `.claude`/`.cursor` views
      does **not** flag drift.
- [ ] **Superseded plan drift:** demote/supersede via doc-lifecycle → drift class fires.
- [ ] **Drift without local-ai:** detection succeeds with embeddings unavailable.
- [ ] **stale-lesson falsifiable:** lesson drift uses file-hash and/or verbatim line-presence only
      (no claim of stable per-line IDs).
- [ ] **Accept correction:** durable write only via the dedicated append helper → exactly one
      formatted line in `.claude/rules/lessons.md` **and** `.cursor/rules/lessons.mdc`; not to
      `memory/*.md` or native memory. Persisted line is formatter-owned (A4), not raw `text`.
- [ ] **acceptCorrection vs vault-crud:** routing accept through `vaultCreate`/`vaultUpdate` is
      refused (`PATH_PROTECTED`); the sole write is the append helper touching only `lessons.md`
      + `lessons.mdc`.
- [ ] **Optional sync after accept:** if `sync-agent-views` runs, lessons files are unchanged by
      sync (protected-source-ignored); sync is not the lesson persistence path.
- [ ] **Reject correction:** no durable write.
- [ ] **Protected files:** `RULES.md`, `*.local.*`, `luna.mdc` untouched by pack/inbox; accept
      never wholesale-rewrites lessons files.
- [ ] **Two-writer attempt rejected:** any pack/inbox/MCP path that tries to write memory/
      native/lessons outside the D5 append helper is rejected.
- [ ] **ADR why-view read-only:** viewing an ADR does not mutate lifecycle/status.
- [ ] **Fleet read-only:** reuse/pack tools cannot edit fleet-managed consumer rules.

## 13. Out of scope

- Phase 5 skill ownership moves and Obsidian/OAM follow-ups
- T11 Graphiti/FalkorDB adapters
- Auto-commit of packs or PLANS.md from Studio
- Playwright full interactive smoke (carry-along; not a Phase-4 contract blocker)

## File index

| Ref | Path |
|-----|------|
| This contract | `docs/specs/2026-07-20-context-pack-contract.md` |
| Research | `docs/pre-official/research/2026-07-19-context-engineering-coding-agents.md` |
| System design | `docs/pre-official/research/2026-07-19-graph-memory-system-design.md` |
| Graph-memory contract | `docs/specs/2026-07-19-graph-memory-backend-contract.md` |
| Studio plan | `docs/plans/2026-07-18-luna-studio.md` |
| Vault CRUD | `docs/specs/2026-07-18-vault-crud-contract.md` |
| Sync / lessons protection | `docs/specs/2026-07-18-sync-agent-views-contract.md` |
| Studio actions | `docs/specs/2026-07-18-studio-server-actions-contract.md` |
| Dedupe | `docs/specs/2026-07-19-dedupe-assistant-contract.md` |
| Doc lifecycle | `docs/specs/2026-07-19-doc-lifecycle-promote-demote-contract.md` |
| Fleet | `docs/specs/2026-07-19-fleet-sync-contract.md` |
| Lesson append (existing format owner) | `scripts/lib/approach-correction.py` (`append_lesson_line`) |
| Context pack lib | `scripts/lib/context-pack.mjs` |
| Context pack CLI | `scripts/context-pack.mjs` |
| Context pack tests | `tests/scripts/context-pack.test.mjs` |
| Roadmap (remaining work) | `~/.claude/plans/please-review-what-we-wondrous-lake.md` |
