---
name: skill-author
description: Use when creating or editing a skill — author and verify SKILL.md with a test-first, behavior-shaping discipline before deploying
---

# Skill author

Authoring a skill **is TDD for process docs**. If you didn't watch an agent fail without the skill, you
don't know the skill teaches the right thing. Adapted from superpowers `writing-skills` (Mermaid, not
Graphviz; no `@`-force-loads).

## Iron law

```
NO SKILL WITHOUT A FAILING TEST FIRST
```
Applies to new skills AND edits. Wrote it before testing? Delete and restart. Violating the letter
violates the spirit.

## RED → GREEN → REFACTOR

- **RED** — run a pressure scenario with a subagent *without* the skill; record the exact
  rationalizations/violations verbatim.
- **GREEN** — write the minimal `SKILL.md` that counters those specific failures; re-run → agent complies.
- **REFACTOR** — new rationalization appears? add an explicit counter; build a rationalization table +
  red-flags list; re-test until bulletproof.

## SKILL.md rules (Luna conventions)

- Frontmatter: only `name` + `description`. `description` is **third-person, "Use when…", triggers
  only — never summarize the workflow** (a workflow summary makes Claude skip the body).
- Category prefix in the name (`dev-`, `review-`, `doc-`, `skill-`, `hook-`, `kwb-`, `design-`).
- **Independent** — no skill-to-skill chaining (`WORKFLOW.md` owns sequencing). No `@file` links.
- Keep it <250 lines; one excellent example beats many; flowcharts (Mermaid) only for non-obvious
  decisions, never for reference/linear steps.
- Searchable keywords (errors, symptoms, tools) early and often.

## Deploy checklist

- [ ] Baseline failure observed and documented · [ ] minimal skill counters it · [ ] re-tested green ·
  [ ] rationalization table + red flags (discipline skills) · [ ] one example · [ ] <250 lines ·
  [ ] registered in `docs/TOOLS_LIST.md` · [ ] surfaced in `WORKFLOW.md` via `workflow-update` if it's a
  phase skill.

## Do not

- Batch-write many skills untested. STOP and verify each before the next.
- Add `REQUIRED SUB-SKILL` chains (Luna skills are independent).
