---
title: vibe-rules dedup + ECC retirement — handoff
scope: project
type: spec
lifecycle: official
status: done
keywords: [vibe-rules, ecc, handoff]
related: []
updated: 2026-06-30
---

# vibe-rules dedup + ECC retirement — handoff

Plugin Phases 0–6 and review follow-ups are complete. User-level ECC retirement executed per
[`~/.claude/plans/please-help-to-review-binary-engelbart.md`](file:///home/l/.claude/plans/please-help-to-review-binary-engelbart.md).

## Status

| Step | Status |
|------|--------|
| Part A — vibe-rules dedup follow-ups | Done (skill labels, rule count, lessons guard) |
| 7A `~/.claude/CLAUDE.md` bootstrap | Done |
| 7B `~/.cursor/rules/luna-bootstrap.mdc` | Done |
| 7B Cursor Settings → User Rules | **You:** paste `~/.cursor/luna-user-rules-paste.txt` if not done |
| 8 flynance `WORKFLOW.md` overlay | Done |
| Part B — ECC retirement (Cursor B1) | Done (see below) |
| Part B — `skills-cursor/` | **Kept** — Cursor-native automation skills, not ECC |
| Part B — `mcp-configs/`, `scripts/` | **Kept** — inspected; not deleted blindly |

## Part A — dedup follow-ups (repo)

1. `skills/vibe-rules/SKILL.md` — failure modes + non-negotiables labeled as summaries; canonical `VIBE_RULES.md`.
2. `AGENTS.md` / `TOOLS_LIST.md` — **8** `.claude/rules/*.md` files (+ `luna.mdc` via `doc-init`).
3. `lessons.md` — guard against re-pasting generic rulebook into always-on rules.

## Part B — ECC retirement (user level)

After Luna is the global kit, **everything-claude-code** global footprint was removed from Cursor:

- `~/.cursor/rules/` — only `luna-bootstrap.mdc` remains
- `~/.cursor/skills/` — only `gitnexus-*` (7 dirs) remains
- Removed: `~/.cursor/AGENTS.md`, ECC hooks, `ecc-install-state.json`, `.claude-plugin/`

**Preserved:** `~/.cursor/skills-cursor/` (Cursor IDE skills), `~/.cursor/mcp-configs/`,
`~/.cursor/projects/`, `~/.cursor/plans/`, `mcp.json`, GitNexus MCP config.

Claude: ECC already disabled in `enabledPlugins`; optional full unregister via `/plugin` UI.

## Verification

```bash
ls ~/.cursor/rules/                    # → luna-bootstrap.mdc only
ls -d ~/.cursor/skills/gitnexus-* | wc -l   # → 7
ls ~/.cursor/skills | wc -l            # → 7
```

- New Cursor session in luna project: `luna-bootstrap.mdc` + per-project `.cursor/rules/*.mdc`; no ECC rules.
- New Claude session: slim `~/.claude/CLAUDE.md`; Luna plugin + gitnexus skills.

## File index

| Path | Role |
|------|------|
| [docs/SYSTEM_DESIGN.md](../SYSTEM_DESIGN.md) | Layer model + ECC retirement note |
| [docs/VIBE_RULES.md](../VIBE_RULES.md) | Generic rules (on demand) |
| `~/.cursor/luna-user-rules-paste.txt` | Paste into Cursor User Rules UI |
