# Codebase awareness (GitNexus)

Before writing a **new** function, module, or service:

1. **Single repo:** query GitNexus (`query`, `context`, or `impact`) for an existing implementation.
2. **Multi-module / multi-repo:** use **`group_query`** first — it runs `query` across every module
   in the group and merges results (RRF), so you find an implementation that lives in *another*
   module (e.g. a util in `backend` you'd otherwise duplicate in `data-pipeline`). Then drill in
   with `query`/`context` on the winning hit.
3. **Reuse or extend** what exists — do not recreate parallel logic.
4. If the index may be stale (recent commits), note it; Phase 2's `gitnexus-freshness` hook
   auto-reindexes async.

Semantic search misses near-clones that are copy-pasted with small edits. Pair the proactive
GitNexus query above with the **reactive** `jscpd` pass (see `review-simplify` + the `dedupe-guard`
commit hook) to catch duplication after the fact.

For **repo-wide dedupe, module reshaping, or delete sprints**, use **`dev-refactor`** (or the
**`refactor-cleaner`** agent) — not `review-simplify`, which is diff-scoped only.

**Monorepo + git submodules:** each submodule may have its own `.gitnexus/` index. Run
`npx gitnexus analyze` inside each repo you edit; use **`group_query`** for cross-module dupes.
Commit inside submodules first, then bump the parent pointer. Hooks: `gitnexus-submodule-advisory`,
`gitnexus-submodule-sync` (see `dev-refactor` § Monorepo + submodules).

Use installed GitNexus skills (`gitnexus-exploring`, `gitnexus-impact-analysis`, etc.) — do not
re-author them.
