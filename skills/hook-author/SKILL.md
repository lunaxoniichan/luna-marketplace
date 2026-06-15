---
name: hook-author
description: Use when creating or editing a Claude Code / Cursor hook — wire hooks.json events, matchers, and scripts with the kit's fail-open and cross-tool conventions
---

# Hook author

Author event-driven hooks for the kit. Adapted from cpo `hook-development`, constrained to Luna's
conventions (dispatch wrapper, fail-open, Claude+Cursor mirror). Hooks **remind/block — they never
orchestrate** skills.

## Events (most-used)

| Event | When | Use for |
|-------|------|---------|
| PreToolUse | before a tool | validate/deny (security guards) — keep <200ms, no network |
| PostToolUse | after a tool | react/log (e.g. post-commit reindex) |
| Stop | agent about to stop | advisory completeness checks (e.g. doc-sync) |
| SessionStart | session begins | inject context (workflow-guide) |
| SessionEnd | session ends | detached background work (lessons extraction) |

## Luna conventions (do not deviate)

1. **Dispatch:** shell hooks run via `hooks/run-hook.cmd <name>` (cross-platform polyglot); node hooks
   run `node scripts/hooks/<name>.js` and export a testable `run(rawInput)`.
2. **Plugin format:** `hooks/hooks.json` uses the `{ "hooks": { Event: [ { matcher, hooks:[…] } ] } }`
   wrapper. Use `${CLAUDE_PLUGIN_ROOT}` for all paths.
3. **Fail-open** — every non-security hook must `exit 0` on any error/parse failure; a broken hook must
   never block work. **Security guards** (block-no-verify, secret/url) may fail-closed (`exit 2`).
4. **Read stdin** as JSON (`tool_input.command`, `tool_name`, …); tolerate non-JSON.
5. **Cross-tool mirror:** every hook also gets a `.cursor/hooks.json` entry
   (`beforeShellExecution`/`sessionStart`/etc.) pointing at the same script.
6. **Guardrails:** long/expensive work runs **detached/async**; honor opt-out env vars
   (`LUNA_*`); debounce; size-cap.

## Process

1. Pick event + matcher; decide command vs (rarely) prompt hook.
2. Write the script (bash in `hooks/`, or node in `scripts/hooks/`); keep <200 lines, helpers aside.
3. Register in `hooks/hooks.json` **and** `.cursor/hooks.json`.
4. Add a `tests/hooks/hooks.test.js` case (node hooks export `run()`); test directly with piped JSON.
5. Note: hooks load at session start — restart to test live (`claude --debug`, `/hooks`).

## Do not

- Make a hook chain or invoke skills. - Block on a non-security hook. - Hardcode paths or log secrets.
- Forget the Cursor mirror.
