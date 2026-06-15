---
name: review-performance
description: Use when reviewing hot paths, loops over data, DB access, or large allocations — catch N+1 queries, needless work, and avoidable allocations
---

# Review performance

Standalone performance review. Completes the `review-internal` set (with review-code/-security/
-simplify). Independent — report findings, don't auto-chain. **Measure before optimizing** — flag
likely costs, don't micro-optimize cold paths.

## Focus

1. **N+1 / query patterns** — queries inside loops; missing `JOIN`/batch/`IN`; absent indexes on
   filtered/sorted columns; `SELECT *` on wide tables in hot paths.
2. **Algorithmic cost** — accidental O(n²) (nested scans, repeated `.includes`/`.find` in a loop); work
   repeated per iteration that could be hoisted; unbounded growth.
3. **Allocations** — large copies in loops; rebuilding immutable data each call; unbounded caches/leaks.
4. **I/O & concurrency** — serial awaits that could be `Promise.all`; sync I/O on a hot path; missing
   pagination/streaming for large result sets.
5. **Caching** — recomputing stable results; cache without invalidation (correctness > speed).

## Process

1. Scope to changed/hot files (`git diff`); ask which paths are actually hot if unclear.
2. For each finding: estimated impact (hot/warm/cold) + concrete fix.
3. Prefer the fix that removes work over the one that hides it behind a cache.

## Output

```markdown
## Performance review
### Hot-path (fix)   — issue · file:line · cost · fix
### Worth doing      — …
### Note / measure   — needs a benchmark before changing
```

## Do not

- Optimize cold paths or trade clarity for micro-gains without a measurement.
- Add caching that can serve stale data without an invalidation story.
