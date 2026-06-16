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
| `docs/SYSTEM_DESIGN.md` | architecture, mechanisms, data flow, or a new hook/agent changed |
| `docs/PROJECT_STRUCTURES.md` | files/dirs added/moved/removed; the tree or a table is now wrong |
| `docs/DATABASE_DESIGN.md` | schema, tables, columns, or migrations changed |
| `docs/DESIGN_SYSTEM.md` | tokens, components, or UI conventions changed |
| `docs/api/*` | endpoint, contract, or request/response shape changed |

## Process

1. Identify what changed this session (`git diff`, session edits).
2. For each affected doc, update **only** the stale sections — minimal diff, match existing voice.
3. Update trees/tables/diagrams that the change invalidated (e.g. a new `skills/` dir, a Mermaid node).
4. Verify cross-references still resolve (file paths, section anchors).
5. Report which docs changed and which were checked-but-unchanged.

## Do not

- Touch agent docs (`PLANS.md`, `TODO.md`) — that's `doc-update-agent`.
- Write specs here — design specs live in `docs/specs/`.
- Document code that doesn't exist yet (no speculative docs).
- Leave the doc class boundary blurred — one fact, one canonical doc.
