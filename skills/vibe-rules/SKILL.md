---
name: vibe-rules
description: Use when you need generic engineering rules (vibe coding loop, failure modes, implementation, fixing, testing, GitNexus) — project-agnostic; invoke instead of improvising process or duplicating rules from memory
---

# Generic engineering rules (vibe coding)

Project-agnostic rules from Luna Agent Kit. **Project-specific** rules live in the repo's `RULES.md`
(if present) and win on conflict. **Procedures** live in other `dev-*` / `review-*` skills — invoke
those for checklists; this skill is the rulebook index.

Full doc (human + deep read): `docs/VIBE_RULES.md` in the Luna Agent Kit plugin root.

## Instruction priority

1. User explicit instructions (direct chat)
2. Project rules (`RULES.md`, `AGENTS.md`, `.claude/rules/`)
3. Plugin skills (`workflow-guide`, `vibe-rules`, `dev-*`, `review-*`, …)
4. Default model behavior

## North star

**Accuracy over speed.** Generator ≠ verifier. Fail loud; root cause first; minimal scope; reuse before invent.

## Phase loop → skills

Routing and phase menus: invoke **`workflow-guide`**, then read `docs/workflows/WORKFLOW.md`.

| Step | Skills |
|------|--------|
| Research | `dev-research`, `gitnexus-exploring` |
| Plan | `dev-plan`, `dev-brainstorm` |
| Review | `dev-audit`, `gitnexus-impact-analysis` |
| Implement | `dev-execute`, `vibe-rules` |
| Verify | `dev-verify`, `dev-tdd` |
| Record | `doc-update-project`, `.claude/rules/lessons.md` |

Variants (`trivial`, `fix`, `spike`, `refactor`) skip ceremony — see WORKFLOW.md.

## Failure modes (counter fast)

Summary — canonical detail: `docs/VIBE_RULES.md` §0 (AI failure modes table).

| Mode | Countermeasure |
|------|----------------|
| Hallucination | Typecheck/build; verify against source |
| Completion bias | `dev-verify` — evidence before "done" |
| Code slop | `review-simplify`; delete dead code |
| False verification | Break test deliberately; E2E check |
| Parallel implementations | GitNexus search first |
| Architecture drift | Read `SYSTEM_DESIGN.md`, schemas |

## Non-negotiables

Summary — canonical detail: `docs/VIBE_RULES.md` §1, §6, §7.

- No silent fallbacks or backward-compat branches without explicit approval
- No `.env`/secrets file access; never log secrets
- No commit unless user asks; conventional commits; no agent co-author trailers
- GitNexus impact before symbol edits; `gitnexus_detect_changes` before commit
- Lessons → project `.claude/rules/lessons.md` only — never `~/.claude/CLAUDE.md`

## When to read `docs/VIBE_RULES.md`

Invoke this skill for a quick refresh. **Read** `docs/VIBE_RULES.md` when you need the full tables
(implementation, documentation, testing scope, fixing discipline, GitNexus never-do list).
