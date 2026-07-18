---
title: Fleet rules — plugin rules/ is canonical across registered projects
scope: project
type: decision
lifecycle: official
status: active
keywords: [rules, sync-agent-views, fleet, centralization]
related:
  - docs/specs/2026-07-18-sync-agent-views-contract.md
updated: 2026-07-18
---

# Fleet rules — plugin `rules/` is canonical across registered projects

## Context

Founding goal: **change a rule once in the plugin → applies to every project/agent.**

Phase 2 Task 1 shipped `sync-agent-views` as **per-root**: `--root <path>` reads that tree's
`rules/` and writes that tree's `.claude` / `.cursor` views. That is necessary machinery, but
alone it is **Option B** (per-project canonical) — edit once per project.

## Decision

**Option A — fleet canonical.**

| Layer | Role |
|-------|------|
| **Plugin / kit `rules/`** | Fleet source of truth for shared Luna rules |
| **`sync-agent-views` (fleet mode)** | Generates into **every live registry project** (and the plugin root itself) |
| **Project-local `*.local.md` / `*.local.mdc`** | Untouched overrides (already hard-skipped) |
| **Project-local extra `rules/`** | Optional later: project-only additives merged after fleet rules — **not** required for v1 fleet |

v1 CLI remains usable as `--root <one>` for dogfood and CI. Studio / `sync --all` (to implement
before Task 3 UI hardens around “this project’s rules only”) iterates the registry allow-list
and runs the same no-clobber plan per target root, sourcing **canonical bodies from the plugin
`rules/`** unless a future explicit project overlay is designed.

## Why not B

Option B (per-project `rules/` only, plugin seeds at `doc-init`) is simpler but abandons
“edit once, apply everywhere.” The Studio UI would otherwise bake per-project editors as the
primary mental model and make fleet sync a retrofit.

## Consequences

- Docs and Studio must label **fleet rules** vs **project overlays** clearly.
- Conflict/abort semantics stay per target root (one hand-edited generated file does not block
  the whole fleet — report and continue other roots).
- Implementation of fleet iteration is **follow-up** on this ADR; do not ship Task 3 chrome that
  implies per-project `rules/` is the only source.

## File index

| Ref | Path |
|-----|------|
| This ADR | `docs/decisions/2026-07-18-fleet-rules-canonical.md` |
| Sync contract | `docs/specs/2026-07-18-sync-agent-views-contract.md` |
| Sync script | `scripts/sync-agent-views.mjs` |
