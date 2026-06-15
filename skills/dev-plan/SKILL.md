---
name: dev-plan
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Dev plan

Write implementation plans for engineers with zero prior context. **Announce:** "Using dev-plan to create the implementation plan."

**Native plan mode does the authoring.** Claude/Cursor plan mode runs the interview and a/b/c choices; `dev-plan` **persists the approved plan into the repo** (`docs/plans/`) so it's git-tracked, commit-linked, and readable by the *other* tool. Make the plan **self-contained** (tasks + acceptance criteria) so whichever tool implements it needs no other tool's skills.

## Output

Save to: **`docs/plans/YYYY-MM-DD-<feature-name>.md`**

## Plan header (required)

```markdown
# [Feature Name] Implementation Plan

**Goal:** [one sentence]

**Architecture:** [2-3 sentences]

**Tech stack:** [key technologies]

**Spec:** [link to docs/specs/...]

---
```

## Task rules

- Bite-sized steps (2–5 min each): failing test → run → implement → run → commit
- Exact file paths always
- Complete code in steps — no "TBD" or "add error handling"
- Acceptance = **tests and contracts**, not verbatim file bodies in the plan
- DRY, YAGNI, TDD, frequent commits

## Defer scope

Anything out of scope → append row to **`docs/TODO.md`** with Plan file + Plan phase columns.

## Self-review

1. Spec coverage — every requirement maps to a task
2. Placeholder scan — no TBD/TODO in steps
3. Name consistency across tasks

## Register + handoff

After saving the plan:

1. Add a row to **`docs/PLANS.md`** (Spec · Plan · Phase · Owner · Last commit · Status · Resume hint).
2. Offer execution: **this session**, a **fresh session** (paste plan path + resume hint), or **hand to the other tool** (Claude↔Cursor) — the receiving tool reads `docs/plans/<file>.md`, implements, and commits with the `Plan:` trailer. Set the **Owner** column to the tool taking it.

Do **not** mandate subagent-driven-development or skill chains.

## Do not

- Reference `REQUIRED SUB-SKILL` chains
- Save plans under `docs/superpowers/plans/`
