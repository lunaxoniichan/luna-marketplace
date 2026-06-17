---
name: dev-refactor
description: Use for dedicated dedupe/cleanup sprints across a repo or domain area — inventory clones, consolidate, reshape modules, delete dead code. Not for PR-time diff passes (use review-simplify).
---

# Dev refactor

Orchestrate **multi-session cleanup sprints** for accumulated vibe-code debt. **Preserve exact behavior**
unless the user explicitly approves a behavior change.

**Announce:** "Using dev-refactor for a cleanup sprint."

## When to use

- Repo-wide or domain-area dedupe initiative
- Merging duplicate/redundant functions after long vibe-coding
- Module reshaping (god-files, unclear boundaries)
- Dead/legacy code removal with test gates
- `refactor` workflow variant in `WORKFLOW.md`

## When NOT to use

- Post-change tidy-up on a single PR → **`review-simplify`** (diff-scoped only)
- Active feature development — finish the feature first
- Right before production deploy without test coverage

## Boundary vs `review-simplify`

| | **dev-refactor** (this skill) | **review-simplify** |
|---|-------------------------------|---------------------|
| Scope | Repo or domain area | Changed files only |
| Output | Inventory + `docs/plans/<cleanup>.md` | Simplify report |
| Phases | A→B→C→D multi-session | One pass |

`dev-refactor` may invoke `review-simplify` **only** as a post-batch spot-check on files just edited
in Phase B/C — never to re-run inventory.

## Prerequisites

1. GitNexus indexed: `npx gitnexus analyze` in **each** repo you will edit (parent + submodules)
2. `.jscpd.json` at repo root (`doc-init` or `templates/.jscpd.json`)
3. Tests runnable for affected areas (`dev-verify`)

## Monorepo + git submodules

Parent repo + submodule checkouts = **multiple GitNexus indexes**, not one graph.

### Index checklist (run once per sprint)

| Repo | When | Command |
|------|------|---------|
| Parent (e.g. backend + frontend in-tree) | Before Phase A | `cd <parent> && npx gitnexus analyze` |
| Each submodule you will edit | Before editing that tree | `cd <submodule> && npx gitnexus analyze` |
| Product group (cross-module dupes) | Before Phase A semantic pass | `group_sync` then `group_status` / `group_list` |

Hooks (automatic):

- **`gitnexus-freshness`** — sync reindex parent before stale `query` / `impact` / `rename` / `group_query` reads
- **`gitnexus-post-commit`** — async parent reindex after commit; **`gitnexus-submodule-sync`** reindexes submodules when you commit inside them or bump submodule pointers
- **`gitnexus-submodule-advisory`** — warns when Read/Write/Edit touches a submodule with missing/stale index

### Submodule commit workflow (accuracy)

1. Edit and commit **inside the submodule** on its branch
2. Bump submodule pointer in parent; commit parent separately
3. Run tests at the integration boundary (compose / E2E) after pointer bump
4. `detect_changes` in the repo you committed

### Cross-module inventory (Phase A)

1. One **jscpd** pass at parent root (covers checked-out submodule files on disk)
2. **`group_query`** for concepts spanning modules (e.g. "paper broker", "portfolio sell", "bot trade mirror")
3. Per-repo **`query`** for in-tree areas (backend/, frontend/, etc.)
4. Tag each cluster: **in-module** | **cross-module** | **contract-bound** (canonical doc wins — merge code to match contract, not vice versa)

### Cross-module consolidate (Phase B)

- Pick **one canonical repo** per cluster (often backend or shared contract owner)
- Never merge across language boundaries without contract + test fixtures (e.g. Python pipeline + JS overlay)
- `impact` in **both** repos before deleting the loser

See [`docs/specs/monorepo-refactor-playbook.md`](../specs/monorepo-refactor-playbook.md) for a copy-paste plan template.

## Phase A — Inventory

Goal: ranked lists before any edits.

1. **jscpd baseline** — full-repo clone inventory:
   ```bash
   npm run jscpd
   npm run jscpd:json   # machine-readable report in .jscpd-report/
   ```
2. **GitNexus semantic dupes** — per domain area, run `query` (single repo) or `group_query`
   (multi-module). Examples: "auth validation", "plan registry", "hook dispatch".
3. **Delete candidates** (graph hints only — not proof):
   ```cypher
   MATCH (f:Function)
   WHERE NOT EXISTS { MATCH ()-[:CodeRelation {type: 'CALLS'}]->(f) }
   RETURN f.name, f.filePath
   LIMIT 100
   ```
4. **Triage** — pick canonical impl per cluster: most callers, best tests, newest public API.

**Output table:**

```markdown
## Refactor inventory — <domain>
| Type | Location A | Location B | Canonical | Risk |
|------|------------|------------|-----------|------|
| jscpd clone | … | … | … | low/med/high |
| semantic dupe | … | … | … | … |
| delete candidate | … | — | — | high until tested |
```

Write or update `docs/plans/<cleanup>.md` with batched tasks (one cluster or module per task).

## Phase B — Consolidate

For each duplicate cluster (small batches):

1. Read **`gitnexus-impact-analysis`** — `impact` on symbol to keep vs remove
2. Merge implementation into canonical location
3. Read **`gitnexus-refactoring`** — `rename` with `dry_run: true`, review, then apply
4. `detect_changes` — confirm affected processes match expectation
5. `dev-verify` — tests green before next batch
6. Optional: **`review-simplify`** on files just edited (spot-check only)

## Phase C — Reshape

Module boundaries and file sizing (human judgment required):

1. Read **`gitnexus-exploring`** — clusters/communities as *hints* for module splits
2. Flag god-files: >800 lines or functions >50 lines (advisory)
3. Update **`docs/PROJECT_STRUCTURES.md`** before large moves
4. Extract modules per **`gitnexus-refactoring`** extract checklist
5. `detect_changes` + `dev-verify` after each extraction batch
6. Optional: **`review-simplify`** on extracted files

## Phase D — Delete (last, highest risk)

1. Only symbols with **zero inbound impact** (depth-3 `impact`) **and** test coverage on remaining paths
2. Never delete on graph alone — dynamic dispatch, DI, and framework magic fool static analysis
3. Small PRs; `impact` + `detect_changes` on each deletion batch
4. Keep deprecated aliases one release if public API

## Human gates (no tool solves)

- OOP / single-responsibility judgment
- Behavioral equivalence when merging similar-but-not-identical functions
- "Right number of files" — not too many tiny files, not god-files

Document target module map in project docs **before** large reshapes.

## Plan traceability

During plan work, commits carry `Plan: docs/plans/<cleanup>.md#phase-N` (see `dev-commit`).

## Do not

- Duplicate `gitnexus-refactoring` or `gitnexus-impact-analysis` checklists — read those skills
- Run full-repo inventory inside `review-simplify` workflows
- Delete code without tests on affected flows
- Combine cleanup sprint with unrelated feature work in the same batch
