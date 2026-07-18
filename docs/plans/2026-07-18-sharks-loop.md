---
title: Sharks-Loop — plugin half
scope: project
type: plan
lifecycle: official
status: draft
keywords: [sharks-loop]
related: []
updated: 2026-07-18
---

# Plan — Sharks-Loop (plugin half)

> **Status:** 2026-07-18 — PLAN (docs-only; nothing implemented).
> **Spec:** `docs/specs/2026-07-18-sharks-loop-convergence-oracle.md`
> **Engine plan (separate repo):** `second-world/docs/CONCEPT_AUDITS/sharks/SHARKS_LOOP_IMPLEMENTATION_PLAN.md`
> **Owner:** claude · **v0 target:** developers on Flynance-localhost.
> Commits during this plan carry `Plan: docs/plans/2026-07-18-sharks-loop.md#phase-N` (kit convention).

---

## Dependency on the engine

The plugin is a thin client; each phase assumes the matching engine seam exists (engine plan
S1/S3/S4/S6/**S7 MCP**). Build the engine capability first, then the plugin phase that drives it. The
engine's **stdio MCP server** (v0, D3) + console scripts are the only contract — no Python review
logic ships here. Per **D1 (split)**, phase-0 is product-agnostic (a kit mechanism); phases 1–4 bind
it to the sharks engine.

## Phases

### phase-0 — generic convergence mechanism (D1 split)
- Add the *generic* convergence-ledger + re-verify discipline as a **new luna-agent-kit mechanism** (alongside corrections→rules + plan↔commit). Product-agnostic: skills that read/write the ledger + drive a re-verify loop against **any** engine that exposes the `run_review`/`reverify`/`ledger_query` contract. Register the engine's **stdio MCP server** (D3) as the default transport.
- **Validation:** the mechanism docs + skills load; a `FakeEngine` MCP stub drives a full OPEN→FIX→RESOLVED ledger cycle in a scripted session.

### phase-1 — sharks skeleton + `run-review` (via MCP)
- Add the `sharks-*` skills that bind the generic mechanism to the second-world sharks engine over **MCP (v0 — D3)**; author `run-review` (call the `run_review` MCP tool, surface verdict, document the "no dev/admin login" auth guidance).
- **Validation:** scripted session on Flynance-localhost produces `.sharks/report.json` + a readable verdict via the MCP tool. (Committed transcript under `docs/examples/`.)

### phase-2 — `interpret-verdict` + subagents
- Rank findings by severity × behavioral impact; render plain-language impact summary; add `product-reviewer` + `security-reviewer` interpreter subagents.
- **Validation:** given a sample `report.json`, ranked plain-language summary; subagents stay interpreter-only.

### phase-3 — `drive-fix` + convergence loop (core)
- Ledger-query-first (do-not-repeat) → hand Claude Code the remediation prompt → `sharks-reverify` → record; loop to `RESOLVED` or escalate at the attempt cap.
- **Validation:** scripted session — a seeded finding closes via the loop; a second run does not re-solve it; oscillation escalates at the cap.

### phase-4 — `maintain-report` + continuity
- Summarize converged/open/regressed across sessions from the ledger, anchored to snapshot ids.
- **Validation:** across two sessions the summary is accurate.

### phase-5 — CI gate *(expansion / loop-coupled)*
- Optional GitHub Action wrapping the (already-v0) MCP loop as a PR gate. (MCP transport itself moved into phase-0/1 per D3.)
- **Validation:** CI gate blocks a PR leaving a hard finding `STILL_FAILING`.

## Definition of done (plugin v0 = phase-0..4)
Generic convergence mechanism lives in luna-agent-kit (phase-0); `sharks-*` skills bind it to the
engine over MCP; `run-review` on Flynance-localhost → ranked verdict + issue packs; `drive-fix`
closes a seeded security + product finding with `reverify` confirming `RESOLVED`; ledger prevents
duplicate re-solving; guardrail prevents infinite loops; zero Python review logic in the plugin.

## Decisions (2026-07-18)
**Resolved:** D1 = **split** (generic mechanism in kit + engine in second-world) · D2 = keep
"Sharks-Loop" provisional · D3 = **MCP server in v0** · D4 = engine docs in
`second-world/docs/CONCEPT_AUDITS/sharks/` (PRE_OFFICIAL). See the doc-lifecycle improvement:
`docs/specs/2026-07-18-doc-lifecycle-pre-official-post.md`.
**Still open (build-time):** staging Firebase project vs emulator · `identity_mode` default · attempt-cap value.

## Validation note
Plugins have no unit-test harness — validate each phase with a **scripted session transcript** under
`docs/examples/`.
