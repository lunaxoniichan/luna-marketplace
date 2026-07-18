---
title: Luna Agent Kit — Project Structure
scope: project
type: architecture
lifecycle: official
status: active
keywords: [structure, layout, skills, hooks]
related: []
updated: 2026-07-18
---

# Luna Agent Kit — Project Structure

> Phases 1–4 are built: 36 skills, 7 agents, 8 hooks (5 added in Phase 2), 6 rules, 1 script + a
> python helper, and the `.cursor/` cross-tool layer.

## Layout

```
luna-marketplace/
├── .claude-plugin/
│   └── plugin.json                 # manifest: name, version, description, hooks
├── AGENTS.md                       # agent + contributor guide (entry doc)
├── CLAUDE.md  ->  AGENTS.md        # symlink
├── README.md                       # human-facing intro
├── docs/
│   ├── README.md                   # catalog (generated markers via build-docs-index)
│   ├── PLANS.md                    # plan registry: spec|plan|phase|owner|commit|status|hint (#7)
│   ├── TODO.md                     # backlog; every row links to a plan+phase (#7)
│   ├── TOOLS_LIST.md               # component inventory: copy/adapt/new/reuse + source + reason
│   ├── SYSTEM_DESIGN.md            # target architecture + the 3 enforcement mechanisms
│   ├── PROJECT_STRUCTURES.md        # this file
│   ├── PLUGIN_MAP.md               # generated skill/phase graph (build-plugin-graph)
│   ├── DATABASE_DESIGN.md          # (per-project, on demand via doc-init)
│   ├── DESIGN_SYSTEM.md            # (per-project, on demand via doc-init)
│   ├── workflows/
│   │   └── WORKFLOW.md             # phases + gates + suggested_skills + inline mermaid
│   ├── specs/                      # OFFICIAL-track design specs
│   ├── plans/                      # OFFICIAL active implementation plans
│   ├── decisions/                  # ADRs (type: decision)
│   ├── pre-official/               # PRE_OFFICIAL — research/ + audits/
│   ├── post-official/              # POST_OFFICIAL — completed-plans/ + legacy/
│   ├── generated/                  # rebuildable JSON (plugin-graph + docs-index tracked; knowledge gitignored)
│   └── api/                        # (per-project, on demand)
├── llms.txt                        # agent routing index (build-docs-index)
├── studio/                         # Luna Studio Next.js app (host-first UI :3900)
├── rules/                          # CANONICAL kit/project rules (edit here)
├── memory/                         # CANONICAL memory notes → MCP feed (not native Claude memory)
├── .claude/
│   └── rules/                      # GENERATED from rules/ (plus agent-owned lessons.md)
├── .cursor/                        # Cursor mirror (cross-tool)
│   ├── skills -> ../skills         # symlink: identical SKILL.md files
│   ├── hooks.json                  # beforeShellExecution (block-no-verify, secret, url) + beforeReadFile + stop
│   └── rules/                      # GENERATED .mdc from rules/ (+ luna.mdc bootstrap, lessons.mdc)
├── skills/                         # 36 plugin skills (atomic) — auto-discovered
│                                   #   workflow-* dev-* review-* doc-* skill-* hook-* kwb-* design-*
├── agents/                         # 7 autonomous units — auto-discovered
│                                   #   review-internal/-external, execute, test, document-project/-agent, dev-brainstorm
├── hooks/                          # bash/dispatch hooks
│   ├── hooks.json                  # event config: SessionStart/PreToolUse/PostToolUse/Stop/SessionEnd
│   ├── session-start               # SessionStart injection (workflow-guide)
│   ├── gitnexus-freshness          # PreToolUse: stale-read reindex gate (#9)
│   ├── gitnexus-post-commit        # PostToolUse: async reindex after commit (#9)
│   ├── lessons-extractor           # SessionEnd: detached corrections extractor (#1)
│   └── run-hook.cmd                # cross-platform hook runner
├── scripts/
│   ├── hooks/                      # node hooks: block-no-verify, secret-read-guard, url-safety-guard,
│   │                               #   doc-sync-reminder + bash-guards (PreToolUse(Bash) dispatcher:
│   │                               #   runs the 3 Bash guards in one process) (+ web-*list.txt)
│   ├── lib/                        # frontmatter, luna-registry, md-walk, approach-correction.py
│   ├── build-plans-registry.mjs    # git log --grep 'Plan:' -> PLANS.md (#7)
│   ├── build-plugin-graph.mjs      # → plugin-graph.json + PLUGIN_MAP.md
│   ├── build-docs-index.mjs        # → docs-index.json + llms.txt + README catalog
│   ├── build-knowledge.mjs         # → knowledge.json (registry-wide)
│   ├── register-project.mjs        # → ~/.claude/luna/registry.json
│   └── detect-modules.mjs          # module targets for doc-init
└── fork/                           # reference only (read-only); NOT loaded at runtime
    ├── superpowers/
    ├── ECC/
    └── claude-plugins-official/
```

