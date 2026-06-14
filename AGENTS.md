# Luna Agent Kit — Agent & Contributor Guide

`luna-agent-kit` is a **self-contained, self-maintained Claude Code plugin** that gives daily
vibe-coding a consistent, gated workflow plus three pieces of project memory that off-the-shelf
plugins don't provide: a **decision/rejection log**, **plan↔commit traceability**, and **GitNexus
index freshness**.

> **Build status:** Phase 0 (under review). Only documentation exists. Skills, hooks, agents, and
> scripts are *planned* — see `docs/TOOLS_LIST.md`. Nothing in `skills/`, `hooks/`, `agents/`,
> `scripts/` is live yet. Do not assume a skill/hook exists until it is checked into this repo.

`CLAUDE.md` is a symlink to this file.

## Instruction priority (highest wins)

1. **The user** (this session's explicit instructions)
2. **`.claude/rules/`** — always-on guardrails (planned)
3. **Skills** invoked via the Skill tool
4. **This file** and other docs

## Where the workflow lives

The per-project workflow is a single markdown file: **`docs/workflows/WORKFLOW.md`** (planned) —
YAML frontmatter for phases/gates/`suggested_skills` plus an inline Mermaid diagram. It is
**markdown-only**: no build scripts. The **`workflow-guide`** skill (injected at session start)
explains how to use it; to change it, use the **`workflow-update`** skill (the single edit path) —
do not hand-edit phases ad hoc. New projects scaffold their docs with the **`doc-init`** skill.

The LLM reads the current phase's `suggested_skills` menu and picks the subset that fits the change.
Skills are **independent**: none references or chains into another. Sequencing lives only in
`WORKFLOW.md`; hooks remind/block but never orchestrate.

## Documentation obligations

Two doc classes — keep them separate:

- **Project docs** (human/architecture): `docs/SYSTEM_DESIGN.md`, `docs/PROJECT_STRUCTURE.md`,
  `docs/DATABASE_DESIGN.md`, `docs/DESIGN_SYSTEM.md`, `docs/api/*`. Maintained by `doc-update-project`.
- **Agent docs** (workflow state): `docs/PLANS.md`, `docs/TODO.md`, `docs/DECISIONS.md`, plan files
  under `docs/plans/`. Maintained by `doc-update-agent`.

Design specs from brainstorming go in **`docs/specs/`** — never `docs/superpowers/` (that path leaks
into published docs).

## The three memory/traceability mechanisms (what makes this kit worth maintaining)

- **`docs/DECISIONS.md`** — when the user rejects an approach or command, append a row
  (rejected · why · use-instead). Injected at session start so it's never cold. Repeat-offender
  command patterns are also hard-blocked by the `decision-guard` hook.
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

## Reference forks (read-only)

`fork/superpowers`, `fork/ECC`, `fork/claude-plugins-official` are vendored references only. They are
**not** loaded at runtime. We copy/adapt selected components from them — see `docs/TOOLS_LIST.md` for
exactly what, from where, and why.
