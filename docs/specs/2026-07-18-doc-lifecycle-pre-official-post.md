---
title: Doc lifecycle — PRE_OFFICIAL / OFFICIAL / POST_OFFICIAL
scope: project
type: spec
lifecycle: official
status: active
keywords: [lifecycle, docs, pre_official, post_official]
related: []
updated: 2026-07-18
---

# Spec — Doc lifecycle: PRE_OFFICIAL / OFFICIAL / POST_OFFICIAL

> **Status:** 2026-07-18 — ADOPTED (schema + buckets + generators in Luna Studio Phase 0).
> **Plan:** `docs/plans/2026-07-18-luna-studio.md` (subsumes `docs/plans/2026-07-18-doc-lifecycle-restructure.md`)
> **Origin:** founder request (D4 of the Sharks-Loop brainstorm) to formalize a doc lifecycle so
> `docs/` cleanly separates *current truth* from *concept research* and *archived/legacy* material.

---

## 1. Problem

luna-agent-kit already splits **project docs** (architecture) from **agent docs** (workflow state),
but it has **no lifecycle axis**: concept/research, current-truth, and superseded/completed material
all pile into the same `docs/` namespace. Over time this blurs "what is true *now*" against "what we
*explored*" and "what we *retired*". The kit's own dogfood surfaced it: the Sharks-Loop forward
design had nowhere obviously-correct to live.

**Prior art (validates the pattern):** the `second-world` repo already does this informally —
`docs/CONCEPT_AUDITS/` = pre-adoption research; `docs/` = current-state; `docs/implements/COMPLETED__*`
= archived/completed. This spec generalizes that into a first-class kit convention.

## 2. The three stages

| Stage | Meaning | Contains | Produced/owned by |
|---|---|---|---|
| **PRE_OFFICIAL** | Concept — explored, not yet adopted as truth | brainstorm specs (pre-adoption), `dev-research` outputs, concept audits | `dev-brainstorm`, `dev-research` |
| **OFFICIAL** | Current truth — adopted, ground-truth, actively maintained | `SYSTEM_DESIGN`, `PROJECT_STRUCTURES`, `DATABASE_DESIGN`, `DESIGN_SYSTEM`, `api/`, **active** plans + `PLANS.md`/`TODO.md` | `doc-update-project` / `doc-update-agent` |
| **POST_OFFICIAL** | Archive — superseded or completed | completed plans, deprecated/superseded designs, legacy-logic reference | `doc-update-agent` (archival step) |

**Lifecycle flow:**

```mermaid
flowchart LR
    PRE["PRE_OFFICIAL<br/>concept · research · audits"] -->|adopted| OFF["OFFICIAL<br/>current truth (docs/ root)"]
    OFF -->|superseded / completed| POST["POST_OFFICIAL<br/>legacy · completed plans"]
    PRE -->|rejected| POST
```

## 3. Proposed structure (back-compat-aware)

Keep `docs/specs/` + `docs/plans/` + `PLANS.md`/`TODO.md` **where they are** (skills, `doc-init`, and
`build-plans-registry.mjs` reference these paths). Add two lifecycle buckets + a front-matter tag:

```
docs/
├── pre-official/          # NEW — concept stage
│   ├── research/          #   dev-research outputs
│   └── audits/            #   concept audits / exploratory system designs
├── specs/                 # OFFICIAL-track design specs (adopted or in-flight) — unchanged path
├── plans/                 # OFFICIAL active implementation plans — unchanged path
├── PLANS.md · TODO.md     # active registry + backlog — unchanged
├── SYSTEM_DESIGN.md · PROJECT_STRUCTURES.md · TOOLS_LIST.md · …   # OFFICIAL current-state
└── post-official/         # NEW — archive stage
    ├── completed-plans/   #   plans whose work shipped (keeps PLANS.md active table lean)
    └── legacy/            #   superseded designs + legacy-logic reference
```

**Front-matter tag** on every doc: `lifecycle: pre_official | official | post_official`. Cheap,
greppable, and lets tooling/agents reason about stage without relying on path alone.

**Promotion/demotion rules:**
- A `dev-brainstorm` spec starts OFFICIAL-track in `docs/specs/` if the work is committed to; purely
  exploratory research/audits start in `docs/pre-official/`.
- When a plan's work ships, `doc-update-agent` moves it `plans/ → post-official/completed-plans/` and
  flips its tag.
- When an OFFICIAL design is superseded, it moves to `post-official/legacy/` with a pointer to its
  replacement.

## 4. Ripple effects to handle in the plan

- **`AGENTS.md`** — document the three stages + the tag; keep "specs never in `docs/superpowers/`".
- **`docs/PROJECT_STRUCTURES.md`** — add the two buckets + the lifecycle axis to the layout table.
- **`build-plans-registry.mjs`** — teach it to skip `post-official/completed-plans/` (or list them in a
  separate "Completed" table) so the active `PLANS.md` table stays lean.
- **`doc-init`** — scaffold `pre-official/` + `post-official/` (empty, with READMEs).
- **`doc-update-project` / `doc-update-agent`** — own the promote/demote moves + the tag.
- **Submodule mirror convention** — extend §"doc mirror" so each module mirrors the same 3-stage layout.

## 5. Non-goals / guards

- No mass move of existing content in this change — introduce the buckets + tag + rules; migrate
  opportunistically (avoid breaking `PLANS.md`/skill path references).
- Naming: folders are lowercase-kebab (`pre-official/`, `post-official/`) to match existing `docs/`
  entries; the tag uses the snake_case stage names.

## 6. Cross-references

Kit conventions: `AGENTS.md`, `docs/PROJECT_STRUCTURES.md` · First consumer: the Sharks-Loop engine
docs already sit in `second-world/docs/CONCEPT_AUDITS/sharks/` (a PRE_OFFICIAL home) —
`docs/specs/2026-07-18-sharks-loop-convergence-oracle.md`.
