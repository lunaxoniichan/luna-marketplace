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
docs/PROJECT_STRUCTURE.md
docs/PLANS.md
docs/TODO.md
docs/workflows/WORKFLOW.md
.claude/rules/lessons.md     (don't-repeat lessons; Claude auto-loads .claude/rules/)
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

## Process

1. Detect project root (git root or cwd).
2. For each minimum-set path, if missing → create from Luna Agent Kit templates.
3. If `CLAUDE.md` missing and `AGENTS.md` exists → `ln -s AGENTS.md CLAUDE.md`.
4. Cross-tool: symlink `.cursor/skills` → plugin's `skills/` dir; write `.cursor/rules/*.mdc`;
   write `.cursor/hooks.json` using **absolute paths** resolved from `$CLAUDE_PLUGIN_ROOT` at init
   time (e.g. `node /absolute/path/to/plugin/scripts/hooks/bash-guards.js`) — relative paths break
   because the plugin scripts live in the plugin cache, not the app repo.
5. Report created vs skipped paths.

## Templates

- **PLANS.md** — registry table (`Spec · Plan · Phase · Owner · Last commit · Status · Resume hint`)
- **TODO.md** — backlog table with `Plan file` + `Plan phase` columns
- **lessons.md** — header + format line, no entries
- **WORKFLOW.md** — copy this repo's `docs/workflows/WORKFLOW.md`

## Do not

- Overwrite existing files
- Pre-create empty `docs/plans/` or `docs/specs/` (created on first plan/spec)
- Put specs under `docs/superpowers/`
- Scaffold optional docs without the user asking
