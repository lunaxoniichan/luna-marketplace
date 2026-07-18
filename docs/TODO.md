# Backlog

> Every row links to a plan file + phase. Deferred scope from `dev-plan` lands here.

| ID | Task | Plan file | Plan phase | Status |
|----|------|-----------|------------|--------|
| T1 | Optional `commit-plan-trailer` PreToolUse warn-hook: when a `git commit` runs during an active plan but the message lacks a `Plan:` trailer, warn (don't block). Fail-open. | `docs/plans/2026-06-15-phase-1-review-fixes.md` | follow-up | deferred |
| T2 | Sharks-Loop MCP transport + optional GitHub Action CI gate (loop-coupled expansion tier). | `docs/plans/2026-07-18-sharks-loop.md` | phase-5 | deferred |
| T3 | Confirm remaining build-time decisions (staging Firebase vs emulator · identity_mode default · attempt-cap) before Sharks-Loop implementation. | `docs/plans/2026-07-18-sharks-loop.md` | phase-1 | blocked |
| T4 | Doc-lifecycle restructure — **done** (convention + buckets in Studio Phase 0). Promote/demote UI ownership remains Phase 2 Task 4 / Phase 5. Plan superseded → `docs/post-official/completed-plans/2026-07-18-doc-lifecycle-restructure.md`. | `docs/plans/2026-07-18-luna-studio.md` | phase-0 / phase-5 | done (partial → studio) |
| T5 | Fleet sync (`sync-agent-views --all`) — generate plugin `rules/` into every registry project (ADR Option A). Contract: `docs/specs/2026-07-19-fleet-sync-contract.md` (active). | `docs/plans/2026-07-18-luna-studio.md` | phase-2 | done |
| T6 | Gateway hardening: per-vault mutation mutex, error normalization, body size cap, ctx env-gate. | `docs/plans/2026-07-18-luna-studio.md` | phase-2 | done |
| T7 | Phase 0 residuals: FM on architecture docs; surface `missing_frontmatter` in README health; content-aware `--check`. | `docs/plans/2026-07-18-luna-studio.md` | phase-0 follow-up | open |
