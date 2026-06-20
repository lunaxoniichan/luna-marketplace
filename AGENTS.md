# Luna Agent Kit — Agent & Contributor Guide

`luna-agent-kit` is a **self-contained, self-maintained Claude Code plugin** that gives daily
vibe-coding a consistent, gated workflow plus three pieces of project memory that off-the-shelf
plugins don't provide: **corrections captured as native rules**, **plan↔commit traceability**, and **GitNexus
index freshness**.

> **Build status:** Phases 1–4 complete + v0.3.0 knowledge stack — 38 skills, 8 agents, 10 hooks, 7 rules,
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

- **Project docs** (human/architecture): `docs/README.md` (catalog), `docs/SYSTEM_DESIGN.md`, `docs/PROJECT_STRUCTURES.md`,
  `docs/DATABASE_DESIGN.md`, `docs/DESIGN_SYSTEM.md`, `docs/api/*`. Maintained by `doc-update-project`.
- **Agent docs** (workflow state): `docs/PLANS.md`, `docs/TODO.md`, plan files under `docs/plans/`.
  Maintained by `doc-update-agent`. (Corrections/lessons live in `.claude/rules/lessons.md`.)

`docs/README.md` is the project doc catalog — it owns the doc map, catalog table, ownership rules, and read order. `AGENTS.md` links to it; it does not duplicate it.

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

**Duplicate detection:** kit repos pin `jscpd` in root `package.json` (`npm run jscpd` for baseline,
`npm run jscpd:json` for reports). `doc-init` scaffolds `.jscpd.json`; `dedupe-guard` warns on staged
clones at commit time. Cleanup sprints use **`dev-refactor`** / **`refactor-cleaner`**; PR-time passes
use **`review-simplify`** (diff-scoped only). Monorepos with git submodules: run `gitnexus analyze` per
repo; use `group_sync` / `group_query` for cross-module dupes. Submodule hooks:
`gitnexus-submodule-advisory` (edit-time warn), `gitnexus-submodule-sync` (post-commit reindex).
Playbook: `docs/specs/monorepo-refactor-playbook.md`.

## Skill naming

Every skill carries a category prefix so similar skills group and are easy to recall: `workflow-`,
**`dev-`** (core lifecycle: `dev-brainstorm`, `dev-plan`, `dev-execute`, `dev-tdd`, `dev-debug`,
`dev-verify`, `dev-commit`, `dev-refactor`, `dev-research`, `dev-audit`), `review-`, `doc-`, `skill-`, `hook-`,
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
| `LUNA_GITNEXUS_SUBMODULE_ADVISORY` | `on` | `off` silences stale/missing submodule index warnings on Read/Write/Edit |
| `LUNA_LESSONS_AUTOEXTRACT` | `on` | `off` (or a `.claude/.no-reflect` marker) disables auto lesson capture |
| `LUNA_FILE_SIZE_GUARD` | `on` | `off` disables file-size advisory hook |
| `LUNA_FILE_SIZE_WARN_LINES` | `300` | line count at which file-size hook emits a warning |
| `LUNA_FILE_SIZE_ALERT_LINES` | `500` | line count at which file-size hook emits an alert |

## Reference forks (read-only)

`fork/superpowers`, `fork/ECC`, `fork/claude-plugins-official` are vendored references only. They are
**not** loaded at runtime. We copy/adapt selected components from them — see `docs/TOOLS_LIST.md` for
exactly what, from where, and why.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **luna-marketplace** (65558 symbols, 78932 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/luna-marketplace/context` | Codebase overview, check index freshness |
| `gitnexus://repo/luna-marketplace/clusters` | All functional areas |
| `gitnexus://repo/luna-marketplace/processes` | All execution flows |
| `gitnexus://repo/luna-marketplace/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
