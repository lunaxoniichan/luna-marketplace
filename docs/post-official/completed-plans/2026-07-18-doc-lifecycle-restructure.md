---
title: Doc lifecycle restructure (PRE/OFFICIAL/POST)
scope: project
type: plan
lifecycle: post_official
status: superseded
keywords: [lifecycle]
superseded_by: docs/plans/2026-07-18-luna-studio.md
updated: 2026-07-18
---

# Plan — Doc lifecycle restructure (PRE/OFFICIAL/POST)

> **Status:** 2026-07-18 — SUPERSEDED by `docs/plans/2026-07-18-luna-studio.md` (Phase 0 covers
> convention + buckets + doc-init registry; Phase 5 covers Completed table + skill promote/demote).
> Keep this file for history; do not execute separately.


## Phases

### phase-1 — convention + tag (docs only)
- Add the three-stage definition + the `lifecycle:` front-matter tag to `AGENTS.md` and
  `docs/PROJECT_STRUCTURES.md`; create empty `docs/pre-official/{research,audits}/` and
  `docs/post-official/{completed-plans,legacy}/` with READMEs.
- **Validation:** buckets + READMEs exist; AGENTS.md + PROJECT_STRUCTURES describe the axis; no
  existing path moved; `build-plans-registry.mjs` still runs unchanged.

### phase-2 — registry awareness
- Teach `build-plans-registry.mjs` to route completed plans into a separate "Completed" table (or skip
  `post-official/completed-plans/`), keeping the active `PLANS.md` table lean.
- **Validation:** unit test — a completed plan lands in the Completed table, active plans unaffected.

### phase-3 — promote/demote in doc skills
- Extend `doc-update-agent` (archival) + `doc-update-project` (supersede) to perform the
  `plans/ → post-official/completed-plans/` and `OFFICIAL → post-official/legacy/` moves + tag flips.
- **Validation:** a dry-run on a sample plan performs the move + tag flip + leaves a pointer.

### phase-4 — doc-init scaffolding + submodule mirror
- `doc-init` scaffolds the buckets in new projects; extend the submodule doc-mirror convention to the
  three-stage layout.
- **Validation:** `doc-init` on a fresh temp dir produces the full three-stage `docs/` skeleton.

## Definition of done
The three-stage lifecycle is documented + tagged, the registry keeps active vs completed separate, the
doc skills own promote/demote, and `doc-init` scaffolds it — all without breaking existing skill/hook
path references.

## Notes
- No mass migration of existing docs in this plan (spec §5 non-goal) — buckets + rules first, migrate
  opportunistically.
- First real consumer already exists: Sharks-Loop engine docs in `second-world/docs/CONCEPT_AUDITS/sharks/`.
