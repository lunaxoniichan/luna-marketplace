# Luna Agent Kit — Tools Inventory

Living component inventory. **Phases 1–4 complete + v0.3.0 knowledge stack** — 38 skills, 8 agents, 10 hooks, 7 rules, 2 scripts,
the `.cursor/` cross-tool layer. The **Your call** column tracks per-row decisions.

> **Post-Phase-1 build (this pass), per locked session decisions:** Phase-2 hooks were **adapted from
> flynance** (`gitnexus_freshness.sh`→`gitnexus-freshness`+`gitnexus-post-commit`, `secret_guard.sh`→
> `secret-read-guard`, `web_source_guard.py`→`url-safety-guard`, `post_tool_use_lints`→
> `doc-sync-reminder`). Pain #1 is now **active** via a `lessons-extractor` SessionEnd hook
> (adapted from flynance `approach_correction_extractor`). All 9 `kwb-*` were built now (each <250
> lines) rather than copy-on-use. Two Phase-1 skills (`dev-tdd`, `dev-debug`) remain verbatim
> superpowers copies and intentionally exceed 250 lines.

> Revised after Phase-0 feedback: category prefixes incl. **`dev-` for the core lifecycle** and
> `kwb-` for ECC knowledge; `eval-harness` → opt-in; `human-acceptance-matrix` → folded into
> `review-external`; added `review-performance` skill, `review-internal`/`review-external` agents,
> `doc-init` skill; **cut `workflow-manager`** (native Task tools + plan mode cover it).
>
> **Post-Phase-1 update:** dropped `DECISIONS.md` + `decision-guard` + denylist + `hook-flags.js` —
> "don't-repeat" lessons now ride the **native rules** mechanism (`.claude/rules/lessons.md` +
> `.cursor/rules/lessons.mdc`); native plan mode authors and `dev-plan` exports to `docs/plans/`;
> added a **cross-tool `.cursor/` layer** so Claude Code + Cursor share repo + `SKILL.md` + hooks.

## Naming convention

**Every skill carries a category prefix** so similar skills group and are easy to recall. Agents
share their group's prefix where it applies.

| Prefix | Category | Members |
|--------|----------|---------|
| `workflow-` | workflow/orchestration meta | workflow-guide, workflow-update |
| `dev-` | core dev lifecycle | dev-brainstorm, dev-research, dev-audit, dev-plan, dev-execute, dev-tdd, dev-debug, dev-verify, dev-commit |
| `review-` | review tasks (skills + agents) | review-code, review-simplify, review-security, review-performance · agents: review-internal, review-external |
| `doc-` | documentation | doc-init, doc-update-project, doc-update-agent, doc-simplify |
| `skill-` / `hook-` | authoring meta | skill-author, skill-audit, skill-compare · hook-author |
| `kwb-` | knowledge base (from ECC) | kwb-python, kwb-postgres, kwb-api, … |
| `design-` | UI/schema generation | design-frontend, design-system, design-database |

### Legend — `Action`
**copy** = vendor verbatim (rename/Mermaid only) · **adapt** = copy + modify (decouple/trim/behavior) ·
**new** = author fresh · **reuse** = already installed, do not re-author.

Pain refs: #1 memory · #2 doc-sync · #3 dup/dead code · #4 doc right-size · #5 consistent workflow ·
#6 skill bloat · #7 plan↔commit trace · #8 manual refactor · #9 stale index/recreated code.

Fork roots: `superpowers/` = `fork/superpowers` · `ECC/` = `fork/ECC` · `cpo/` = `fork/claude-plugins-official`.

---

## Skills

