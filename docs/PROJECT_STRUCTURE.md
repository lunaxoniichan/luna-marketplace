# Luna Agent Kit — Project Structure

> Phase 0 artifact. Shows the **target** repo layout. Directories marked _(planned)_ do not exist
> yet; they are created in Phases 1–4. Currently only `fork/` and the Phase-0 docs exist.

## Layout

```
luna-marketplace/
├── .claude-plugin/
│   └── plugin.json                 # (planned) minimal manifest: name, version, description, hooks
├── AGENTS.md                       # agent + contributor guide (entry doc)
├── CLAUDE.md  ->  AGENTS.md        # (planned) symlink
├── README.md                       # (planned) human-facing intro
├── docs/
│   ├── DECISIONS.md                # (planned) rejection/decision memory — injected at session start (#1)
│   ├── PLANS.md                    # (planned) plan registry: plan|phase|commit|status|resume hint (#7)
│   ├── TODO.md                     # (planned) backlog; every row links to a plan+phase (#7)
│   ├── TOOLS_LIST.md               # Phase-0 review artifact: what we copy/adapt/new/reuse + source + reason
│   ├── SYSTEM_DESIGN.md            # target architecture + the 3 enforcement mechanisms
│   ├── PROJECT_STRUCTURE.md        # this file
│   ├── DATABASE_DESIGN.md          # (planned, per-project)
│   ├── DESIGN_SYSTEM.md            # (planned, per-project)
│   ├── workflows/
│   │   └── WORKFLOW.md             # (planned) phases + gates + suggested_skills + inline mermaid
│   ├── specs/                      # (planned) brainstorming design docs (NOT docs/superpowers/)
│   ├── plans/                      # (planned) implementation plans
│   └── api/                        # (planned, per-project)
├── .claude/
│   └── rules/                      # (planned) always-on rules, ≤50 lines each
├── skills/                         # (planned) plugin skills (atomic) — auto-discovered
├── agents/                         # (planned) autonomous work units — auto-discovered
├── hooks/
│   └── hooks.json                  # (planned) event handler config
├── scripts/
│   ├── hooks/                      # (planned) hook implementations (bash/node)
│   └── build-plans-registry.mjs    # (planned) git log --grep 'Plan:' -> PLANS.md
└── fork/                           # reference only (read-only); NOT loaded at runtime
    ├── superpowers/                #   discipline skills (TDD, debugging, plans, reviews)
    ├── ECC/                        #   262 domain skills + hook-profile patterns + rules
    └── claude-plugins-official/    #   canonical plugin/hook patterns, pr-review-toolkit, security-guidance
```

## What each top-level piece is for

| Path | Role |
|------|------|
| `.claude-plugin/plugin.json` | Plugin identity. Only `name` is required; `skills/`, `agents/`, `commands/`, `hooks/hooks.json` are **auto-discovered**, so their paths are omitted. |
| `AGENTS.md` / `CLAUDE.md` | Entry instructions; instruction priority; pointers to workflow + doc obligations. |
| `docs/` (project docs) | Human/architecture truth: `SYSTEM_DESIGN`, `PROJECT_STRUCTURE`, `DATABASE_DESIGN`, `DESIGN_SYSTEM`, `api/`. Owned by `doc-update-project`. |
| `docs/` (agent docs) | Workflow state: `PLANS.md`, `TODO.md`, `DECISIONS.md`, `plans/*`. Owned by `doc-update-agent`. |
| `docs/workflows/WORKFLOW.md` | The single per-project workflow definition (markdown-only). Edited via `workflow-update`. |
| `.claude/rules/` | Always-on guardrails: core, workflow, docs, git, codebase-awareness, security. |
| `skills/` | Atomic, independent skills (grouped by prefix: `workflow-`, `dev-`, `review-`, `doc-`, `skill-`, `hook-`, `kwb-`, `design-`). One job each; no cross-references. `doc-init` scaffolds this whole doc set for a new project. |
| `agents/` | Autonomous work units (one task in isolated context); no skill-chaining. Includes optional **`review-internal`** (batched code/security/performance/simplify review) and **`review-external`** (user UI/UX feedback). |
| `hooks/` + `scripts/hooks/` | Reminders/guards (session-start, decision-guard, gitnexus-freshness, doc-sync, security). |
| `fork/` | Vendored references. Copy/adapt from here; never depend on them at runtime. |

## Submodule / sub-project doc mirror convention

When a project managed by this kit contains sub-projects (its own submodules or service folders),
mirror the **agent docs** per module: each module gets its own `docs/TODO.md`, `docs/PLANS.md`, and
`docs/PROJECT_STRUCTURE.md`, plus optional `docs/DESIGN_SYSTEM.md`, `docs/DATABASE_DESIGN.md`,
`docs/api/`. This keeps plan↔commit tracking and doc-sync scoped to the module that actually changed,
rather than one giant root registry.
