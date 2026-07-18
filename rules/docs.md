# Documentation

## Two classes — never mix

| Class | Paths | Maintained by |
|-------|-------|---------------|
| **Project docs** (human/architecture) | `docs/SYSTEM_DESIGN.md`, `PROJECT_STRUCTURES.md`, `DATABASE_DESIGN.md`, `DESIGN_SYSTEM.md`, `docs/api/*` | `doc-update-project` |
| **Agent docs** (workflow state) | `docs/PLANS.md`, `TODO.md`, `docs/plans/*` | `doc-update-agent` |

Corrections/lessons → `.claude/rules/lessons.md` (auto-loaded) + `.cursor/rules/lessons.mdc` mirror.

## Lifecycle (PRE / OFFICIAL / POST)

| Stage | Tag | Folders |
|-------|-----|---------|
| PRE_OFFICIAL | `lifecycle: pre_official` | `docs/pre-official/{research,audits}/` |
| OFFICIAL | `lifecycle: official` | root architecture, `specs/`, `plans/`, `decisions/` |
| POST_OFFICIAL | `lifecycle: post_official` | `docs/post-official/{completed-plans,legacy}/` |

Unified front-matter schema: `templates/docs/FRONTMATTER.md`. Promote/demote owned by
`doc-update-project` / `doc-update-agent`. Do not mass-migrate existing docs.

## Specs location

Brainstorming design specs go in **`docs/specs/`** — never `docs/superpowers/` (leaks into published docs).
Purely exploratory research/audits start in **`docs/pre-official/`**.

## Writing style

- **Function-level references only** — name functions, classes, parameters; do not copy behavior into docs.
- **Docs must survive refactors** — valid when implementation details change.

## Scaffold

New projects: run **`doc-init`** (idempotent; never overwrites existing files). Registers the project
into `~/.claude/luna/registry.json` for Luna Studio.

Optional project overlay: `RULES.md` at repo root for **stack-specific** rules only; generic rules live in plugin `docs/VIBE_RULES.md` (`vibe-rules` skill).
