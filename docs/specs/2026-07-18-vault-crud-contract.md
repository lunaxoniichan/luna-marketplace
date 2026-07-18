---
title: Studio vault CRUD — mutation / safety contract
scope: project
type: spec
lifecycle: official
status: active
keywords: [studio, crud, vault, git, path-confinement, authorization]
related: [docs/specs/2026-07-18-sync-agent-views-contract.md]
updated: 2026-07-18
---

# Contract — Studio vault CRUD write-path

> **Status:** ACTIVE (amended — `resolveVaultRoot` outer wall, merge rollback, confirmSha, docs-index refresh).
> Depends on: `docs/specs/2026-07-18-sync-agent-views-contract.md` (active).

## 1. Purpose

Studio edits the **canonical markdown vault** only. Generated agent views are never
written by CRUD — they are refreshed exclusively via `syncAgentViews()` (dry-run →
diff preview → apply), keeping the Task 1 no-clobber/manifest discipline authoritative.

## 2. Two memory kinds (must stay legible)

| Kind | Location | Editable in Studio? | Effect |
|------|----------|---------------------|--------|
| **Canonical memory** | `<project>/memory/*.md` | Yes | Feeds MCP (`mcp-memory-feed.json`) + Studio knowledge browser. Does **not** change Claude's native session store. |
| **Native session memory** | `~/.claude/projects/<slug>/memory/*` | No (read-only / link out) | Agent-owned. Untouched by CRUD and by sync v1. |

UI must label both. Editing canonical memory must not imply "Claude will see this in MEMORY.md."

## 3. Authorization (outer wall) + writable zones (inner wall)

### 3.1 `resolveVaultRoot` — sole entry point

A vault root is authorized **only** if, after `realpath`, it equals:

- the plugin/repo root (`opts.pluginRoot` or `LUNA_PLUGIN_ROOT`), or
- a **live** path listed in `~/.claude/luna/registry.json` (entry must exist on disk).

`resolveVaultRoot(pathOrId, { registry?, pluginRoot? })` returns a handle branded with a
**module-private** `Symbol` and registered in a **module-private `WeakSet`** (not `Symbol.for` —
global registry would allow in-process forgery). Mutators accept only WeakSet-issued handles
or resolve via `vaultId` / `pathOrId` server-side.

Mutators accept **`vault`** (that handle) or **`vaultId` / `pathOrId`** (resolved internally).
**Raw `vaultRoot` strings and forged `{ root }` objects without the stamp are rejected**
(`VAULT_UNAUTHORIZED`). Path confinement alone is not enough behind Server Actions.

### 3.2 Writable prefixes (inner wall)

Allowed relative prefixes **inside** an authorized vault root (posix, no `..`):

| Prefix | Typical types |
|--------|----------------|
| `rules/` | rule bodies (plain md) |
| `memory/` | `type: memory` |
| `docs/decisions/` | `type: decision` |
| `docs/specs/` | `type: spec` |
| `docs/plans/` | `type: plan` |
| `docs/pre-official/` | concept docs |
| `docs/post-official/` | archive |

**Forbidden** (always reject from caller paths):

- `.claude/**`, `.cursor/**` (generated / tool trees)
- `docs/generated/**` as a caller write target
- `lessons.md`, `RULES.md`, `*.local.md`, `luna.mdc` (and `.mdc` twins)
- Symlink escape outside vault root

**Exception:** docs mutations may **refresh** index artifacts (`docs/generated/docs-index.json`,
`docs/README.md`, `llms.txt`) via `writeDocsIndex` and include them in the same commit.
That is maintenance, not a caller writing into generated trees.

v1 does **not** widen to root architecture docs (`SYSTEM_DESIGN.md`, etc.).

## 4. Front-matter validation (before write)

Required keys for create/update of knowledge docs (`memory/`, `docs/**`):

| Key | Allowed values |
|-----|----------------|
| `title` | non-empty string |
| `scope` | `user` \| `project` \| `session` |
| `type` | `spec` \| `plan` \| `architecture` \| `reference` \| `decision` \| `memory` \| `component` |
| `lifecycle` | `pre_official` \| `official` \| `post_official` |
| `status` | `draft` \| `active` \| `done` \| `superseded` \| `deprecated` |

`updated` is **server-stamped** (`YYYY-MM-DD`) on every knowledge write — callers cannot
persist a stale date.

`rules/*.md`: front-matter optional in v1. If present, known enum keys are validated;
**unknown keys are allowed** (v1 — rejecting them is brittle/low-value).

Reject unknown **enum values** with a structured error (field + got + allowed). Serialize
only via `serializeFrontmatter`.

## 5. Operations

### create
- Path must not exist; parent must be an allowed prefix.
- Body + validated front-matter written atomically (temp + rename).
- Docs writes: refresh docs-index artifacts, then one commit including them.
- On commit failure: new file unlinked (rolled back).

