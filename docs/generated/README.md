# Generated indexes

| File | Tracked? | Notes |
|------|----------|-------|
| `plugin-graph.json` | yes | Repo-deterministic; Studio can read without a build |
| `docs-index.json` | yes | Repo-deterministic |
| `knowledge.json` | **no** (gitignored) | Machine-specific (registry aggregation). Rebuild: `npm run build:knowledge` or Studio start |

Regenerate all: `npm run build:indexes`
