# Codebase awareness (GitNexus)

Before writing a **new** function, module, or service:

1. Query GitNexus (`query`, `context`, or `impact`) for an existing implementation.
2. **Reuse or extend** what exists — do not recreate parallel logic.
3. If the index may be stale (recent commits), note it; Phase 2's `gitnexus-freshness` hook auto-reindexes async.

Use installed GitNexus skills (`gitnexus-exploring`, `gitnexus-impact-analysis`, etc.) — do not re-author them.