### workflow-* (orchestration meta)
| # | Name | Action | Source | Reason / pain | Phase | Your call |
|---|------|--------|--------|---------------|-------|-----------|
| 1 | workflow-guide | adapt | superpowers/skills/using-superpowers | session bootstrap + Ultracode decision table; Mermaid not Graphviz (#5) | 1 | |
| 2 | workflow-update | new | — | single edit path for markdown-only `WORKFLOW.md` (#5) | 1 | |

### dev-* (core dev lifecycle)
| # | Name | Action | Source | Reason / pain | Phase | Your call |
|---|------|--------|--------|---------------|-------|-----------|
| 3 | dev-brainstorm | adapt (decouple) | superpowers/skills/brainstorming | design dialogue; strip "ONLY invoke writing-plans" hard-gate | 1 | |
| 4 | dev-plan | adapt | superpowers/skills/writing-plans | plan files; defer scope→TODO; acceptance = tests/contracts (#5,#7) | 1 | |
| 5 | dev-execute | adapt | superpowers/skills/executing-plans | plan mechanics; remove SUB-SKILL chain; require real `Task` dispatch | 1 | |
| 6 | dev-tdd | copy | superpowers/skills/test-driven-development | RED-GREEN-REFACTOR (#5) | 1 | |
| 7 | dev-debug | copy | superpowers/skills/systematic-debugging | root-cause-first | 1 | |
| 8 | dev-verify | copy | superpowers/skills/verification-before-completion | command-output evidence before "done" | 1 | |
| 9 | dev-commit | new | — | conventional commits **+ `Plan:` trailer** (#7) | 1 | |
| 10 | dev-research | copy (159 lines) | ECC/skills/deep-research | research before brainstorm when needed (#5) | 3 | |
| 11 | dev-audit | new | — | feasibility/risk check on a proposed idea/design | 3 | |

### review-* (review tasks)
| # | Name | Action | Source | Reason / pain | Phase | Your call |
|---|------|--------|--------|---------------|-------|-----------|
| 12 | review-code | adapt | superpowers/skills/requesting-code-review | logic/correctness report (#3) | 1 | |
| 13 | review-simplify | adapt | cpo/plugins/pr-review-toolkit/agents/code-simplifier.md | **diff-scoped** dedupe / dead-code / complexity (#3,#8); jscpd on changed paths + light GitNexus; full sprints → `dev-refactor` | 1 | |
| 13b | dev-refactor | new | (ref `docs/specs/code-intelligence-tools-comparison.md` §6.3) | **repo/domain cleanup sprint** orchestration — inventory → consolidate → reshape → delete; jscpd + GitNexus; delegates to gitnexus-* skills | post-4 | done |
| 14 | review-security | adapt (trim 503→<250) | ECC/skills/security-review | OWASP / secrets review | 2 | |
| 15 | review-performance | new | (ref ECC/rules/common/performance.md) | hot-path / N+1 / allocation review — completes `review-internal` set | 2 | |

### doc-* (documentation)
| # | Name | Action | Source | Reason / pain | Phase | Your call |
|---|------|--------|--------|---------------|-------|-----------|
| 16 | doc-init | new | (templatizes this Phase-0 doc set) | scaffold the **minimum doc set** for any project (#2,#4) — see below | 1 | |
| 17 | doc-update-project | new | — | sync human/architecture docs after code change (#2) | 2 | |
| 18 | doc-update-agent | new | — | sync PLANS/TODO + plan status; append lessons to `.claude/rules/lessons.md` (#7,#1) | 2 | |
| 19 | doc-simplify | new | — | right-size docs: max-length, merge/split, dedupe (#4,#8) | 2 | |

### skill-* / hook-* (authoring meta)
| # | Name | Action | Source | Reason / pain | Phase | Your call |
|---|------|--------|--------|---------------|-------|-----------|
| 20 | skill-author | copy | superpowers/skills/writing-skills | author/maintain skills (TDD-for-skills, evals) | 2 | |
| 21 | skill-audit | new | — | audit installed skills for drift/staleness (#6) | 2 | |
| 22 | skill-compare | new | — | diff our skills vs forks; curation decisions (#6) | 2 | |
| 23 | hook-author | adapt | cpo/plugins/plugin-dev/skills/hook-development | author hooks (hooks.json schema, matchers, events) | 2 | |

### kwb-* (knowledge base — copy-on-use, trim to <250 lines)
| # | Name | Action | Source | Reason / pain | Phase | Your call |
|---|------|--------|--------|---------------|-------|-----------|
| 24 | kwb-python | adapt (750→<250) | ECC/skills/python-patterns | stack knowledge, copy when a repo needs it | 3 | |
| 25 | kwb-python-testing | adapt (816→<250) | ECC/skills/python-testing | python test patterns | 3 | |
| 26 | kwb-postgres | adapt (147) | ECC/skills/postgres-patterns | db query/schema patterns | 3 | |
| 27 | kwb-api | adapt (523→<250) | ECC/skills/api-design | REST/contract design | 3 | |
| 28 | kwb-docker | adapt (364) | ECC/skills/docker-patterns | container patterns | 3 | |
| 29 | kwb-deploy | adapt (427) | ECC/skills/deployment-patterns | docker-compose / deploy | 3 | |
| 30 | kwb-frontend | adapt (656→<250) | ECC/skills/frontend-patterns | FE conventions | 3 | |
| 31 | kwb-nextjs | copy (57) | ECC/skills/nextjs-turbopack | Next.js specifics | 3 | |
| 32 | kwb-typescript | adapt (550→<250) | ECC/skills/coding-standards | TypeScript baseline | 3 | |

### design-* (UI/schema generation)
| # | Name | Action | Source | Reason / pain | Phase | Your call |
|---|------|--------|--------|---------------|-------|-----------|
| 33 | design-frontend | new | (ref ECC/skills/frontend-patterns) | style/prompt/URL-driven UI generation | 4 | |
| 34 | design-system | new | — | design tokens + mock UI | 4 | |
| 35 | design-database | new | — | dbdiagram format → `docs/DATABASE_DESIGN.md` | 4 | |

### Other / reused
| # | Name | Action | Source | Reason / pain | Phase | Your call |
|---|------|--------|--------|---------------|-------|-----------|
| 36 | dev-parallel | copy | superpowers/skills/dispatching-parallel-agents | dispatch 2+ independent tasks | 4 | |
| 37 | gitnexus-group-setup | new | — | wire multi-repo groups for cross-submodule `group_query`; parent root index excludes submodules (#9) | v0.3.0 | done |
| — | gitnexus-exploring / -debugging / -impact-analysis / -refactoring / -cli / -pr-review | **reuse** | already installed (MCP skills) | **don't re-author** existing GitNexus skills + MCP tools (#6,#9) | — | |

---

## Agents (autonomous units; review agents are user-invoked, run in isolated context)

| # | Name | Action | Source | Reason | Phase | Your call |
|---|------|--------|--------|--------|-------|-----------|
| A1 | review-internal | new | (runs review-code/-security/-performance/-simplify) | **batch internal review → one merged report**; optional, user-invoked at PR time so no per-task 2× cost (#3) | 2 | |
| A2 | review-external | new | (owns acceptance-matrix artifact) | **collect human/user UI/UX feedback**; subsumes human-acceptance-matrix | 4 | |
| A3 | execute | adapt | superpowers/skills/subagent-driven-development (decoupled) | implement one plan task in isolated context; no bundled review | 4 | |
| A4 | test | new | — | run tests for a scoped change; return evidence | 4 | |
| A5 | document-project | new (optional) | — | apply `doc-update-project` / `doc-simplify` to named paths | 4 | |
| A6 | document-agent | new (optional) | — | apply `doc-update-agent` to PLANS/TODO + lessons | 4 | |
| A7 | dev-brainstorm | new (optional) | superpowers/skills/brainstorming | Socratic design session as a subagent (agent form of the `dev-brainstorm` skill) | 4 | |
| A8 | refactor-cleaner | new | (adapt ECC/agents/refactor-cleaner.md) | **cleanup sprint executor** — follows `dev-refactor` phases; jscpd + GitNexus first; mutates in small batches (#3,#8) | post-4 | done |

> `document-project` and `document-agent` are **two separate agents** (no slash) — one per doc class.
> **Cut:** `workflow-manager` — native Task tools (`TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList`,
> persisted in `~/.claude/tasks/`) + plan mode already track phase/tasks across sessions, and the LLM
> reads `WORKFLOW.md` directly.

## Hooks

| # | Name | Action | Source pattern | Behavior / pain | Phase | Your call |
|---|------|--------|----------------|-----------------|-------|-----------|
| H1 | session-start | adapt | superpowers/hooks/session-start | inject `workflow-guide`; run freshness check (platform-aware; Cursor branch) | 1 | done |
| H2 | block-no-verify | copy | ECC/hooks | block `git commit --no-verify` + `core.hooksPath` override (always-on safety; Cursor via `beforeShellExecution`) | 1 | done |
| H3 | gitnexus-freshness | adapt (flynance) | flynance gitnexus_freshness.sh | PreToolUse gate: stale gitnexus read → sync reindex (fail-closed); guardrails `LUNA_GITNEXUS_*` (#9) | 2 | done |
| H3b | gitnexus-post-commit | adapt (flynance) | flynance gitnexus_post_commit.sh | PostToolUse `git commit/merge` → **async** detached reindex; never blocks (#9) | 2 | done |
| H4 | doc-sync-reminder | new (node) | flynance post_tool_use_lints pattern | Stop: src changed but docs untouched → advisory `doc-update-*` suggestion; fail-open (#2) | 2 | done |
| H5 | url-safety-guard | adapt (flynance, node) | flynance web_source_guard.py | PreToolUse WebFetch/Bash: HTTPS-only + allow/deny lists; `LUNA_WEB_GUARD=off` | 2 | done |
| H6 | secret-read-guard | adapt (flynance, node) | flynance secret_guard.sh | PreToolUse Read/Write/Edit/Bash: block `.env`/key/secret access; `LUNA_SECRET_GUARD=off` | 2 | done |
| H7 | lessons-extractor | adapt (flynance) | flynance approach_correction_extractor.sh + _lib | SessionEnd: detached Haiku pass → append lessons.md + native feedback memory; `LUNA_LESSONS_AUTOEXTRACT=off` (#1, **active**) | 2 | done |
| H8 | dedupe-guard | new (node) | jscpd | PreToolUse Bash `git commit`: run jscpd on staged source → advisory clone warning; resolves `node_modules/.bin/jscpd`; fail-open; `LUNA_DEDUPE_GUARD=off` (#3) | post-4 | done |
| H9 | gitnexus-submodule-advisory | new (node) | flynance submodule pattern | PreToolUse Read/Write/Edit: warn when submodule index missing/stale; `LUNA_GITNEXUS_SUBMODULE_ADVISORY=off` | post-4 | done |
| H9b | gitnexus-submodule-sync | new (node) | extends post-commit | PostToolUse commit: async `gitnexus analyze` in submodules when pointer bumped or commit inside submodule | post-4 | done |
| H10 | file-size-guard | new (node) | — | PostToolUse Write/Edit: advisory when `.md` or code file exceeds 300 (warn) / 500 (alert) lines; suggests `doc-simplify` or `dev-refactor`; `LUNA_FILE_SIZE_GUARD=off` (#4,#2) | v0.3.0 | done |

## Rules / scripts / config

| # | Name | Action | Source pattern | Reason / pain | Phase | Your call |
|---|------|--------|----------------|---------------|-------|-----------|
| R1 | rules: core, workflow, docs, git, codebase-awareness, **lessons** | new | ECC/rules/common | always-on guardrails; `lessons.md` carries pain #1 (#1,#5,#9) | 1–2 | |
| R7 | **knowledge-stack** | new | — | 4-layer read order (docs/README.md → GitNexus → source → external); [ref]+File index authoring; archive exclusion; doc + code size signals (#4,#9) | v0.3.0 | done |
| S1 | build-plans-registry.mjs | new | — | `git log --grep '^Plan:'` → `docs/PLANS.md` (#7) | 2 | |
| S2 | detect-modules.mjs | new | — | list submodules carrying their own `CLAUDE.md`/`AGENTS.md` → `doc-init` per-module scaffold targets | post-4 | done |
| C1 | ~~LUNA_HOOK_PROFILE (minimal/standard/strict)~~ | **SUPERSEDED** | ECC/scripts/lib/hook-flags.js | profile gating dropped — each hook ships a granular `LUNA_*` opt-out instead (see C2 + the `AGENTS.md` config table) | — | |
| C2 | LUNA_GITNEXUS_AUTOSYNC / _DEBOUNCE_MIN / _MAX_AUTOSYNC_FILES | new | — | guardrails for auto-reindex (#9) | 2 | |

---

## `doc-init` — the minimum doc set it scaffolds (Comment 4)

For any project, `doc-init` creates (from templates, idempotent — never overwrites existing):

```
AGENTS.md  (+ CLAUDE.md -> AGENTS.md symlink)
docs/README.md            (project doc catalog — from templates/docs/README.md)
docs/SYSTEM_DESIGN.md     docs/PROJECT_STRUCTURES.md
docs/PLANS.md             docs/TODO.md             docs/workflows/WORKFLOW.md
.claude/rules/lessons.md  (don't-repeat lessons; Claude auto-loads .claude/rules/)
```
Created on first use (not pre-scaffolded): `docs/plans/<feature>.md`, `docs/specs/<topic>.md`.
Per-project optional (on demand): `docs/DATABASE_DESIGN.md`, `docs/DESIGN_SYSTEM.md`, `docs/api/`.

**Cross-tool:** also symlinks `.cursor/skills`, writes `.cursor/hooks.json` + `.cursor/rules/*.mdc`
(`luna.mdc` bootstrap + `lessons.mdc` mirror).

## Native Task tools vs our PLANS.md/TODO.md (why both)

Claude Code ships native `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList` (persisted in
`~/.claude/tasks/`, broadcast across sessions). We **use those** for in-session/cross-session task
state — we do **not** reinvent them. `PLANS.md`/`TODO.md` are the **git-tracked, commit-linked,
PR-reviewable** layer on top (native tasks aren't in the repo): `doc-update-agent` distills the
durable registry from native tasks + `git log`'s `Plan:` trailers.

---

## Counts (all built)
- **Skills:** 36 built + 6 GitNexus skills **reused**.
  Phase 1: 12 · Phase 2: 9 · Phase 3: 11 · Phase 4: 4.
- **Agents:** 7 (review-internal; review-external, execute, test, document-project, document-agent,
  dev-brainstorm). **Hooks:** 9 (session-start, block-no-verify, gitnexus-freshness,
  gitnexus-post-commit, doc-sync-reminder, url-safety-guard, secret-read-guard, lessons-extractor,
  dedupe-guard — block-no-verify + session-start from Phase 1). **Rules:** 6 (incl. `lessons`).
  **Scripts:** 2 (`build-plans-registry.mjs`, `detect-modules.mjs`) +
  `scripts/lib/approach-correction.py`. **Cross-tool:** `.cursor/`
  mirrors (`hooks.json`, `rules/*.mdc`, `skills` symlink).
- **Config env vars:** `LUNA_GITNEXUS_AUTOSYNC` / `_DEBOUNCE_MIN` / `_MAX_AUTOSYNC_FILES` ·
  `LUNA_WEB_GUARD` · `LUNA_SECRET_GUARD` · `LUNA_DOC_SYNC_REMINDER` · `LUNA_DEDUPE_GUARD` ·
  `LUNA_LESSONS_AUTOEXTRACT`.

## Explicitly NOT building (kept lean on purpose)
- `subagent-driven-development` as a **mandatory** orchestrator — replaced by optional `execute` agent.
- **Automatic** per-task review chaining — `review-*` skills stay independent for inline use; the
  `review-internal` agent is **optional + user-invoked** (e.g. at PR time), so no forced 2× cost.
- `workflow-manager` agent — native Task tools + plan mode + the LLM reading `WORKFLOW.md` cover it.
- `DECISIONS.md` + `decision-guard` + denylist + `hook-flags.js` — superseded by **native rules** (`.claude/rules/lessons.md` + `.cursor/rules/lessons.mdc`); only `block-no-verify` stays as hard safety.
- The 3 `.mjs` workflow scripts (validate/render/extract) — replaced by markdown-only `WORKFLOW.md`.
- New `gitnexus-*` skills — the installed ones are reused.
- Bulk copy of ECC's 262 skills — only the trimmed, stack-relevant `kwb-*`, copy-on-use.

## Opt-in extras (not in default build; add only when needed)
- **eval-harness** (`kwb-eval`) — add only when building an LLM/agent project that needs eval-driven dev.
- Standalone **human-acceptance-matrix** — not needed; its function lives in the `review-external` agent.

## Code-intelligence tooling — audit (why the stack is GitNexus + jscpd, nothing else)

The 4-layer tool survey (graph / duplicate-detection / architecture / pattern-search) collapsed to
**two** tools. Recorded so it isn't re-litigated:

| Layer | Decision | Rejected (reason) |
|-------|----------|-------------------|
| Graph / find-related | **GitNexus** (kept; `query`=BM25+vector+RRF, `group_query`=cross-module, Leiden communities) | **Graphify / Serena / CodeGraph** — redundant with GitNexus for pure code; Graphify's extra value is multimodal (PDF/image) which we don't need |
| Duplicate detection | **jscpd** (added; 150+ langs, one tool for Python + TS/JS) | **Fallow** (TS/JS-only → would force a 2nd tool for Python modules); **DRYwall** (just a jscpd wrapper) |
| Architecture enforcement | **dropped** | **dependency-cruiser / Fallow** — TS/JS-only, can't cover polyglot repos uniformly; GitNexus `impact`/`group_query` already surface cross-module deps read-only |
| Pattern search | **dropped** | **semgrep / ast-grep** — redundant with GitNexus (find + `gitnexus-refactoring`) and jscpd (clones) for our use cases |

Proactive (GitNexus query before writing) + reactive (jscpd via `review-simplify` + `dedupe-guard`
hook) + strategic (`dev-refactor` / `refactor-cleaner` agent for cleanup sprints) covers
refactoring, new-feature-without-duplication, and cross-module find. Kit pins jscpd in root
`package.json` (`npm run jscpd`); `doc-init` scaffolds `.jscpd.json` from `templates/.jscpd.json`.

---

## 🚦 Sign-off
> Reply with edits (e.g. "rename kwb-deploy→kwb-compose, cut #36"). On approval I start **Phase 1**:
> workflow-guide, workflow-update, doc-init, dev-brainstorm, dev-plan, dev-execute, dev-tdd,
> dev-debug, dev-verify, review-code, review-simplify, dev-commit + hooks H1–H3 + rules R1.
