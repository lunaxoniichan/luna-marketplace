---
name: doc-init
description: Scaffold the minimum project doc set for Luna Agent Kit — idempotent, never overwrites existing files. Wires both Claude Code and Cursor.
---

# Doc init

Scaffold the **minimum doc set** for any project using Luna Agent Kit. **Idempotent:** create only
missing files; never overwrite existing content. Wires both **Claude Code** and **Cursor** to the
same in-repo source of truth.

## Minimum set (always)

```
AGENTS.md                    (+ CLAUDE.md -> AGENTS.md symlink if missing)
docs/SYSTEM_DESIGN.md
docs/PROJECT_STRUCTURES.md
docs/PLANS.md
docs/TODO.md
docs/workflows/WORKFLOW.md
.claude/rules/lessons.md     (don't-repeat lessons; Claude auto-loads .claude/rules/)
.jscpd.json                  (duplicate-detection config; read by review-simplify + dedupe-guard hook)
```

Created **on first use**, not pre-scaffolded: `docs/plans/<feature>.md` (by `dev-plan`),
`docs/specs/<topic>.md` (by `dev-brainstorm`).

## Optional (only when the user asks)

`docs/DATABASE_DESIGN.md` · `docs/DESIGN_SYSTEM.md` · `docs/api/` (directory)

## Cross-tool registration (Claude + Cursor)

`AGENTS.md` is the shared brain — both tools read it (Claude via the `CLAUDE.md` symlink; Cursor reads
`AGENTS.md` natively). Mirror the tool-specific bits to the **same** source:

| Claude Code | Cursor mirror |
|-------------|---------------|
| `skills/*/SKILL.md` (plugin) | `.cursor/skills` → symlink to the skills dir (same `SKILL.md` format) |
| `hooks/hooks.json` (`PreToolUse`/`SessionStart`) | `.cursor/hooks.json` (`beforeShellExecution`/`sessionStart` → same scripts) |
| `.claude/rules/*.md` (auto-loaded) | `.cursor/rules/*.mdc` (add `alwaysApply: true` frontmatter) |

Create all `.cursor/rules/*.mdc` mirrors of the six `.claude/rules/*.md` files (add `alwaysApply: true`
frontmatter to each):

| Source (Claude Code) | Mirror (Cursor) |
|----------------------|-----------------|
| `.claude/rules/core.md` | `.cursor/rules/core.mdc` |
| `.claude/rules/workflow.md` | `.cursor/rules/workflow.mdc` |
| `.claude/rules/docs.md` | `.cursor/rules/docs.mdc` |
| `.claude/rules/git.md` | `.cursor/rules/git.mdc` |
| `.claude/rules/codebase-awareness.md` | `.cursor/rules/codebase-awareness.mdc` |
| `.claude/rules/lessons.md` | `.cursor/rules/lessons.mdc` |

Also create `.cursor/rules/luna.mdc` (`alwaysApply: true`; read `docs/workflows/WORKFLOW.md`; skills are
independent; follow `AGENTS.md`).

## Module detection

Before scaffolding, run the module detector to discover independently-tracked sub-projects:

```bash
node <plugin-root>/scripts/detect-modules.mjs [<project-root>]
# or for machine-readable output:
node <plugin-root>/scripts/detect-modules.mjs --json [<project-root>]
```

A directory is a **module target** if it contains `CLAUDE.md` or `AGENTS.md`. Built-in skip list
excludes `node_modules`, `.git`, `dist`, `build`, hidden dirs, etc.

### Module minimum set

For each detected module, scaffold the same minimum set as the root — but scoped to that module's
subdirectory. Only create missing files; never overwrite.

```
<module>/docs/SYSTEM_DESIGN.md
<module>/docs/PROJECT_STRUCTURES.md
<module>/docs/PLANS.md
<module>/docs/TODO.md
<module>/docs/workflows/WORKFLOW.md
<module>/.claude/rules/lessons.md
```

If the module already has `AGENTS.md` but no `CLAUDE.md` symlink, create the symlink.
If the module has neither, **skip** it (should not happen given the detection heuristic, but
guard against it).

Report per-module: `[module-name] created: X, skipped: Y`.

## Process

1. Detect project root (git root or cwd).
2. Run `detect-modules.mjs` against the project root → list of module targets.
3. For each minimum-set path at root level, if missing → create from Luna Agent Kit templates.
4. If `CLAUDE.md` missing and `AGENTS.md` exists → `ln -s AGENTS.md CLAUDE.md`.
5. For each detected module → scaffold module minimum set (same idempotency rules).
6. Cross-tool: symlink `.cursor/skills` → plugin's `skills/` dir; write `.cursor/rules/*.mdc`;
   write `.cursor/hooks.json` using **absolute paths** resolved from `$CLAUDE_PLUGIN_ROOT` at init
   time (e.g. `node /absolute/path/to/plugin/scripts/hooks/bash-guards.js`) — relative paths break
   because the plugin scripts live in the plugin cache, not the app repo.
7. Report created vs skipped paths — root first, then one section per module.

## Duplicate-detection config (`.jscpd.json`)

Scaffold one baseline `.jscpd.json` at the repo root (idempotent — never overwrite). It is the
single source jscpd reads for both the on-demand `review-simplify` pass and the `dedupe-guard`
commit hook, covering all languages in the repo (Python, TS/JS, Go, …) from one tool. Baseline:

```json
{
  "threshold": 0,
  "minLines": 5,
  "minTokens": 50,
  "gitignore": true,
  "absolute": false,
  "ignore": [
    "**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**",
    "**/.venv/**", "**/venv/**", "**/__pycache__/**", "**/*.min.*",
    "**/migrations/**", "**/*.lock", "**/*-lock.json", "**/vendor/**"
  ]
}
```

`threshold: 0` keeps it report-only (never fails a run — the hook is advisory). A module that wants
stricter limits can get its own `<module>/.jscpd.json`; use the module list from `detect-modules.mjs`
to decide where, but only scaffold per-module configs when the user asks (root config already
covers the whole tree).

## Templates

- **PLANS.md** — registry table (`Spec · Plan · Phase · Owner · Last commit · Status · Resume hint`)
- **TODO.md** — backlog table with `Plan file` + `Plan phase` columns
- **lessons.md** — header + format line, no entries
- **WORKFLOW.md** — copy this repo's `docs/workflows/WORKFLOW.md`
- **.jscpd.json** — baseline above

## Do not

- Overwrite existing files
- Pre-create empty `docs/plans/` or `docs/specs/` (created on first plan/spec)
- Put specs under `docs/superpowers/`
- Scaffold optional docs without the user asking
