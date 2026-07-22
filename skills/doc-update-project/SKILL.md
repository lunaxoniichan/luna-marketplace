---
name: doc-update-project
description: Use after a code change alters architecture, structure, schema, or API — sync the human/architecture docs so they match the code
---

# Doc update — project docs

Keep **project docs** (human/architecture class) in sync with code. This is the **project** half of
the doc obligation — agent docs (PLANS/TODO) belong to `doc-update-agent`. Never mix the two classes.

## Scope (project docs only)

| Doc | Update when |
|-----|-------------|
| `docs/README.md` | new/moved/renamed doc; ownership boundary shift; new agent keywords needed |
| `docs/SYSTEM_DESIGN.md` | architecture, mechanisms, data flow, or a new hook/agent changed |
| `docs/PROJECT_STRUCTURES.md` | files/dirs added/moved/removed; the tree or a table is now wrong |
| `docs/DATABASE_DESIGN.md` | schema, tables, columns, or migrations changed |
| `docs/DESIGN_SYSTEM.md` | tokens, components, or UI conventions changed |
| `docs/api/*` | endpoint, contract, or request/response shape changed |

## Lifecycle promote / supersede (canonical procedure)

When a concept is adopted or an official design is replaced, **use the shared lib — never hand
`git mv`**. Contract: `docs/specs/2026-07-19-doc-lifecycle-promote-demote-contract.md`.

| Situation | Op | Command |
|-----------|-----|---------|
| Concept adopted | `promote` | `node scripts/doc-lifecycle.mjs promote docs/pre-official/.../<file>.md` |
| Design superseded | `supersede` | `node scripts/doc-lifecycle.mjs supersede docs/specs/<old>.md --superseded-by docs/specs/<new>.md` |

Promote sets `lifecycle: official` + `status: active` and moves into the mapped official folder.
Supersede requires an existing `superseded_by` target, sets `status: superseded`, and moves to
`docs/post-official/legacy/` (or `completed-plans/` for `type: plan`).

**Single owned path.** Two entry surfaces only — this skill's CLI, or the Studio **Lifecycle**
panel — both calling the same `planLifecycleMove` / `applyLifecycleMove` (byte-identical). No
hand-rolled third path. Drift check: `node scripts/doc-lifecycle.mjs --check`.

Plan archival (`plans/` → `completed-plans/`) is owned by **`doc-update-agent`**.

## Process

1. Identify what changed this session (`git diff`, session edits).
2. For each affected doc, update **only** the stale sections — minimal diff, match existing voice.
   2.5. If a new module/path is documented inline in 2+ places → add `[ref]` to primary doc + File index row.
        If a new top-level doc was created → add a catalog row to `docs/README.md`.
        If an ownership boundary shifted → update the ownership table in `docs/README.md`.
3. Update trees/tables/diagrams that the change invalidated (e.g. a new `skills/` dir, a Mermaid node).
4. Verify cross-references still resolve (file paths, section anchors).
5. Report which docs changed and which were checked-but-unchanged.

## Do not

- Touch agent docs (`PLANS.md`, `TODO.md`) — that's `doc-update-agent`.
- Write specs here — design specs live in `docs/specs/`.
- Document code that doesn't exist yet (no speculative docs).
- Hand `git mv` for lifecycle moves — use `scripts/doc-lifecycle.mjs` / the lib.
- Leave the doc class boundary blurred — one fact, one canonical doc.