## What each top-level piece is for

| Path | Role |
|------|------|
| `.claude-plugin/plugin.json` | Plugin identity. `skills/`, `agents/`, `hooks/hooks.json` are **auto-discovered**. |
| `AGENTS.md` / `CLAUDE.md` | Entry instructions; instruction priority; pointers to workflow + doc obligations. |
| `docs/` (project docs) | Human/architecture truth: `SYSTEM_DESIGN`, `PROJECT_STRUCTURE`, `DATABASE_DESIGN`, `DESIGN_SYSTEM`, `api/`. Owned by `doc-update-project` (Phase 2). |
| `docs/` (agent docs) | Workflow state: `PLANS.md`, `TODO.md`, `plans/*`. Owned by `doc-update-agent` (Phase 2). Lessons/corrections live in `.claude/rules/lessons.md`. |
| `docs/workflows/WORKFLOW.md` | The single per-project workflow definition (markdown-only). Edited via `workflow-update`. |
| `rules/` | **Canonical** always-on rule bodies. Edit here; sync generates Claude/Cursor views. |
| `memory/` | **Canonical** project memory (`type: memory`) → MCP feed + Studio. Native session memory is separate. |
| `.claude/rules/` | **Generated** views (auto-loaded) + agent-owned `lessons.md`. Do not edit generated files. |
| `.cursor/rules/` | **Generated** `.mdc` views + `luna.mdc` / `lessons.mdc` exceptions. |
| `.cursor/` (rest) | Cursor mirror: `skills` symlink, `hooks.json` (`beforeShellExecution`). |
| `skills/` | 36 atomic, independent skills grouped by prefix (`workflow-/dev-/review-/doc-/skill-/hook-/kwb-/design-`). |
| `agents/` | 7 autonomous units (review/execute/test/document/brainstorm); user-invoked, isolated context. |
| `hooks/` + `scripts/hooks/` | session-start + block-no-verify (P1); gitnexus-freshness/-post-commit, doc-sync-reminder, url-safety-guard, secret-read-guard, lessons-extractor (P2). Node hooks export `run()` and are unit-tested; bash/python hooks fail-open + opt-out via `LUNA_*`. |
| `fork/` | Vendored references. Copy/adapt from here; never depend on them at runtime. |

## Doc lifecycle axis

| Stage | Tag | Folders |
|-------|-----|---------|
| PRE_OFFICIAL | `lifecycle: pre_official` | `docs/pre-official/{research,audits}/` |
| OFFICIAL | `lifecycle: official` | architecture docs, `specs/`, `plans/`, `decisions/` |
| POST_OFFICIAL | `lifecycle: post_official` | `docs/post-official/{completed-plans,legacy}/` |

Schema + templates: `templates/docs/FRONTMATTER.md`. Spec: `docs/specs/2026-07-18-doc-lifecycle-pre-official-post.md`.

## Submodule / sub-project doc mirror convention

When a project managed by this kit contains sub-projects (its own submodules or service folders),
mirror the **agent docs** per module: each module gets its own `docs/TODO.md`, `docs/PLANS.md`, and
`docs/PROJECT_STRUCTURES.md`, plus optional `docs/DESIGN_SYSTEM.md`, `docs/DATABASE_DESIGN.md`,
`docs/api/`, and the same **three-stage lifecycle** folders (`pre-official/`, `post-official/`,
`decisions/`). This keeps plan↔commit tracking and doc-sync scoped to the module that actually changed,
rather than one giant root registry.
