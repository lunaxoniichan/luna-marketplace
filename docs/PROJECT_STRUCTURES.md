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
│   ├── PLANS.md                    # plan registry: spec|plan|phase|owner|commit|status|hint (#7)
│   ├── TODO.md                     # backlog; every row links to a plan+phase (#7)
│   ├── TOOLS_LIST.md               # component inventory: copy/adapt/new/reuse + source + reason
│   ├── SYSTEM_DESIGN.md            # target architecture + the 3 enforcement mechanisms
│   ├── PROJECT_STRUCTURES.md        # this file
│   ├── DATABASE_DESIGN.md          # (per-project, on demand via doc-init)
│   ├── DESIGN_SYSTEM.md            # (per-project, on demand via doc-init)
│   ├── workflows/
│   │   └── WORKFLOW.md             # phases + gates + suggested_skills + inline mermaid
│   ├── specs/                      # design docs (created on first dev-brainstorm)
│   ├── plans/                      # implementation plans (created on first dev-plan)
│   └── api/                        # (per-project, on demand)
├── .claude/
│   └── rules/                      # always-on (auto-loaded): core, workflow, docs, git, codebase-awareness, lessons
├── .cursor/                        # Cursor mirror (cross-tool)
│   ├── skills -> ../skills         # symlink: identical SKILL.md files
│   ├── hooks.json                  # beforeShellExecution (block-no-verify, secret, url) + beforeReadFile + stop
│   └── rules/                      # luna.mdc (bootstrap) + lessons.mdc
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
│   ├── lib/approach-correction.py  # lessons-extractor's Haiku extractor + lessons/memory writer
│   └── build-plans-registry.mjs    # git log --grep 'Plan:' -> PLANS.md (#7)
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
| `.claude/rules/` | Always-on guardrails (auto-loaded by Claude Code): core, workflow, docs, git, codebase-awareness, lessons (+ security in Phase 2). |
| `.cursor/` | Cursor mirror: `skills` symlink, `hooks.json` (`beforeShellExecution`), `rules/*.mdc` — same content as the Claude side. |
| `skills/` | 36 atomic, independent skills grouped by prefix (`workflow-/dev-/review-/doc-/skill-/hook-/kwb-/design-`). |
| `agents/` | 7 autonomous units (review/execute/test/document/brainstorm); user-invoked, isolated context. |
| `hooks/` + `scripts/hooks/` | session-start + block-no-verify (P1); gitnexus-freshness/-post-commit, doc-sync-reminder, url-safety-guard, secret-read-guard, lessons-extractor (P2). Node hooks export `run()` and are unit-tested; bash/python hooks fail-open + opt-out via `LUNA_*`. |
| `fork/` | Vendored references. Copy/adapt from here; never depend on them at runtime. |

## Submodule / sub-project doc mirror convention

When a project managed by this kit contains sub-projects (its own submodules or service folders),
mirror the **agent docs** per module: each module gets its own `docs/TODO.md`, `docs/PLANS.md`, and
`docs/PROJECT_STRUCTURES.md`, plus optional `docs/DESIGN_SYSTEM.md`, `docs/DATABASE_DESIGN.md`,
`docs/api/`. This keeps plan↔commit tracking and doc-sync scoped to the module that actually changed,
rather than one giant root registry.
