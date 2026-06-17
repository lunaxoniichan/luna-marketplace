---
name: default
variants:
  trivial:
    skip_phases: [dev-brainstorm, system-design]
    note: One-liner fixes, typos, config tweaks — go straight to dev-execute or dev-commit.
  fix:
    skip_phases: [dev-brainstorm, system-design]
    note: Bug with known root cause — dev-debug → dev-tdd → dev-execute.
  spike:
    skip_phases: [dev-plan]
    note: Time-boxed exploration — dev-brainstorm optional; no plan file required.
  refactor:
    skip_phases: [dev-brainstorm, system-design]
    note: Dedupe/cleanup sprint — dev-refactor (+ refactor-cleaner agent); review-simplify only for post-batch spot-checks.
phases:
  - id: dev-brainstorm
    gate: user_approval
    suggested_skills: [dev-brainstorm, dev-research, dev-audit]
    description: Design dialogue before code. Output goes to docs/specs/.
  - id: system-design
    gate: user_approval
    suggested_skills: [doc-update-project, design-system, design-database, design-frontend]
    description: Align docs/SYSTEM_DESIGN.md with the approved spec; design tokens/schema/UI.
  - id: dev-plan
    gate: user_approval
    suggested_skills: [dev-plan, dev-audit, dev-parallel]
    description: Implementation plan in docs/plans/. Defer scope to docs/TODO.md.
  - id: dev-execute
    gate: per_task
    suggested_skills:
      - dev-execute
      - dev-tdd
      - dev-debug
      - dev-verify
      - dev-parallel
      - review-code
      - review-simplify
      - dev-refactor
      - review-security
      - review-performance
      - doc-update-project
      - doc-update-agent
      - dev-commit
    description: Execute plan tasks. Pick skills per task; no mandatory chains.
---

# Project workflow

Phases and gates are defined in the YAML frontmatter above. The LLM reads the current phase's
`suggested_skills` menu and runs the subset that fits the change. Skills are **independent** — none
chains into another. Hooks remind and block; they do not orchestrate.

## Phase flow

```mermaid
flowchart LR
    BS[dev-brainstorm] --> SD[system-design]
    SD --> PL[dev-plan]
    PL --> EX[dev-execute]
    EX --> EX
    subgraph execute_menu [dev-execute menu — pick 0..N]
      TD[dev-tdd]
      DB[dev-debug]
      VF[dev-verify]
      RC[review-code]
      RS[review-simplify]
      CM[dev-commit]
    end
    EX --> execute_menu
```

## Variants

| Variant | Skips | When |
|---------|-------|------|
| `trivial` | dev-brainstorm, system-design | Typo, one-line fix, obvious change |
| `fix` | dev-brainstorm, system-design | Known bug, clear reproduction |
| `spike` | dev-plan | Exploration/prototype, time-boxed |
| `refactor` | dev-brainstorm, system-design | Dedupe/cleanup sprint — dev-refactor; plan in docs/plans/ |

## Changing this file

Use the **`workflow-update`** skill only — do not hand-edit phases ad hoc.
