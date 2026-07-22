---
title: Luna Studio — control plane for plugin knowledge
scope: project
type: plan
lifecycle: official
status: active
keywords: [studio, knowledge, control-plane]
related: []
updated: 2026-07-18
---

# Plan — Luna Studio (control plane for plugin knowledge)

> **Status:** 2026-07-18 — ACTIVE  
> **Spec (lifecycle layer):** `docs/specs/2026-07-18-doc-lifecycle-pre-official-post.md`  
> **Origin plan:** `~/.claude/plans/please-help-to-review-glowing-panda.md`  
> **Owner:** cursor  
> Commits: `Plan: docs/plans/2026-07-18-luna-studio.md#phase-N`

Expands the doc-lifecycle spec into a Next.js control plane. Markdown + git stay source of
truth; Studio DB/graph are rebuildable indexes.

## Phases

### phase-0 — Schema, generators, project registry
**Status:** DONE 2026-07-18 (+ post-gate fixes: real llms.txt, gitignore knowledge.json, missing_fm health, detectAgents, parseWorkflow cleanup)

### phase-1 — Studio app shell + read-only overview
**Status:** DONE 2026-07-18 (post-signoff: honest edges + host-first)
Next.js 16 host-first UI :3900; kit hierarchy + submodule-overlap edges only (no agent-share noise).
Docker optional/plugin-only. Fixtures opt-in via `LUNA_STUDIO_FIXTURES=1` / `npm run studio:fixtures`.

### phase-2 — Editing + agent-view generation
**Status:** Tasks 1–6 done (incl. Task 5 dedupe).
- Fleet sync ACTIVE: `docs/specs/2026-07-19-fleet-sync-contract.md` (`--all`, `mode:'fleet'`, adopt-unmarked, write-only default)
- Lifecycle promote/demote ACTIVE: `docs/specs/2026-07-19-doc-lifecycle-promote-demote-contract.md`
- Dedupe assistant ACTIVE: `docs/specs/2026-07-19-dedupe-assistant-contract.md` (lexical keyword pass, read-only)

### phase-3 — Graph memory backend
**Status:** DONE (v1) 2026-07-19 — contract ACTIVE; file-JSON index + fail-open embeddings + read-only query; Studio Graph memory tab. Graphiti/FalkorDB adapters deferred (T11).

### phase-4 — Context-engineering features
**Status:** COMPLETE (v1) — 4.0 ACTIVE · 4.1 pack · 4.2 drift · 4.3 correction inbox · 4.4 S3 reuse search + ADR why-view (registry read-only + mandatory provenance; default-vault isolation + fail-open + read-only negatives green).
Contract: `docs/specs/2026-07-20-context-pack-contract.md` (`status: active`).
Residual T-items (T7/T8/T12/T13) + Playwright smoke are fill-in; Phase 5 next.
Roadmap: `~/.claude/plans/please-review-what-we-wondrous-lake.md`.

### phase-5 — Lifecycle ownership + registry polish
**Status:** COMPLETE — P5a completed-plans superseded links · P5b doc-update skills own lifecycle
(single path) · P5c Obsidian export note. Follow-ups done: **T14** prod `next build` fixed (plugin
libs vendored into `studio/.plugin/`; e2e runs against prod build) · **T16** Obsidian read-only
exporter shipped. Remaining backlog: T11 (Graphiti/FalkorDB adapters, needs services), T15 (OAM,
deferred), T1 (Plan-trailer warn-hook), T2/T3 (Sharks-Loop, separate plan).

## Related
- Narrower lifecycle-only plan (subsumed): `docs/plans/2026-07-18-doc-lifecycle-restructure.md`
