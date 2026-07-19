# Backlog

> Every row links to a plan file + phase. Deferred scope from `dev-plan` lands here.

| ID | Task | Plan file | Plan phase | Status |
|----|------|-----------|------------|--------|
| T1 | Optional `commit-plan-trailer` PreToolUse warn-hook: when a `git commit` runs during an active plan but the message lacks a `Plan:` trailer, warn (don't block). Fail-open. | `docs/plans/2026-06-15-phase-1-review-fixes.md` | follow-up | deferred |
| T2 | Sharks-Loop MCP transport + optional GitHub Action CI gate (loop-coupled expansion tier). | `docs/plans/2026-07-18-sharks-loop.md` | phase-5 | deferred |
| T3 | Confirm remaining build-time decisions (staging Firebase vs emulator · identity_mode default · attempt-cap) before Sharks-Loop implementation. | `docs/plans/2026-07-18-sharks-loop.md` | phase-1 | blocked |
| T4 | Doc-lifecycle restructure — convention + buckets in Studio Phase 0; **promote/demote UI + skills** shipped (contract `docs/specs/2026-07-19-doc-lifecycle-promote-demote-contract.md`). | `docs/plans/2026-07-18-luna-studio.md` | phase-2 / phase-5 | done |
| T5 | Fleet sync (`sync-agent-views --all`) — generate plugin `rules/` into every registry project (ADR Option A). Contract: `docs/specs/2026-07-19-fleet-sync-contract.md` (active). | `docs/plans/2026-07-18-luna-studio.md` | phase-2 | done |
| T6 | Gateway hardening: per-vault mutation mutex, error normalization, body size cap, ctx env-gate. | `docs/plans/2026-07-18-luna-studio.md` | phase-2 | done |
| T7 | Phase 0 residuals: FM on architecture docs; surface `missing_frontmatter` in README health; content-aware `--check`. | `docs/plans/2026-07-18-luna-studio.md` | phase-0 follow-up | open |
| T8 | Studio UI hint after `type: plan` demote/supersede: surface “plan archived — run `build-plans-registry.mjs`” (registry rebuild is a separate no-trailer commit; skill documents it, UI does not yet). | `docs/plans/2026-07-18-luna-studio.md` | phase-2 follow-up | open |
| T9 | Dedupe assistant (lexical keyword pass, read-only) — contract + lib + Studio Dedupe tab. | `docs/plans/2026-07-18-luna-studio.md` | phase-2 Task 5 | done |
| T10 | Graph memory backend (Phase 3) — rebuildable file-JSON index, read-only query, fail-open local-ai, Studio Graph memory tab. Contract: `docs/specs/2026-07-19-graph-memory-backend-contract.md`. | `docs/plans/2026-07-18-luna-studio.md` | phase-3 | done |
| T11 | Optional Graphiti + FalkorDB enrichment adapters (still fail-open; file-JSON remains default). | `docs/plans/2026-07-18-luna-studio.md` | phase-3 follow-up | open |
| T12 | `recent_changes` is not recency-ordered (path order + shared `built_at`). Capture per-source git/mtime at rebuild and sort, or rename until recency is honest. | `docs/plans/2026-07-18-luna-studio.md` | phase-3 follow-up | open |
