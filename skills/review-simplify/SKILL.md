---
name: review-simplify
description: Use after code changes to reduce duplication, dead code, and unnecessary complexity within the diff — preserve behavior. For repo-wide cleanup sprints use dev-refactor instead.
---

# Review simplify

Find redundancy, dead code, and over-complexity **in changed files**. **Preserve exact behavior** —
simplify how, not what.

> **Scope is the diff.** For repo-wide dedupe, module reshaping, or delete sprints → use
> **`dev-refactor`** (or the **`refactor-cleaner`** agent).

## When to use

- After a logical chunk of implementation
- Before merge when files grew large or tangled
- Simplification lens inside **`review-internal`** at PR time
- Optional from the execute-phase menu in `WORKFLOW.md`

## When NOT to use

- Full-repo clone inventory or cleanup sprint → **`dev-refactor`**
- Coordinated multi-file rename campaigns → **`gitnexus-refactoring`** via **`dev-refactor`**
- Module boundary redesign → **`dev-refactor`** Phase C

## Focus (changed files only)

1. **Duplication** — clones in touched paths; reuse existing utilities
2. **Dead code** — unused imports, unreachable branches, orphaned helpers in the diff
3. **Complexity** — deep nesting, nested ternaries, oversized functions introduced in the diff

## Duplication pass (scoped)

1. Identify changed paths: `git diff --name-only` (or session edits)
2. **jscpd on touched paths only:**
   ```bash
   npm run jscpd -- path/to/changed1 path/to/changed2
   # fallback if no package.json:
   npx jscpd --silent --reporters consolefull path/to/changed1
   ```
   Reads `.jscpd.json` (scaffolded by `doc-init`).
3. **GitNexus (light)** — `query` or `context` for concepts in the diff; `group_query` if the
   change might duplicate a sibling module
4. Propose one canonical implementation; route callers if safe

The `dedupe-guard` hook runs jscpd on **staged** files at commit time (advisory). This skill is the
deeper pass on the full diff plus semantic matches.

## Process

1. Identify changed files (`git diff` or session edits)
2. Run scoped duplication pass; list opportunities with risk level
3. Apply safe simplifications or propose diffs for user approval
4. Run tests after substantive edits; confirm output before claiming success

If scope grows beyond the diff, stop and recommend **`dev-refactor`**.

## Balance

- Clarity over brevity — explicit beats clever
- Do not remove useful abstractions
- Do not drive behavior changes under "cleanup"

## Output format

```markdown
## Simplify report
### Safe to apply
- [file:line] — what and why

### Needs confirmation
- [file:line] — trade-off

### Left unchanged
- [file:line] — why (e.g. public API stability)
```

## Do not

- Auto-run after every task
- Run full-repo `jscpd` baseline (that's **`dev-refactor`** Phase A)
- Change tests to match broken simplifications — behavior must stay green
