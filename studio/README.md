# Luna Studio

Read-only control plane for Luna Agent Kit knowledge (Phase 1).

Markdown + git remain source of truth. Studio reads Phase-0 JSON indexes +
`~/.claude/luna/registry.json`.

## Execution model: **host-first**

**Primary:** run on the host so registry paths resolve:

```bash
# from repo root
npm run studio              # next dev :3900 (no fixtures by default)
LUNA_STUDIO_FIXTURES=1 npm run studio   # include studio/fixtures for demos/tests
```

Registry entries store **host-absolute** paths. Studio opens those paths directly —
required for multi-project health/indexes and for Phase 2 writes.

**Docker:** removed from the supported product path (see
`docs/decisions/2026-07-18-studio-host-first.md`). A compose stub may remain for
plugin-only experiments; do not rely on it for multi-project or Phase 2 writes.

## Project map edges

| Edge | Meaning |
|------|---------|
| `kit` | Plugin → registered/fixture project (hierarchy, not a discovered relation) |
| `submodule:<name>` | Shared `.gitmodules` **remote URL** (same actual repo, normalized) |

**Not** emitted: agent co-occurrence (`claude`/`cursor`), or shared child-dir names
(`frontend/`, `api/` with `AGENTS.md`) — those are coincidental, not relations.

Parallel kit + submodule between the same pair are **merged** for display (`kit · submodule:X`).

## Env

| Var | Default | Meaning |
|-----|---------|---------|
| `LUNA_PLUGIN_ROOT` | parent of `studio/` | Plugin repo path |
| `LUNA_REGISTRY_DIR` | `~/.claude/luna` | Project registry |
| `LUNA_STUDIO_FIXTURES` | off | Include `studio/fixtures/*` (tests/demos only) |
| `LUNA_STUDIO_ROOT` | `studio/` cwd | Override fixtures root |

## Scripts

```bash
npm run studio              # host-first UI
npm run studio:build        # production build
npm run test:studio         # loaders + edge semantics (fixtures on)
npm --prefix studio run typecheck
```
