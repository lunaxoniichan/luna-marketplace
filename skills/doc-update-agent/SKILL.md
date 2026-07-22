---
name: doc-update-agent
description: Use when plan/backlog status changed or the user corrected an approach — sync PLANS.md/TODO.md and append lessons to the rules
---

# Doc update — agent docs

Keep **agent docs** (workflow-state class) current: the plan registry, backlog, and the don't-repeat
lessons. This is the **agent** half of the doc obligation — architecture docs belong to
`doc-update-project`. Never mix classes.

## Scope (agent docs only)

| Doc | Update when |
|-----|-------------|
| `docs/PLANS.md` | a plan started/advanced/finished; a phase completed; owner handoff (Claude↔Cursor) |
| `docs/TODO.md` | scope deferred; a backlog item opened/closed — each row links `Plan file` + `Plan phase` |
| `.claude/rules/lessons.md` | the user **rejected or corrected** an approach (append one line) + mirror to `.cursor/rules/lessons.mdc` |

## Lifecycle archival (canonical procedure)

When a plan ships or a pre-official concept is rejected, **archive via the shared lib — never hand
`git mv`**. Contract: `docs/specs/2026-07-19-doc-lifecycle-promote-demote-contract.md`.

| Situation | Op | Command |
|-----------|-----|---------|
| Plan work done | `demote` | `node scripts/doc-lifecycle.mjs demote docs/plans/<file>.md` |
| Concept abandoned | `demote` | `node scripts/doc-lifecycle.mjs demote docs/pre-official/.../<file>.md` |

This flips front-matter (`lifecycle: post_official`, `status: done`), moves plans to
`docs/post-official/completed-plans/` (history-preserving rename), commits with
`docs(lifecycle): …` and **no** `Plan:` trailer, then refreshes the docs index.

After archiving a plan, rebuild the registry so the Completed section resolves:

```
node scripts/build-plans-registry.mjs
```

Trailer paths stay logical IDs; the registry resolves the on-disk path under `completed-plans/`.

**Single owned path.** Lifecycle moves have exactly two entry surfaces — this skill's CLI, or the
Studio **Lifecycle** panel — and both call the same `planLifecycleMove` / `applyLifecycleMove`
(byte-identical results). No third, hand-rolled path. After a plan demote/supersede the Studio panel
surfaces a hint to run `build-plans-registry.mjs` (registry rebuild is a separate no-trailer commit).

## Process

1. **Plan/backlog:** reflect real status. `PLANS.md` is derivable from git — prefer running
   `scripts/build-plans-registry.mjs` (rebuilds from `git log --grep '^Plan:'`) over hand-editing rows.
2. **Lessons (pain #1):** when corrected, append one line to `.claude/rules/lessons.md` in the format
   `- AVOID <thing> — DO <alternative> (YYYY-MM-DD)`, mirror it to `.cursor/rules/lessons.mdc`, and
   optionally save a project-scoped `feedback` memory (prefix `[portable]` if the lesson applies
   beyond this repo). **Never write `~/.claude/CLAUDE.md`** — user-level memory is the human's job.
   (The `lessons-extractor` SessionEnd hook captures these automatically, and the Studio
   **Corrections** tab accepts candidates through the *same* append helper — one lesson format /
   dedup across all three surfaces. This skill is the in-session, deliberate path.)
3. Keep `Owner` accurate so the receiving tool reads a self-contained, current registry.

## Do not

- Touch architecture docs — that's `doc-update-project`.
- Hand-maintain the plan↔commit map when the script can derive it from `git log`.
- Hand `git mv` for lifecycle moves — use `scripts/doc-lifecycle.mjs` / the lib.
- Drop the date or the "use instead" half of a lesson — both are required.
- Put catalog/ownership content in `PLANS.md` — that belongs in `docs/README.md` (project class). If the catalog looks stale, prompt the user to run `doc-update-project`.
