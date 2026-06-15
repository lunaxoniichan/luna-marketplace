# Lessons — do not repeat

Standing rules captured from corrections. When the user rejects or corrects an approach, append **one
line**: what to avoid · what to do instead · (date). This file is **auto-loaded by Claude Code**
(everything in `.claude/rules/` loads with the same priority as `CLAUDE.md`), so a lesson here is
always in context. Cursor mirror: `.cursor/rules/lessons.mdc` (keep them in sync).

Format: `- AVOID <thing> — DO <alternative> (YYYY-MM-DD)`

- AVOID putting a `Plan:` trailer on the `build-plans-registry.mjs` rebuild commit — DO commit the regenerated `docs/PLANS.md` with no trailer; it's auto-derived bookkeeping, and trailing it re-invalidates the registry (the new commit changes the plan's last-commit) (2026-06-15)
