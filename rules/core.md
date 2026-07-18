# Core

1. **User wins** — explicit user instructions override rules, skills, and docs.
2. **Fail loud** — no silent fallbacks; generic policy: **`vibe-rules`** skill · `docs/VIBE_RULES.md`.
3. **Root cause first** — fix causes, not symptoms. No hardcoded workarounds.
4. **Minimal scope** — smallest correct diff; don't touch unrelated code.
5. **Memory on rejection** — when the user rejects or corrects an approach, append a one-line rule to `.claude/rules/lessons.md` (and mirror to `.cursor/rules/lessons.mdc` if present) so it isn't repeated; optionally save a project-scoped `feedback` memory. **Never write user-level files** (`~/.claude/CLAUDE.md`, `~/.claude/settings.json`, etc.) — the kit only touches the repo's `.claude/` and `.cursor/` trees.
6. **Hooks fail-open** — except security guards and the `gitnexus-freshness` staleness gate (which returns `ask` rather than serve a stale graph); a broken hook must not block work.
