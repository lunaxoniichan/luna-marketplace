---
name: review-code
description: Use when completing tasks, major features, or before merge — standalone correctness review
---

# Review code

Standalone correctness review. **No mandatory subagent chain** — use Task/subagent when available for isolated context, or review inline.

**Core principle:** Review early when risk is high; optional for trivial changes.

## When to review

**Recommended:**
- Before merge to main
- After major feature completion
- When stuck (fresh perspective)

**Optional:**
- Small fixes (`trivial` variant)
- After each plan task (user choice — not forced 2× review)

## How to review

1. Get scope:
   ```bash
   git diff [base]...HEAD
   ```
2. Against **plan/spec/tests** — not session narrative
3. Report:
   - **Critical** — must fix before merge
   - **Important** — should fix
   - **Minor** — note for later
   - **Strengths** — what works well

## Checklist

- Requirements met (plan + spec)
- Tests exist and pass (fresh command output as evidence)
- Error handling explicit — no silent fallbacks
- Security basics (secrets, injection, auth boundaries)
- Matches project patterns

## Subagent dispatch (optional)

When using Task tool, provide only:
- What was built
- Plan/requirements excerpt
- BASE_SHA / HEAD_SHA or file list

Reviewer should **not** receive full session history.

## Integration

- After review: fix Critical/Important issues or push back with reasoning
- Does **not** auto-invoke `review-simplify` — user or workflow menu chooses it
