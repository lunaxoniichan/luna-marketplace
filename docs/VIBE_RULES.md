# Vibe coding — generic engineering rules

Project-agnostic rules for AI-assisted development. **Canonical source** for Luna Agent Kit;
load on demand via the **`vibe-rules`** skill or this file. Project-specific rules belong in the
repo's `RULES.md` (if present), not here.

**Architecture layers** (provider → user bootstrap → plugin → project): [`docs/SYSTEM_DESIGN.md`](SYSTEM_DESIGN.md) §2–§4.

**Procedures:** invoke **`workflow-guide`** at session start; use phase skills from
`docs/workflows/WORKFLOW.md`. Instruction priority: user chat → project rules → plugin skills → default.

**Related:** [`docs/workflows/WORKFLOW.md`](workflows/WORKFLOW.md) · skills `dev-*`, `review-*`, `doc-*`

---

## 0. Accuracy over speed

**Correctness is the primary objective. Speed is not.**

Vibe coding is **directed engineering**: the agent generates; the human (and harness) verify. Unconstrained
AI coding degrades codebases over iterations — verbosity, duplicate logic, structural erosion — even when
tests still pass.

### The loop (every non-trivial task)

| Step | What to do | Luna skills |
|------|------------|-------------|
| **Research** | Search repo (GitNexus), library docs, registries, proven OSS. Prefer adapting what exists. | `dev-research`, `gitnexus-exploring` |
| **Plan** | Surface assumptions, risks, touch-set. Non-trivial work needs approved plan or spec. | `dev-plan`, `dev-brainstorm` |
| **Review** | Read existing code; avoid duplicate or contradictory logic. Impact analysis before edits. | `dev-audit`, `gitnexus-impact-analysis` |
| **Implement** | Small bounded diffs; clear naming; match local conventions. | `dev-execute` |
| **Verify** | Tests, linters, builds; check real behavior — not just exit codes. | `dev-verify`, `dev-tdd` |
| **Record** | Update docs for design changes; append lessons when corrected. | `doc-update-project`, `.claude/rules/lessons.md` |

Use workflow **variants** (`trivial`, `fix`, `spike`) to skip ceremony on small work — not an excuse to skip verification.

### Time budget

- If unsure, **ask a specific clarifying question** rather than guessing forward.
- Accept more thinking budget, tool calls, or time when accuracy is at stake. **Do not self-truncate** to appear fast.
- Prefer quality, simplicity, robustness, scalability, and maintainability over short-term implementation cost.

### AI failure modes

Repo invariants live in **docs, schemas, tests, and lessons** — not in model weights. Treat the agent as a fast generator, not a verifier.

| Failure mode | Symptom | Countermeasure |
|--------------|---------|----------------|
| **Hallucination** | APIs, packages, config keys that do not exist | Build/typecheck; confirm against lockfiles and source |
| **Completion bias** | Rushing to "done"; fake tests; success without evidence | `dev-verify` iron law: evidence before any completion claim |
| **Code slop** | Redundant abstractions, copy-paste drift, dead code | "If I delete this line, what breaks?" — prefer `review-simplify` |
| **False verification** | Tests pass but assert nothing | Break the test deliberately; verify at user/system boundaries |
| **Parallel implementations** | New module when one exists | GitNexus search + extend existing symbols |
| **Stale context** | Edits from outdated file state | Read-before-write; GitNexus freshness gate |
| **Architecture drift** | Generic patterns ignore local design | Read `SYSTEM_DESIGN.md`, `AGENTS.md`, schemas first |

**Generator ≠ verifier.** Use `review-code`, `review-security`, and deterministic checks before commit or PR.

**Green is necessary, not sufficient.** For auth, migrations, money, or external I/O, verify actual outcomes — not just exit code zero.

### Knowledge stack

| Layer | Source | Use for |
|-------|--------|---------|
| L1 Routing | `AGENTS.md` → `docs/README.md` → task doc | What to read, what owns what |
| L2 Structure | GitNexus (`query`, `context`, `impact`) | Callers, callees, blast radius |
| L3 Invariants | `.claude/rules/lessons.md`, schemas, fidelity tests | Must-not-break rules |
| L4 External | Library docs / Context7 | Third-party API semantics |

One question → one canonical layer. Do not duplicate call graphs in markdown when GitNexus or source owns them.

---

## 1. Core principles

