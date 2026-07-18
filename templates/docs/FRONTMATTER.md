# Unified document front-matter

Every durable markdown knowledge file (docs, memory, lessons extracts, ADRs, component notes)
SHOULD carry this YAML front-matter. Path still matters for lifecycle buckets; the tag is the
greppable source of truth for tooling (Studio generators, promote/demote).

```yaml
---
title: …
scope: user | project | session
type: spec | plan | architecture | reference | decision | memory | component
lifecycle: pre_official | official | post_official
status: draft | active | done | superseded | deprecated
keywords: [terms]
related: [[slug]]
supersedes: <path>          # optional
superseded_by: <path>       # optional
updated: YYYY-MM-DD
---
```

## Lifecycle ↔ folders

| lifecycle | Default folders |
|-----------|-----------------|
| `pre_official` | `docs/pre-official/research/`, `docs/pre-official/audits/` |
| `official` | `docs/specs/`, `docs/plans/`, architecture docs, `docs/decisions/` |
| `post_official` | `docs/post-official/completed-plans/`, `docs/post-official/legacy/` |

## Generators

| Script | Output |
|--------|--------|
| `scripts/build-plugin-graph.mjs` | `docs/generated/plugin-graph.json`, `docs/PLUGIN_MAP.md` |
| `scripts/build-docs-index.mjs` | `docs/generated/docs-index.json`, `docs/README.md` catalog markers, `llms.txt` |
| `scripts/build-knowledge.mjs` | `docs/generated/knowledge.json` (registry-wide) |
| `scripts/register-project.mjs` | `~/.claude/luna/registry.json` entry |
| `scripts/sync-agent-views.mjs` | Canonical `rules/` + `memory/` → Claude/Cursor views (see contract spec) |
