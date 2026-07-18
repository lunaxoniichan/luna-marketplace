# Codebase awareness (GitNexus)

Query before writing new code. **Always/Never rules and impact procedures:** **`vibe-rules`** §7 · **`gitnexus-impact-analysis`** skill.

## Before writing new code

Before writing a **new** function, module, or service:

1. **Single repo:** query GitNexus (`query`, `context`, or `impact`) for an existing implementation.
2. **Multi-module / multi-repo:** use **`group_query`** first — then drill in with `query`/`context` on the winning hit.
3. **Reuse or extend** what exists — do not recreate parallel logic.
4. If the index may be stale (recent commits), note it; `gitnexus-freshness` hook auto-reindexes async.

Pair proactive GitNexus query with **reactive** `jscpd` (`review-simplify` + `dedupe-guard` hook).

Repo-wide cleanup: **`dev-refactor`** or **`refactor-cleaner`** agent — not `review-simplify` (diff-scoped only).

**Monorepo + submodules:** index each repo; use **`group_query`** for cross-module dupes. Hooks:
`gitnexus-submodule-advisory`, `gitnexus-submodule-sync`.

Use installed GitNexus skills — do not re-author them.
