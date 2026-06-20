---
name: gitnexus-group-setup
description: Use when a project has git submodules with independent GitNexus indexes — wire them into a group so group_query and group_contracts search across all repos in one call
---

# GitNexus group setup

Wire multiple independently-indexed repos (git submodules or sibling repos) into a **GitNexus group**
so that a single `group_query` finds symbols across all of them. Addresses the root-index gap: the
parent repo's index does **not** include submodule code — without this, agents searching for
cross-module implementations will miss results and re-create what already exists.

> **When this matters:** The root `.gitnexus/` index covers only the parent repo's own files. Each
> submodule with its own `.gitnexus/` is separately indexed but siloed. `group_query` bridges them.

## Triggers

- Git submodules each have their own `.gitnexus/` index (check: `find . -name meta.json -path "*/.gitnexus/*" -maxdepth 4`)
- Agent reports "I can't find X" but X likely lives in a sibling submodule
- Cross-repo impact analysis needed before a contract change
- `group_query` / `group_contracts` return "No groups configured"

## Pre-flight

1. Verify each repo is indexed: `npx gitnexus status` in each submodule root. If stale → `npx gitnexus analyze` first.
2. Verify group CLI available: `npx gitnexus group --help` (should show `create`, `add`, `sync`, `query`, `contracts`).
3. Check for existing group: `npx gitnexus group list` — skip create if group already exists.

## Process

### Step 1 — Create the group

```bash
npx gitnexus group create <groupname>
# Creates ~/.gitnexus/groups/<groupname>/group.yaml
```

Choose `<groupname>` = short project identifier (e.g. `flynance`, `myapp`). It is global to your
machine (`~/.gitnexus/`), not project-local.

### Step 2 — Add repos to the group

For each repo (parent + each submodule with its own `.gitnexus/`):

```bash
npx gitnexus group add <groupname> <path-to-repo-root> <registry-name>
```

The `<registry-name>` must match the name in `~/.gitnexus/registry.json`
(run `npx gitnexus list` to see registered names).

Example for flynance-main with three repos:
```bash
npx gitnexus group add flynance /path/to/flynance-main        flynance-main
npx gitnexus group add flynance /path/to/flynance-main/data-pipeline  data-pipeline
npx gitnexus group add flynance /path/to/flynance-main/flynance-live  flynance-live
```

### Step 3 — Sync the group

```bash
npx gitnexus group sync <groupname>
# Extracts shared contracts, builds cross-repo links
```

Re-run `group sync` after any `npx gitnexus analyze` in a member repo (the submodule-sync hook
handles this automatically post-commit when `LUNA_GITNEXUS_SUBMODULE_ADVISORY=on`).

### Step 4 — Document in AGENTS.md

Add a `## GitNexus group` section (or extend the existing `## GitNexus` section):

```markdown
## GitNexus group

Group name: `<groupname>`
Members:
| Alias | Registry name | Path |
|-------|---------------|------|
| root | flynance-main | . |
| pipeline | data-pipeline | data-pipeline/ |
| live | flynance-live | flynance-live/ |

Cross-repo query: `group_query({name: "<groupname>", query: "concept"})`
Shared contracts: `group_contracts({name: "<groupname>"})`
```

### Step 5 — Add to `docs/README.md` catalog (if present)

Add one catalog row for cross-repo contracts:

```
| GitNexus group | Cross-repo symbol search and contract registry | Cross-module impact or duplication | group_query, group_contracts, group_sync |
```

## Query patterns (use after setup)

```js
// Search across ALL repos in the group:
group_query({name: "flynance", query: "market data fetch"})

// Inspect shared contracts / interfaces:
group_contracts({name: "flynance"})

// Check staleness of each member:
// npx gitnexus group status flynance
```

After setup, prefer `group_query` over per-repo `gitnexus_query` whenever the question spans
modules. Fall back to per-repo `query` / `context` for symbol-level drill-down.

## group.yaml reference

```yaml
version: 1
name: <groupname>
description: ""
repos:
  root: <registry-name-for-parent>
  pipeline: <registry-name-for-submodule>
  live: <registry-name-for-another-submodule>
detect:
  http: true
  grpc: true
  topics: true
  shared_libs: true
links: []
packages: {}
```

## Do not

- Re-explain per-repo `gitnexus_query` / `gitnexus_context` — those are covered by `gitnexus-exploring`.
- Re-explain impact analysis — covered by `gitnexus-impact-analysis`.
- Create a group for a single-repo project (no benefit; root index already covers everything).
- Run `group sync` before all member repos have fresh indexes (`npx gitnexus analyze` in each first).
