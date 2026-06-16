---
name: review-simplify
description: Use after code changes to reduce duplication, dead code, and unnecessary complexity while preserving behavior
---

# Review simplify

Find redundancy, dead code, and over-complexity. **Preserve exact behavior** — simplify how, not what.

## When to use

- After a logical chunk of implementation
- Before merge when files grew large or tangled
- Optional from the execute-phase menu in `WORKFLOW.md`

## Focus

1. **Duplication** — merge repeated logic; reuse existing utilities (see Duplication pass below)
2. **Dead code** — unused imports, unreachable branches, orphaned helpers
3. **Complexity** — deep nesting, nested ternaries, oversized functions/files
4. **Scope** — recently modified files unless user widens scope

## Duplication pass (deterministic + semantic)

Catch both copy-paste clones and concept-level duplicates:

1. **jscpd (deterministic floor)** — run the copy/paste detector for exact + near clones across
   150+ languages (one tool covers Python, TS/JS, Go, etc.):
   ```bash
   npx jscpd --silent --reporters consolefull <paths>
   ```
   It reads the repo's `.jscpd.json` (scaffolded by `doc-init`) for thresholds and ignore globs.
2. **GitNexus (semantic)** — jscpd misses logic that's the *same idea* written differently. Run
   `query` (or `group_query` on a multi-module repo) for the behavior you're consolidating to find
   semantically-similar implementations in sibling modules.
3. **Merge** — combine both findings; propose one canonical implementation and route callers to it.

The `dedupe-guard` commit hook runs jscpd automatically (warn-only) — this skill is the deeper,
on-demand cleanup that also folds in GitNexus semantic matches.

## Process

1. Identify changed files (`git diff` or session edits)
2. Run the Duplication pass above; list simplification opportunities with risk level
3. Apply safe simplifications or propose diffs for user approval
4. Run tests after substantive edits; confirm output before claiming success

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

- Auto-run after every task (unlike bundled SDD review chains)
- Change tests to match broken simplifications — behavior must stay green
