---
title: Monorepo + submodule refactor playbook
scope: project
type: spec
lifecycle: official
status: active
keywords: [monorepo, submodule, refactor, jscpd]
related: []
updated: 2026-06-17
---

# Monorepo + submodule refactor playbook

Copy into your app's `docs/plans/<cleanup>.md` when running a **`dev-refactor`** sprint on a
parent repo with git submodules (e.g. flynance-main + data-pipeline + flynance-live).

## Preconditions

- [ ] Luna Agent Kit ≥ 0.2.1 (jscpd + `dev-refactor` + submodule hooks)
- [ ] `.jscpd.json` at parent root (`doc-init`)
- [ ] `npx gitnexus analyze` in parent and each submodule you will edit
- [ ] `group_sync` for the product group (parent + submodules)
- [ ] Tests identified per area: backend pytest, frontend Jest, pipeline pytest, etc.

## Index map (fill in)

| GitNexus repo name | Path | Submodule? | Last analyzed |
|--------------------|------|------------|---------------|
| | `./` | no | |
| | `data-pipeline/` | yes | |
| | `flynance-live/` | yes | |

## Phase A — Inventory

### jscpd (parent root)

```bash
cd <parent> && npm run jscpd && npm run jscpd:json
```

Bucket clones by path prefix; ignore `external_libs/`, `docs/_archive/`, `**/research/**`.

### group_query (cross-module concepts)

Run one query per row; record hits in both repos.

| Concept | group_query text | Canonical owner (TBD) |
|---------|------------------|------------------------|
| Paper broker fills | paper broker slippage commission | data-pipeline contract |
| Portfolio sell / lots | portfolio sell FIFO lots | backend |
| Bot trade mirror | bot trade mirror community | backend + bot-client |
| Market data write | prefect flow market postgres | data-pipeline |

### Per-area query (in-repo)

| Area | Path | query examples |
|------|------|----------------|
| Backend | `backend/` | auth, portfolio, notifications |
| Frontend | `frontend/` | hooks, money parsing, activity form |
| Pipeline | `data-pipeline/` | prefect flows, paper_broker |
| Live | `flynance-live/` | stream overlay, paper_broker.js |

### Inventory table

| ID | Type | Location A | Location B | Canonical | Risk | Batch |
|----|------|------------|------------|-----------|------|-------|
| C1 | jscpd | | | | | B1 |
| C2 | semantic | | | | cross-module | B2 |

## Phase B — Consolidate (batches)

One batch = one cluster. Order: **cross-module contract dupes first**, then in-module.

Per batch:

1. `impact` on keep vs remove (correct repo)
2. Merge / `rename` (`dry_run` first)
3. `detect_changes`
4. Area tests (`dev-verify`)
5. Submodule: commit inside submodule → bump pointer → parent integration test

## Phase C — Reshape

Update the relevant `*/docs/PROJECT_STRUCTURES.md` before large moves. Parent
[`docs/PROJECT_STRUCTURES.md`](PROJECT_STRUCTURES.md) only for top-level layout changes.

## Phase D — Delete

Last. Zero inbound `impact` + tests only. Extra caution: Prefect flows, Celery, dynamic routes.

## Hooks (automatic)

| Hook | When |
|------|------|
| `gitnexus-freshness` | Stale read on `query` / `impact` / `rename` / `group_query` → sync reindex |
| `gitnexus-post-commit` | Async parent reindex after commit |
| `gitnexus-submodule-sync` | Async submodule reindex after commit inside submodule or pointer bump |
| `gitnexus-submodule-advisory` | Warn on edit/read when submodule index missing/stale |
| `dedupe-guard` | jscpd advisory on staged commits |

Opt-out: `LUNA_GITNEXUS_AUTOSYNC=off`, `LUNA_GITNEXUS_SUBMODULE_ADVISORY=off`.
