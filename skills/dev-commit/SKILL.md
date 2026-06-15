---
name: dev-commit
description: Use when the user explicitly asks to commit — conventional message plus Plan trailer during plan work
---

# Dev commit

Create git commits **only when the user asks**. Every commit during active plan work carries a **`Plan:`** trailer for traceability.

## Before committing

1. Fresh verification evidence required — run tests/lint/build and read full output
2. `git status` + `git diff` — no secrets, no unintended files
3. User explicitly requested the commit

## Message format

```
<type>: <description>

[optional body]

Plan: docs/plans/<file>.md#phase-N
```

**Types:** feat, fix, refactor, docs, test, chore, perf, ci

**Plan trailer:**
- Required when executing a plan in `docs/plans/`
- `#phase-N` = plan section or task group (e.g. `#task-3`, `#phase-2`)
- Omit only for non-plan work (typos, kit maintenance) — user may still ask for a trailer

## Steps

1. Stage relevant files only — never `.env` or credentials
2. Commit via HEREDOC for formatting:

```bash
git commit -m "$(cat <<'EOF'
feat: short description

Plan: docs/plans/2026-06-14-feature.md#task-1
EOF
)"
```

3. `git status` after commit to confirm success
4. If hook fails — fix issue, **new** commit (do not amend unless user rules allow)

## After commit

- Remind user: Phase 2's `build-plans-registry.mjs` rebuilds `docs/PLANS.md` from `git log --grep '^Plan:'`
  — commit that regenerated `PLANS.md` **without** a `Plan:` trailer (it's auto-derived; a trailer self-invalidates the registry)
- Update `doc-update-agent` when backlog/plan status changes (Phase 2 skill)

## Never

- `git commit --no-verify` (blocked by hook)
- Commit without user request
- Force push to main without explicit user request
