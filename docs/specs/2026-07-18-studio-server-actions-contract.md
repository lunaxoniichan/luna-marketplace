---
title: Studio Server Actions — vault CRUD + sync boundary
scope: project
type: spec
lifecycle: official
status: active
keywords: [studio, server-actions, vault, sync, authorization]
related:
  - docs/specs/2026-07-18-vault-crud-contract.md
  - docs/specs/2026-07-18-sync-agent-views-contract.md
updated: 2026-07-19
---

# Contract — Studio Server Action ↔ lib boundary

> **Status:** ACTIVE (staff signed off 2026-07-18).
> Depends on: vault-crud (active) + sync-agent-views (active).

## 1. Purpose

Next.js Server Actions are the **only** Studio write entry. They resolve authorization
server-side, call `scripts/lib/vault-crud.mjs` / `agent-views.mjs`, and return
**JSON-safe DTOs**. Authorized vault handles never cross the wire.

## 2. Calling convention (non-negotiable)

| Client may send | Server must never accept from client |
|-----------------|--------------------------------------|
| `vaultId` (from server-rendered project list) | `pathOrId`, `root`, `vaultRoot`, `vault` |
| `relPath`, `body`, `frontmatter` | Absolute paths, `..` segments (lib also rejects) |
| `confirmPath`, `confirmSha`, `confirmSources`, `confirmShas` | Raw filesystem roots |
| `planToken` (echo of sync preview) | `force`, `skipConflictCheck`, clobber flags |

Flow:

```
UI (vaultId from RSC list)
  → Server Action validates vaultId shape
  → resolveVaultRoot(vaultId) in server scope  // outer wall
  → mutator({ vault, … })                       // WeakSet-branded handle
  → return serializable ResultDto
```

`resolveVaultRoot` uses `LUNA_PLUGIN_ROOT` + live registry. Fixtures are not writable
via actions unless registered (or treated as plugin root).

## 3. Input validation (action layer)

Before calling the lib:

- `vaultId`: non-empty string, `/^[A-Za-z0-9._-]+$/`, length ≤ 128
- `relPath`: non-empty, no `..`, no leading `/`, must match vault-crud allow prefixes (fail early with same codes)
- `frontmatter`: plain object; enums re-validated by lib after stamp
- `confirmSha` / `confirmShas`: hex sha256 (64 chars) when required
- `body`: max **512 KiB** (`BODY_TOO_LARGE`)
- Reject unknown top-level keys on action payloads (`strictKeys`) so future clobber knobs cannot sneak in
- **ctx env-gate:** `pluginRoot` / `registry` overrides only when `LUNA_VAULT_GATEWAY_TEST=1` (`CTX_FORBIDDEN` otherwise)
- **Per-vault mutex:** concurrent mutations on the same `vaultId` → `VAULT_BUSY`
- **Error normalization:** client messages redact absolute paths; truncated; no raw git stderr dumps

## 4. CRUD actions

| Action | Lib | Notes |
|--------|-----|-------|
| `vaultCreate` | `createFile` | |
| `vaultUpdate` | `updateFile` | |
| `vaultDelete` | `deleteFile` | Surface `warnings` for active docs |
| `vaultMerge` | `mergeFiles` | |
| `vaultReadSha` | `fileContentSha` | For confirmSha before delete/merge |
| `vaultWikilinks` | `listWikilinkTargets` | Read-only |

Return shape (all):

```
{ ok: true, relPath, commitSha?, warnings?, indexRefreshed?, syncPreview? }
| { ok: false, error: { code, message, … } }
```

`syncDryRun` from the lib is **not** dumped raw to the client. If present, attach a
compact `syncPreview` (see §5) so the UI can offer “Regenerate agent views”.

## 5. Sync: dry-run → diff → apply (no clobber bypass)

| Action | Behavior |
|--------|----------|
| `vaultSyncPreview` | `syncAgentViews(root, { dryRun: true })` → DTO + `planToken` |
| `vaultSyncApply` | Re-run dry-run; require `planToken` match; **refuse if `status === 'conflict'`**; only then apply |

`planToken` = sha256 of canonical summary of classified writes (path + desired sha256)
plus conflict count. If the tree changed since preview, token mismatches → `PLAN_STALE`.

**Never** expose options that skip conflict checks or write unmarked targets.
Apply path is exclusively `syncAgentViews(root)` with no force flag.

DTO fields for preview/apply:

```
{
  status, exitCode, message,
  writes: [{ path, kind, source, desiredSha256 }],  // no full bodies unless UI expands later
  conflicts: [{ path, reason }],
  orphans: [{ path, reason? }],
  adopts: number,
  noop: number,
  planToken?   // preview only
}
```

Optional later: `desiredPreview` truncated text for modal — not required for this gate.

## 6. Memory UI labels (when forms land)

- Panel A: **Canonical memory** (`memory/*.md`) — editable; feeds MCP
- Panel B: **Native session memory** — read-only link/note; not written by Studio

## 7. Library / file surface

```
scripts/lib/vault-gateway.mjs    — pure boundary (testable); vaultId-only
studio/src/lib/vault-gateway.ts  — re-export for Studio imports
studio/src/app/actions/vault.ts  — 'use server' thin wrappers
scripts/lib/vault-crud.mjs       — mutators (unchanged semantics)
scripts/lib/agent-views.mjs      — sync dry-run / apply
```

## 8. Acceptance (boundary gate — before thick React)

`npm run test:vault-gateway`

- [x] Client-shaped payload with `root` / `pathOrId` rejected at gateway
- [x] `vaultId` outside allow-list → `VAULT_UNAUTHORIZED`
- [x] CRUD success returns DTO without branded vault / without full sync bodies
- [x] `vaultSyncApply` without matching `planToken` → `PLAN_STALE`
- [x] `vaultSyncApply` when dry-run is conflict → refused (no writes)
- [x] Hermetic tests for gateway; no requirement for full form chrome

## 9. Out of scope (next UI pass)

- Full front-matter form + wikilink autocomplete chrome
- Diff modal visual design (consumes preview DTO)
- Lifecycle promote/demote (Task 4)
- Keyword dedupe (Task 5)

## File index

| Ref | Path |
|-----|------|
| This contract | `docs/specs/2026-07-18-studio-server-actions-contract.md` |
| Vault CRUD | `docs/specs/2026-07-18-vault-crud-contract.md` |
| Sync | `docs/specs/2026-07-18-sync-agent-views-contract.md` |
| Gateway | `scripts/lib/vault-gateway.mjs` |
| Studio re-export | `studio/src/lib/vault-gateway.ts` |
| Server Actions | `studio/src/app/actions/vault.ts` |
| Tests | `tests/studio/vault-gateway.test.mjs` |
