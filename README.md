# Luna Agent Kit

Local-first agent kit for **Claude Code + Cursor**: phased workflow, corrections-as-rules, plan↔commit tracing, and GitNexus-aware coding.

## Install

From this repo root in Claude Code:

```
/plugin install .
```

Skills, agents, and hooks are auto-discovered. Only `name` is required in `.claude-plugin/plugin.json`.

## What you get (Phase 1)

- **12 skills** — `workflow-guide`, `workflow-update`, `doc-init`, `dev-brainstorm`, `dev-plan`, `dev-execute`, `dev-tdd`, `dev-debug`, `dev-verify`, `review-code`, `review-simplify`, `dev-commit`
- **2 hooks** — `session-start` (inject `workflow-guide`), `block-no-verify` (always-on safety)
- **6 rules** — core, workflow, docs, git, codebase-awareness, `lessons` (don't-repeat memory)
- **Workflow** — `docs/workflows/WORKFLOW.md` (markdown-only, no build scripts)

## Quick start

1. `/plugin install .` in a project that uses this kit (or dogfood on this repo).
2. New session → `workflow-guide` injected; `.claude/rules/` (incl. `lessons.md`) auto-loaded by Claude Code.
3. Read `docs/workflows/WORKFLOW.md` for phase menus.
4. Run `doc-init` on a fresh repo to scaffold docs.

## Docs

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | Entry guide for agents and contributors |
| [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) | Architecture + enforcement mechanisms |
| [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | Repo layout |
| [docs/TOOLS_LIST.md](docs/TOOLS_LIST.md) | Full component inventory |

## Configuration

`block-no-verify` is always-on (security) — it blocks `git --no-verify` and `core.hooksPath` overrides.
`LUNA_HOOK_PROFILE` / `LUNA_DISABLED_HOOKS` return in Phase 2 when the gitnexus/doc-sync hooks need gating.

**Don't-repeat memory:** corrections become rules in `.claude/rules/lessons.md` (Claude auto-loads
`.claude/rules/`), mirrored to `.cursor/rules/lessons.mdc` for Cursor.

## Cross-tool (Claude Code + Cursor)

The repo is the source of truth and handoff bus. Skills (`SKILL.md`) work in both — Cursor discovers
them via `.cursor/skills` (symlink). Hooks: `hooks/hooks.json` (Claude) + `.cursor/hooks.json`
(Cursor, `beforeShellExecution`). Rules: `.claude/rules/*.md` mirrored to `.cursor/rules/*.mdc`. Plan
in one tool, implement in the other via the self-contained plan in `docs/plans/` + the `Plan:` trailer.

## Reference forks

`fork/superpowers`, `fork/ECC`, `fork/claude-plugins-official` are read-only references — not loaded at runtime.

## Build status

**Phase 1** — scaffold + workflow + memory/traceability foundation. Phase 2 adds doc-sync hooks, GitNexus auto-reindex, and `build-plans-registry.mjs`.
