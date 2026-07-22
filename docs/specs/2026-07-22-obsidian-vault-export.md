---
title: Obsidian vault export — design note
scope: project
type: spec
lifecycle: official
status: active
keywords: [obsidian, export, wikilinks, vault, view]
related:
  - docs/plans/2026-07-18-luna-studio.md
  - docs/specs/2026-07-18-sync-agent-views-contract.md
updated: 2026-07-22
---

# Obsidian vault export — design note

> **Status:** ACTIVE. The v1 read-only exporter now ships — `scripts/lib/obsidian-export.mjs`
> + CLI `scripts/obsidian-export.mjs` (`node scripts/obsidian-export.mjs --vault <id>`), writing a
> gitignored projection under `{vault}/.obsidian-export/`. Symlink-vs-copy / external-location
> options below remain open for a future iteration.

## Why

The canonical knowledge (`docs/`, `rules/`, `memory/`, protected lessons) is already plain
markdown with `[[wikilinks]]` and YAML front-matter — the same primitives Obsidian uses. An
Obsidian **view** of a vault gives graph browsing, backlinks, and search over the same files a
coding agent reads, with zero new source of truth.

## Load-bearing decision: export is a READ-ONLY VIEW

Obsidian is a **downstream view**, never an upstream writer. Editing in Obsidian must not become
a second authoring path that competes with vault CRUD / lifecycle / sync — that would reintroduce
the two-writer problem the kit exists to avoid.

- **v1 (if built): read-only projection.** The exporter produces an Obsidian-openable folder that
  points at (or copies) canonical markdown. Round-tripping edits back into the repo is out of scope.
- Canonical markdown + git stay authoritative; the Obsidian vault is a rebuildable projection like
  every other generated index.

## What already aligns (no work needed)

| Obsidian expects | Luna already has |
|------------------|------------------|
| `[[wikilinks]]` | `extractWikilinks` + `listWikilinkTargets` over canonical `.md` |
| YAML front-matter (properties) | unified front-matter (`templates/docs/FRONTMATTER.md`) |
| Folder-based notes | `docs/`, `rules/`, `memory/` trees |
| Backlinks / graph | derivable from wikilinks + `related` |

## What an exporter would do (deferred implementation)

1. **Select the canonical corpus** — reuse `isExcludedKnowledgePath` (`scripts/lib/util.mjs`) so
   generated `.claude`/`.cursor` mirrors, `docs/generated/`, and archives are excluded; keep
   protected `lessons.md`. Same corpus rule as dedupe / graph-memory.
2. **Materialize a projection** — either symlink canonical files into an `*.obsidian`-style folder
   or copy them; write an `.obsidian/` config (graph + property settings). Gitignored, rebuildable.
3. **Resolve links** — leave `[[wikilinks]]` intact (Obsidian resolves by basename); optionally emit
   an alias map for slugs that differ from filenames.
4. **Never write back** — no watcher, no import; a re-export fully rebuilds the projection.

## Scope / non-goals

| In (if/when built) | Out |
|--------------------|-----|
| Read-only Obsidian projection of one vault | Bi-directional sync / editing back into the repo |
| Reuse of the canonical corpus filter | A second corpus definition |
| Gitignored, rebuildable output | Committing the Obsidian vault as source of truth |
| Per-vault export (respects the wall) | Cross-vault merge into one Obsidian vault (leaks boundaries) |

## Open questions (decide before implementation)

- Symlink vs copy? Symlinks are live but fragile across OSes / Obsidian sync; copy is portable but
  needs re-export on change.
- Where does the projection live — inside the vault (`.obsidian-export/`, gitignored) or an external
  path from the registry?
- Is registry-wide export ever wanted, and if so how are per-vault boundaries preserved in one graph?

## File index

| Ref | Path |
|-----|------|
| Corpus filter | `scripts/lib/util.mjs` (`isExcludedKnowledgePath`) |
| Wikilink targets | `scripts/lib/vault-crud.mjs` (`listWikilinkTargets`) |
| Front-matter schema | `templates/docs/FRONTMATTER.md` |
| Sync / two-writer invariant | `docs/specs/2026-07-18-sync-agent-views-contract.md` |