### update
- Path must exist and be allowed.
- Snapshot previous bytes; restore on commit or index failure.

### delete
- Requires **`confirmPath === relPath`** (typo guard) **and** **`confirmSha === sha256(current bytes)`**
  (proves the caller hashed current content — not merely echoed the name). Human preview is UI;
  the lib guarantee is content identity.
- If front-matter `status: active`, result includes `warnings: ['deleting active doc']`
  (UI should hard-confirm; delete still proceeds when confirms match).
- On commit failure: file restored.

### merge (memory/docs only, v1)
- `sources`, `confirmSources` (match), `confirmShas: { path → sha256 }`, `target`, body + FM.
- Snapshots sources (+ prior target if any); on commit or index failure, **full rollback**
  (restore sources, restore or remove target). Symmetric with create.

## 6. Git commit semantics

Every successful mutation ends in **exactly one** git commit on the vault root repo:

| Op | Message pattern |
|----|-----------------|
| create | `docs(vault): create <relpath>` |
| update | `docs(vault): update <relpath>` |
| delete | `docs(vault): delete <relpath>` |
| merge | `docs(vault): merge <sources> → <target>` |

Rules:

- Stage **only** the paths touched by this mutation (canonical + any docs-index artifacts).
- Commit-message file lives in `os.tmpdir()` (not inside the repo).
- Fail loud if not a git repo or if commit fails.
- No `--no-verify`, no amend, no push.
- Optional Plan trailer (caller-supplied).
- Author = ambient git identity (no agent co-author trailers).

## 7. Sync discipline (after canonical write)

CRUD **never** writes `.claude` / `.cursor` agent views.

After a successful commit that touched `rules/**` or `memory/**`:

1. Attach `syncDryRun` via `syncAgentViews(root, { dryRun: true })`.
2. UI "Regenerate agent views" shows the dry-run; on approve, `applyAgentViewSync({ vault })`.
3. Sync conflicts → surface; do not auto-clobber.

## 8. Docs-index refresh (docs writes)

Any successful mutation whose primary paths include `docs/**` runs `writeDocsIndex(root)`
**before** the commit and stages the artifacts in that same commit. Wikilink autocomplete
(`listWikilinkTargets`) and Studio catalog stay current — no known drift.

## 9. Library surface

```
scripts/lib/vault-crud.mjs
  resolveVaultRoot(pathOrId, { registry?, pluginRoot? }) → authorized vault
  requireAuthorizedVault(opts)
  assertAllowedPath(vaultRoot, relPath) → { root, relPath, absPath }
  validateFrontmatter(data, { requireFm })
  createFile / updateFile / deleteFile / mergeFiles  // vault | vaultId — never raw vaultRoot
  listWikilinkTargets(vault)
  applyAgentViewSync({ vault })
  fileContentSha / sha256

Each mutator returns:
  { ok, absPath?, relPath?, commitSha?, syncDryRun?, warnings?, indexRefreshed?, error?, note? }
```

CLI harness: `node scripts/vault-crud.mjs … --vault-id <id>|--path-or-id <path> [--plugin-root …]`

## 10. Acceptance (Task 2 write-path gate)

`npm run test:vault-crud`

- [x] Non-registered / non-plugin root → `VAULT_UNAUTHORIZED`
- [x] Raw `vaultRoot` / forged vault handle → rejected
- [x] Path outside vault / into `.claude` / generated → reject
- [x] Invalid lifecycle/type/status enum → reject
- [x] Scoped commits; docs create refreshes + commits docs-index
- [x] delete requires confirmPath + confirmSha; active → warning
- [x] merge commit failure leaves vault intact (rollback)
- [x] `updated` server-stamped
- [x] After `rules/` or `memory/` write → `syncDryRun`; apply is separate
- [x] Native `~/.claude/projects/.../memory` never in write plans

## 11. Out of scope (UI next)

- React forms / Server Actions UI
- Lifecycle promote/demote file moves (Task 4)
- Diff-preview modal chrome (Task 3)
- Dedupe assistant (Task 5)

## File index

| Ref | Path |
|-----|------|
| This contract | `docs/specs/2026-07-18-vault-crud-contract.md` |
| Sync contract | `docs/specs/2026-07-18-sync-agent-views-contract.md` |
| Write-path lib | `scripts/lib/vault-crud.mjs` |
| CLI harness | `scripts/vault-crud.mjs` |
| Docs index writer | `scripts/build-docs-index.mjs` (`writeDocsIndex`) |
| Front-matter | `scripts/lib/frontmatter.mjs` |
| Registry | `scripts/lib/luna-registry.mjs` |
| Sync apply | `scripts/lib/agent-views.mjs` |
| Tests | `tests/vault-crud/vault-crud.test.mjs` |
