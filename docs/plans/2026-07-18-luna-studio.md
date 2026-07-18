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
**Status:** Tasks 1–2 signed off; Task 3 Server Action boundary drafted (awaiting sign-off). UI chrome next.
**Fleet:** Option A decided — `docs/decisions/2026-07-18-fleet-rules-canonical.md` (implement `--all` before UI hardens).
- Task 1: `docs/specs/2026-07-18-sync-agent-views-contract.md` (active)
- Task 2: `docs/specs/2026-07-18-vault-crud-contract.md` (active)
- Task 3: `docs/specs/2026-07-18-studio-server-actions-contract.md` (draft)
- Gateway: `scripts/lib/vault-gateway.mjs` · `npm run test:vault-gateway`

### phase-3 — Graph memory backend
FalkorDB + Graphiti + local-ai; fail-open; `LUNA_MEMORY_KG`.

### phase-4 — Context-engineering features
Context pack, correction inbox, drift alerts, cross-project reuse, ADR why-view.

### phase-5 — Lifecycle ownership + registry polish
Completed plans table; doc skills own promote/demote; Obsidian export note; OAM follow-up.

## Related
- Narrower lifecycle-only plan (subsumed): `docs/plans/2026-07-18-doc-lifecycle-restructure.md`
