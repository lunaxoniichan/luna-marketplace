---
name: skill-audit
description: Use to review the installed skill set for drift, staleness, oversize, broken references, or redundancy — keeps the kit from rotting into bloat
---

# Skill audit

Periodic health check on the kit's own skills (pain #6 — stop the kit becoming the bloat it fights).
Dogfooding tool: run it on `luna-marketplace` itself.

## What to check

1. **Inventory vs reality** — every `skills/*/SKILL.md` is a row in `docs/TOOLS_LIST.md` and vice
   versa; counts in `## Counts` match `ls skills | wc -l`.
2. **Frontmatter** — only `name` + `description`; `name` matches the directory; description is
   "Use when…", third-person, no workflow summary.
3. **Size** — `wc -l skills/*/SKILL.md`; flag >250 lines → route to `doc-simplify`.
4. **Independence** — grep for `REQUIRED SUB-SKILL`, `@skills/`, "then invoke" → none allowed.
5. **Staleness** — referenced files/paths/skills still exist; fork sources still cited correctly.
6. **Redundancy** — two skills with overlapping triggers → candidate to merge (hand to `skill-compare`).

## Process

1. Enumerate skills; build the actual table.
2. Diff against `TOOLS_LIST.md`; list adds/drops/mismatches.
3. Run the size + independence + reference greps; collect violations.
4. Report findings by severity; propose fixes (don't auto-apply structural changes without approval).

## Output

```markdown
## Skill audit
### Drift        — inventory ≠ TOOLS_LIST rows
### Oversize     — file · lines (>250)
### Coupling     — file · offending line
### Stale refs   — file · broken path/skill
### Redundancy   — skill A ↔ skill B overlap
```

## Do not

- Auto-delete or auto-merge skills — propose, let the user/`skill-compare` decide.
- Re-author the reused GitNexus skills (they're external, intentionally not in our inventory).
