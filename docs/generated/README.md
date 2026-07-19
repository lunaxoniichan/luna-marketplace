# Generated indexes

| File | Tracked? | Notes |
|------|----------|-------|
| `plugin-graph.json` | yes | Repo-deterministic; Studio can read without a build |
| `docs-index.json` | yes | Repo-deterministic |
| `knowledge.json` | **no** (gitignored) | Machine-specific (registry aggregation). Rebuild: `npm run build:knowledge` or Studio start |
| `graph-memory/index.json` | **no** (gitignored) | Per-vault rebuildable context index. Rebuild: `node scripts/graph-memory.mjs rebuild --vault <id>` or Studio Graph memory tab |

Regenerate all: `npm run build:indexes`
