# Luna Agent Kit — v2 build plan (phases 1–4)

> Repo-resident record of the approved build (full plan: the v2 review in the planning workspace).
> Persisted here so build commits carry a `Plan:` trailer and `docs/PLANS.md` can be rebuilt from
> `git log`. Status: phases 1–4 built.

## Goal

Scaffold a self-contained, self-maintained Claude Code plugin that vendors the good parts of
`fork/superpowers`, `fork/ECC`, `fork/claude-plugins-official` while fixing the recurring pains they
don't address — corrections-as-rules memory (#1), doc↔code sync (#2), dedupe/dead-code (#3),
right-sized docs (#4), a consistent gated workflow (#5), skill-bloat curation (#6), plan↔commit
traceability (#7), refactor effort (#8), and GitNexus index freshness (#9).

## Phases

### phase-1 — Scaffold + workflow + memory/traceability foundation
- Plugin manifest, docs (`SYSTEM_DESIGN`, `PROJECT_STRUCTURE`, `TOOLS_LIST`), `WORKFLOW.md`,
  agent docs (`PLANS.md`, `TODO.md`), `.claude/rules/` guardrails, `.cursor/` mirror base.
- Skills: `workflow-guide`, `workflow-update`, `doc-init`, `dev-brainstorm`, `dev-plan`,
  `dev-execute`, `dev-tdd`, `dev-debug`, `dev-verify`, `dev-commit`, `review-code`, `review-simplify`.

### phase-2 — Hooks + doc-sync + traceability automation + meta
- Skills: `doc-update-project`, `doc-update-agent`, `doc-simplify`, `review-security`,
  `review-performance`, `skill-author`, `skill-audit`, `skill-compare`, `hook-author`.
- `scripts/build-plans-registry.mjs` (rebuilds `PLANS.md` from `git log --grep '^Plan:'`).
- Hook layer (see the review-fixes plan for the hook hardening + tests).

### phase-3 — Knowledge base (`kwb-*`, copy-on-use, trimmed)
- `kwb-python`, `kwb-python-testing`, `kwb-postgres`, `kwb-api`, `kwb-docker`, `kwb-deploy`,
  `kwb-frontend`, `kwb-nextjs`, `kwb-typescript`; plus `dev-research`, `dev-audit`.

### phase-4 — Design + agents
- Skills: `design-frontend`, `design-system`, `design-database`, `dev-parallel`.
- Agents: `review-internal`, `review-external`, `execute`, `test`, `document-project`,
  `document-agent`, `dev-brainstorm`.

## Acceptance
- `/plugin install .` loads with no manifest errors.
- `node tests/hooks/hooks.test.js` passes.
- A `git commit` during plan work carries a `Plan:` trailer; `build-plans-registry.mjs` rebuilds
  `docs/PLANS.md` from those trailers (proves pain #7 end-to-end).
