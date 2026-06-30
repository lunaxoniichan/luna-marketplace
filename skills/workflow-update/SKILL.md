---
name: workflow-update
description: Use when changing project workflow phases, gates, suggested_skills, variants, or the inline Mermaid diagram in WORKFLOW.md
---

# Workflow update

**Single edit path** for `docs/workflows/WORKFLOW.md`. Do not hand-edit phases elsewhere.

## Rules

1. **Markdown-only** — YAML frontmatter + body + inline Mermaid. No `.mjs` build scripts.
2. **One file** — all workflow changes in `docs/workflows/WORKFLOW.md`.
3. **Skills stay independent** — `suggested_skills` is a menu, not a chain. Never add "then invoke X" between skills.
4. **Preserve variants** — keep `trivial`, `fix`, `spike`, `refactor` unless the user explicitly removes them.
5. **Project overlays** — extend `suggested_skills` with project-local skills (e.g. `.claude/skills/flynance-*`).
   Sync generic phases/variants from the plugin default `WORKFLOW.md` first; do not fork generic phases into
   harness commands (`/flynance-vibe` stays project-local).

## Frontmatter schema

```yaml
---
name: default
variants:
  trivial:
    skip_phases: [...]
    note: ...
phases:
  - id: phase-id
    gate: user_approval | per_task | none
    suggested_skills: [skill-names]
    description: ...
---
```

## Process

1. Read current `docs/workflows/WORKFLOW.md` entirely.
2. Confirm the change with the user if it affects gates or skips core phases.
3. Edit frontmatter and/or Mermaid in **one pass**.
4. Verify: every `suggested_skills` entry is a real skill name from `docs/TOOLS_LIST.md`.
5. Summarize what changed and which phases/skills are affected.

## Mermaid

Use Mermaid in the markdown body for diagrams — not Graphviz.

## Do not

- Add skill-to-skill `REQUIRED SUB-SKILL` directives
- Create parallel workflow files
- Add validate/render/extract scripts