- **Clarify requirements** when not 100% sure — ask with structured choices; push back on harmful requests.
- **Fail fast, fail loudly** — no silent defaults or fallbacks; explicit errors and logs.
- **No fallback policy** — no backward-compat branches, silent defaults, or unnecessary default parameters. Understand end-to-end logic before adding defaults.
- **Root cause first** — fix causes, not symptoms; no hardcoded workarounds.
- **Simplicity over cleverness** — avoid unnecessary abstractions and speculative edge handling.
- **Reuse before invent** — read existing structure, design, and code before new modules or helpers.
- **Minimal scope** — smallest correct diff; don't touch unrelated code.

After design or structure changes, update the owning project docs (`doc-update-project`).

---

## 2. Implementation

### Before you start

Read first — follow §0 Research + Review; GitNexus impact before editing symbols.

### While implementing

- **No hardcoding** — configuration and environment variables only.
- **Avoid redundancy** — reuse shared utilities, typed schemas, service interfaces.
- **Observability** — structured logging; metrics for cache, API costs, error rates where relevant.
- **Performance** — cache-first reads; pagination; debounce and rate limiting where applicable.
- **Security** — least privilege; centralized secrets; input validation at every boundary.
- **Never read or write `.env` or secrets files** — env var *names* only; never log secrets.

---

## 3. Documentation

- **Function-level references only** — refer to names (function, class, parameter); do not copy behavior into docs.
- **Docs must survive refactors** — valid when implementation details change.
- **Mandatory updates** — logic or design changes update `docs/` (project docs vs agent docs: see `docs.md` rule).

Specs from brainstorming: **`docs/specs/`** — never `docs/superpowers/`.

---

## 4. Testing (MVP + vibe coding)

- Focus on **critical paths**: auth, core data, transactions, external I/O, schema contracts.
- Avoid over-testing non-critical flows during MVP — **never ship fake tests**.
- **Procedures:** **`dev-tdd`** (RED-GREEN-REFACTOR), **`dev-verify`** (evidence before "done").

---

## 5. Fixing (bugs & incidents)

- **No patching by hardcoding** — no constants, overrides, or special-case logic.
- **No multiple versions** — remove fallback paths and legacy logic; one canonical path.
- **RCA first, code second** — read docs and code; diagnose before writing a fix.
- **Single correct solution** — one clean fix; remove obsolete logic entirely.
- **Procedures:** **`dev-debug`** (systematic root-cause investigation before any fix).

---

## 6. Agent fences

- **No commit unless the user explicitly asks.**
- **Conventional commits:** `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `perf:`, `ci:` — focus on *why*; never add agent `Co-authored-by` trailers.
- **Lessons on correction** — append one line to project `.claude/rules/lessons.md` (mirror `.cursor/rules/lessons.mdc`). Never write `~/.claude/CLAUDE.md`.
- **Non-standard config** — custom SSH aliases, unusual URLs: ask before changing; assume intentional.
- **External APIs** — verify current availability and signup before recommending integrations.
- **Choices** — present structured options with **(Recommended)** on the suggested path.

---

## 7. GitNexus

Use GitNexus MCP tools for structure, impact, and navigation. Repo URIs:
`gitnexus://repo/{name}/{context,clusters,processes,process/{name}}`.

> If tools warn the index is stale, run `npx gitnexus analyze` first.

### Always do

- Run **`gitnexus_impact`** before editing a function, class, or method; report blast radius.
- Run **`gitnexus_detect_changes()`** before commit.
- Warn on **HIGH** or **CRITICAL** impact before proceeding.
- Prefer **`gitnexus_query`** over blind grepping for architecture questions.
- Use **`gitnexus_context`** for full symbol context.

### Never do

- Edit symbols without impact analysis first.
- Ignore HIGH/CRITICAL warnings.
- Rename with find-and-replace — use **`gitnexus_rename`**.
- Commit without **`gitnexus_detect_changes()`**.

### Skills

| Task | Skill |
|------|-------|
| Architecture / "How does X work?" | `gitnexus-exploring` |
| Blast radius | `gitnexus-impact-analysis` |
| Debug failures | `gitnexus-debugging` |
| Refactor / rename | `gitnexus-refactoring` |
| Tools reference | `gitnexus-guide`, `gitnexus-cli` |

Submodule repos: index each separately; use `group_query` for cross-module search (`codebase-awareness` rule).

**Deep procedures:** **`gitnexus-impact-analysis`**, **`gitnexus-exploring`**, **`gitnexus-debugging`**, **`gitnexus-refactoring`**, **`gitnexus-guide`**, **`gitnexus-cli`**.

---

## 8. Summary

> **Accuracy over speed.** If the system is wrong, **break loudly**.
> If the design is unclear, **stop and understand**.
> If the logic fails, **fix the root cause**.
> Never hide problems with fallbacks.
> Never claim done without fresh verification evidence.
