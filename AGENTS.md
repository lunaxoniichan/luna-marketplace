# Luna Agent Kit — Agent & Contributor Guide

`luna-agent-kit` is a **self-contained, self-maintained Claude Code plugin** that gives daily
vibe-coding a consistent, gated workflow plus three pieces of project memory that off-the-shelf
plugins don't provide: **corrections captured as native rules**, **plan↔commit traceability**, and **GitNexus
index freshness**.

> **Build status:** Phases 1–4 complete — 36 skills, 7 agents, 9 hooks, 6 rules,
> `build-plans-registry.mjs` + `detect-modules.mjs`, and the `.cursor/` cross-tool layer.
> See `docs/TOOLS_LIST.md` for the full inventory.

`CLAUDE.md` is a symlink to this file.

## Instruction priority (highest wins)

1. **The user** (this session's explicit instructions)
2. **`.claude/rules/`** — always-on guardrails
3. **Skills** invoked via the Skill tool
4. **This file** and other docs

## Where the workflow lives

The per-project workflow is a single markdown file: **`docs/workflows/WORKFLOW.md`** —
YAML frontmatter for phases/gates/`suggested_skills` plus an inline Mermaid diagram. It is
**markdown-only**: no build scripts. The **`workflow-guide`** skill (injected at session start)
explains how to use it; to change it, use the **`workflow-update`** skill (the single edit path) —
do not hand-edit phases ad hoc. New projects scaffold their docs with the **`doc-init`** skill.

The LLM reads the current phase's `suggested_skills` menu and picks the subset that fits the change.
Skills are **independent**: none references or chains into another. Sequencing lives only in
`WORKFLOW.md`; hooks remind/block but never orchestrate.

## Documentation obligations

Two doc classes — keep them separate:

- **Project docs** (human/architecture): `docs/SYSTEM_DESIGN.md`, `docs/PROJECT_STRUCTURES.md`,
  `docs/DATABASE_DESIGN.md`, `docs/DESIGN_SYSTEM.md`, `docs/api/*`. Maintained by `doc-update-project`.
- **Agent docs** (workflow state): `docs/PLANS.md`, `docs/TODO.md`, plan files under `docs/plans/`.
  Maintained by `doc-update-agent`. (Corrections/lessons live in `.claude/rules/lessons.md`.)

Design specs from brainstorming go in **`docs/specs/`** — never `docs/superpowers/` (that path leaks
into published docs).

## The three memory/traceability mechanisms (what makes this kit worth maintaining)

- **Corrections → rules** — when you reject/correct an approach, I append a one-line rule to
  `.claude/rules/lessons.md` (auto-loaded by Claude Code) and mirror it to `.cursor/rules/lessons.mdc`,
  so the same mistake isn't repeated. Native rules mechanism, not a custom log. Capture is also
  **active**: the `lessons-extractor` SessionEnd hook runs a detached Haiku pass over the transcript and
  records high-confidence corrections to `lessons.md` + a native `feedback` memory (opt-out
  `LUNA_LESSONS_AUTOEXTRACT=off`).
- **`Plan:` commit trailer** — every commit during plan work carries `Plan: docs/plans/<file>.md#phase-N`.
  `docs/PLANS.md` is rebuilt from `git log`, so plan↔commit mapping can't drift. In-session task
  state uses Claude Code's native `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList` (not reinvented);
  `PLANS.md`/`TODO.md` are the durable, git-tracked layer distilled from those + `git log`.
- **GitNexus freshness** — before writing new code, query GitNexus for an existing implementation;
  the index is auto-reindexed (async, guardrailed) when HEAD moves past the indexed commit.

## Skill naming

Every skill carries a category prefix so similar skills group and are easy to recall: `workflow-`,
**`dev-`** (core lifecycle: `dev-brainstorm`, `dev-plan`, `dev-execute`, `dev-tdd`, `dev-debug`,
`dev-verify`, `dev-commit`, `dev-research`, `dev-audit`), `review-`, `doc-`, `skill-`, `hook-`,
`kwb-` (knowledge base, from ECC), `design-`. Full map in `docs/TOOLS_LIST.md`.

## Cross-tool (Claude Code + Cursor)

The **repo is the source of truth and the handoff bus** — everything durable is plain markdown + git,
so neither tool depends on the other's private state. Plan in one tool, implement in the other, loop
via commits:

- **Shared (both read natively):** `AGENTS.md`, `docs/workflows/WORKFLOW.md`, `docs/plans/`,
  `docs/specs/`, `docs/PLANS.md`, `docs/TODO.md`, and `git log` (`Plan:` trailers).
- **Skills:** same `SKILL.md` format; Cursor discovers them via `.cursor/skills` (symlink to `skills/`).
- **Hooks:** same scripts; Claude `hooks/hooks.json`, Cursor `.cursor/hooks.json` (`beforeShellExecution`).
- **Rules:** `.claude/rules/*.md` (Claude, auto-loaded) mirrored to `.cursor/rules/*.mdc` (Cursor).
- **Handoff:** set the `Owner` column in `PLANS.md` to the active tool; the receiving tool reads the
  self-contained plan, implements, commits with the `Plan:` trailer, updates the row.

## Configuration (env vars)

All hooks fail-open (except the hard safety guards and the `gitnexus-freshness` staleness gate, which
returns `ask` rather than serve a stale graph) and honor opt-out env vars:

| Var | Default | Effect |
|-----|---------|--------|
| `LUNA_GITNEXUS_AUTOSYNC` | `on` | `off` disables auto-reindex (warn-only) |
| `LUNA_GITNEXUS_DEBOUNCE_MIN` | `10` | minutes before another auto-reindex may run |
| `LUNA_GITNEXUS_MAX_AUTOSYNC_FILES` | `2000` | above this, warn instead of full reindex |
| `LUNA_SECRET_GUARD` | `on` | `off` disables the secret-file block |
| `LUNA_WEB_GUARD` | `on` | `off` disables HTTPS-only + source-list enforcement |
| `LUNA_DOC_SYNC_REMINDER` | `on` | `off` silences the Stop-hook doc reminder |
| `LUNA_DEDUPE_GUARD` | `on` | `off` disables the pre-commit jscpd duplicate warning |
| `LUNA_LESSONS_AUTOEXTRACT` | `on` | `off` (or a `.claude/.no-reflect` marker) disables auto lesson capture |

## Reference forks (read-only)

`fork/superpowers`, `fork/ECC`, `fork/claude-plugins-official` are vendored references only. They are
**not** loaded at runtime. We copy/adapt selected components from them — see `docs/TOOLS_LIST.md` for
exactly what, from where, and why.
