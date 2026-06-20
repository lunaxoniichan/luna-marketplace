# Documentation

## Catalog (`docs/README.md`)

`docs/README.md` owns the doc map, catalog table, ownership rules, and read order.
Per-doc File index sections own path resolution for that doc's `[ref]` tags.
`AGENTS.md` links to `docs/README.md`; it does not duplicate the catalog.
Archive (`_archive/`) is excluded from catalogs — git history only.

## Two classes — never mix

| Class | Paths | Maintained by |
|-------|-------|---------------|
| **Project docs** (human/architecture) | `docs/SYSTEM_DESIGN.md`, `PROJECT_STRUCTURES.md`, `DATABASE_DESIGN.md`, `DESIGN_SYSTEM.md`, `docs/api/*` | `doc-update-project` |
| **Agent docs** (workflow state) | `docs/PLANS.md`, `TODO.md`, `docs/plans/*` | `doc-update-agent` |

Corrections/lessons → `.claude/rules/lessons.md` (auto-loaded) + `.cursor/rules/lessons.mdc` mirror.

## Specs location

Brainstorming design specs go in **`docs/specs/`** — never `docs/superpowers/` (leaks into published docs).

## Scaffold

New projects: run **`doc-init`** (idempotent; never overwrites existing files).
