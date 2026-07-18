---
title: Fleet sync — plugin rules/ → all registry projects
scope: project
type: spec
lifecycle: official
status: active
keywords: [fleet, sync-agent-views, rules, registry, T5]
related:
  - docs/decisions/2026-07-18-fleet-rules-canonical.md
  - docs/specs/2026-07-18-sync-agent-views-contract.md
  - docs/specs/2026-07-18-studio-server-actions-contract.md
updated: 2026-07-19
---

# Contract — fleet sync (`sync-agent-views --all`)

> **Status:** ACTIVE (T5) — signed after Blocking-1/2 + T5a–c amends.
> Implements ADR Option A: `docs/decisions/2026-07-18-fleet-rules-canonical.md`.

## 1. Purpose

**Edit plugin `rules/` once → every live registered project (and the plugin itself) gets
matching generated Claude/Cursor rule views**, without clobbering hand-edits or
`*.local` / lessons / `luna.mdc`.

Per-root `sync-agent-views --root <path>` remains for dogfood/CI. Fleet mode is the
product path Studio already previews as a multi-target list.

### Customization honesty (v1 scope)

The founding goal was “apply to any coding agent **and** still allow custom per-project
rules.” v1 fleet delivers the shared half fully; project customization is **additive
only**:

| Allowed on consumers (v1) | Not in v1 |
|---------------------------|-----------|
| `lessons.md` / `lessons.mdc` | Overriding / replacing a fleet-managed rule body |
| `RULES.md` / `RULES.mdc` (stack-specific) | Project `rules/<fleet-name>.md` winning over plugin |
| `*.local.md` / `*.local.mdc` | Merge/overlay of fleet rule content |
| Extra project-only rule names under a future overlay prefix | — |

Fleet-managed generated views are **read-only on consumers**. Full override overlays
are deferred (§8); the manifest records per-file origin now so overlays are additive
later, not a redesign (§4 step 3).

## 2. Source vs targets (load-bearing)

| Role | Path | Fleet mode |
|------|------|------------|
| **Fleet source (rules bodies)** | `LUNA_PLUGIN_ROOT/rules/*.md` (or registry entry that is the plugin) | **Only** source of shared rule markdown |
| **Per-target generated views** | `<target>/.claude/rules/<name>.md`, `<target>/.cursor/rules/<name>.mdc` | Written from fleet source |
| **Per-target memory** | `<target>/memory/*.md` → `<target>/docs/generated/mcp-memory-feed.json` | Still **local** to each target (not fleeted) |
| **Protected** | lessons, RULES, `*.local`, luna.mdc | Never written (unchanged) |

### Deliberate choice — do **not** mirror plugin `rules/` into each project's `rules/`

v1 fleet writes **generated views only**. Consumer projects may keep an empty or
seed-only `rules/` for local experiments; fleet sync does not overwrite project `rules/`.

**Rationale:** one git-tracked source of truth (plugin); avoids dual-edit confusion and
cross-repo commits of identical rule bodies. Per-root `--root` on a consumer still reads
*that* tree's `rules/` (dogfood/legacy) — fleet mode ignores consumer `rules/` for shared
names.

### Studio vault tabs (consequence)

| Vault | Rules tab | Memory / Docs tabs |
|-------|-----------|--------------------|
| Plugin / kit vault | Editable — this **is** the fleet source | Full CRUD (unchanged) |
| Other registered projects | **Read-only for fleet-managed names**: notice “Managed by plugin `rules/` · edit there · Regenerate via Sync”; notice is actionable (link/route to the **plugin vault’s Rules tab**). Create only under an explicit future overlay prefix (out of scope v1) | **Full CRUD still works** — memory and docs are project-scoped; fleet read-only does **not** apply to them |

## 3. Target set

Same outer wall as vault CRUD:

1. Plugin root (`LUNA_PLUGIN_ROOT`)
2. Every **live** `registry.json` project path (`existsSync` + `realpath`)

Skip dead paths with a warn. Cap 64 targets (same as gateway preview-many).

No client-supplied roots — Studio passes `vaultIds` already on the allow-list;
CLI `--all` resolves the set server-side.

**Outer wall parity (CLI is not a weaker gate).** `--all` is a plain node script that
does **not** pass through the gateway, so it MUST apply the same confinement the gateway's
`resolveVaultRoot`/`openVault` applies: `realpath` each candidate and admit only the plugin
root + registry paths (not `existsSync` alone). Reuse the registry allow-list helper — the CLI
target resolver and the gateway resolver share one confinement path; `--all` never syncs a
root the gateway would refuse.

## 4. Operations

### CLI

```
node scripts/sync-agent-views.mjs --all [--dry-run|--check]
node scripts/sync-agent-views.mjs --all [--adopt-unmarked]
node scripts/sync-agent-views.mjs --all --commit          # opt-in; never default
node scripts/sync-agent-views.mjs --all --root <plugin>   # optional explicit plugin root
```

- `--all` + `--root <consumer>` → reject (ambiguous). `--root` alone = per-root (today).
- `--adopt-unmarked` — one-time per-target migration path (§4.1); never touches the
  protected set.
- `--commit` — opt-in consumer commits (§5); **off by default**.

### Exit codes (split apply vs check)

| Mode | `0` | `1` | `2` |
|------|-----|-----|-----|
| `--all --dry-run` / `--all --check` | Would write nothing (clean) | Would write ≥1 file on ≥1 target | Any target would conflict |
| `--all` apply (no dry-run/check) | All targets ok/noop | *(unused)* | Any target conflicted (non-conflicting targets still written) |

Dry-run/check **writes nothing** (including no manifest, no side-move of unmarked files
unless a separate explicit migrate dry-run is defined later — v1: `--adopt-unmarked`
requires apply).

### Library

```
syncAgentViewsFleet({
  pluginRoot,
  targets?,
  dryRun?,
  check?,
  adoptUnmarked?,
  commit?,          // default false
})
  → {
      results: [{ vaultId, root, ...syncResult, changedPaths?, dirty? }],
      summary: { okCount, conflictCount, writeCount, dirtyTargets[] }
    }
```

For each target:

1. Build plan with **`rulesSourceDir = pluginRoot/rules`** and **`memorySourceDir = target/memory`**.
   This requires **decoupling source from write-root** in the lib: today `buildPlan(projectRoot)`
   couples them (reads `<root>/rules` + `<root>/memory`, writes under the same `<root>`). Refactor to
   `buildPlan(writeRoot, { rulesSourceDir, memorySourceDir })` with per-root defaults preserved
   (`rulesSourceDir = writeRoot/rules`, `memorySourceDir = writeRoot/memory`) so the existing
   per-root path and its tests are unchanged.
2. Classify / write against **target** `.claude` / `.cursor` / target MCP feed
   (run migration first when `adoptUnmarked` — §4.1)
3. Manifest stays **per target** (`.luna/agent-views-manifest.json` under that root).
   Each written entry records **`origin: "plugin"`** (fleet-managed) alongside the
   existing `source` / `kind` / `sha256` fields, so a future project-overlay sync can
   add `origin: "project"` entries in the same dir without clobbering fleet files —
   overlays are a pure addition, not a manifest redesign.
4. Do **not** auto-commit (§5) unless `commit: true`

### Gateway / Studio

- `vaultSyncPreviewMany` / `vaultSyncApplyMany` gain `mode: 'fleet' | 'local'` (default
  `local` until UI flips).
- Fleet mode: dry-run/apply use `syncAgentViewsFleet` with selected vaultIds ⊆ allow-list.
- **Apply re-derivation is source-aware (load-bearing TOCTOU pin).** `vaultSyncApply` today
  re-derives the plan from the **target's own** `rules/` (`syncAgentViews(vault.root, …)`).
  Fleet apply MUST re-derive with the **same `rulesSourceDir = pluginRoot/rules`** used at
  fleet preview — not the target tree. The `planToken` binds source-rendered content
  (`desiredSha256`) **plus** target `conflicts`/`status`, so it correctly goes stale if
  **either** the plugin rules **or** the target working tree change between preview and apply.
  If fleet apply reuses the per-root re-derivation unchanged it either mismatches forever
  (PLAN_STALE) or, if the check is loosened, applies the wrong (empty/local) plan — so
  `vaultSyncApply` becomes mode/`rulesSourceDir`-aware, and the token is verified against a
  re-derivation from the identical source.
- `PLAN_STALE` / `SYNC_CONFLICT` stay per-target; UI must prompt **re-preview** on stale
  (carry-along: land the existing PLAN_STALE re-preview button with the T5 commit).
- Aggregate apply report surfaces per-target `changedPaths` / dirty state for the
  operator (Studio can show “N repos dirty — commit locally or re-run with `--commit`”).

### 4.1 Per-target migration / adopt (Gap 1 — real fleets)

First fleet sync into an **existing** project typically finds unmarked
`.claude/rules/*.md` / `.cursor/rules/*.mdc` from the old doc-init mirror model or
hand authorship. Plain no-clobber would conflict on every fleet name → abort that
target. That is every real consumer.

**N-project migration.** ⚠️ Per-root §11 of the active sync contract describes migration as a
**manual human procedure** ("move them aside, run sync, diff-compare") — there is **no**
move-aside code today; `classifyPlan` sends every unmarked target → conflict, full stop. So
`--adopt-unmarked` is **net-new automated logic** in `classifyPlan`/apply, not a reuse of an
existing primitive. Build it once and **back-port it to per-root** so the two paths don't
diverge. Behavior (scoped per target):

| Situation | Default `--all` | `--all --adopt-unmarked` |
|-----------|-----------------|--------------------------|
| Missing generated file | write | write |
| Marked + no manifest | adopt + regenerate (unchanged) | same |
| Marked + manifest match | overwrite | same |
| Marked + hash mismatch | **conflict** that target | **conflict** (never force) |
| Unmarked, name ∈ fleet plan, not protected | **conflict** that target | **migrate**: move aside → write desired → record `origin: "plugin"`; leave aside file for operator diff |
| Protected names | never touch | never touch |

**Move-aside naming:** `<path>.pre-fleet-<YYYYMMDD>` next to the file (or under
`.luna/pre-fleet/` if the sibling would collide). Never delete. Never touch
`lessons.*` / `RULES.*` / `*.local.*` / `luna.mdc`.

**Auto-load safety (intentional).** The suffix goes **after** the extension →
`core.md.pre-fleet-20260719`, which is not `*.md` / `*.mdc`, so neither Claude Code nor Cursor
auto-loads the aside file as a second rule. Do **not** use `core.pre-fleet-<DATE>.md` (that
*would* double-load). `.luna/pre-fleet/` is equally safe and keeps the rules dir clean.

**Documented outcomes (acceptance):**

1. Unmarked pre-existing fleet-named rule on a target + default `--all` → that target
   **conflicts**; other targets continue; aside files are **not** created.
2. Same fixture + `--adopt-unmarked` → target migrates (aside + write); protected set
   intact; manifest entries carry `origin: "plugin"`.
3. Migration is **idempotent** after success: second `--all` (without adopt) is clean
   noop/check-green for those paths.

`--adopt-unmarked` is available on CLI and as `adoptUnmarked` on the library/gateway.
Studio may expose it as an explicit “Adopt unmarked (one-time migrate)” confirm —
never as a silent default.

## 5. Consumer commits (Gap 2 — durability vs invasiveness)

Fleet sync writes generated views into **N target working trees**, which are typically
git-tracked there. Auto-committing into other projects’ history is invasive.

| Mode | Behavior |
|------|----------|
| **Default (write-only)** | Write files + update per-target manifest. **Never** `git commit` in consumer (or plugin) repos. Leave targets **dirty-but-intact**. Aggregate report includes `{ target, changedPaths }` / `dirtyTargets[]`. |
| **`--commit` (opt-in)** | After a successful per-target write (no conflict on that target), create one commit in that repo with message `chore(luna): sync agent views`. **No `Plan:` trailer** (derived bookkeeping — same reasoning as the PLANS.md rebuild rule). Skip commit if that target had nothing to write. Failures to commit are reported per-target; do not roll back the file writes. |

**Path-scoped staging (integrity pin).** `--commit` stages **only** that target's generated
`changedPaths` — reuse the existing `commitPaths` primitive (vault-crud), which stages explicit
paths and maps `.git/index.lock` → `VAULT_BUSY`. **Never** `git add -A` / `git commit -a`:
sweeping a consumer's unrelated in-flight work under a `chore(luna)` message is an
authorship/integrity violation and contradicts "never silently commit into other repos'
history." If the generated paths can't be isolated cleanly (e.g. already partially staged in a
conflicting index), report that target as **dirty** and **skip** its commit — do not force.

Studio / gateway default matches CLI: write-only. UI may offer an explicit “Also commit
in each target” checkbox mapped to `commit: true`.

## 6. Conflict & continue

Unchanged no-clobber rules, **per target**:

- One target conflict → that target refused; **continue** other targets
- Aggregate report: `{ okCount, conflictCount, writeCount, dirtyTargets[], results[] }`
- Never a fleet-wide force/clobber flag
- `--adopt-unmarked` only changes the unmarked-fleet-name cell in the classify table;
  it is not a force/clobber bypass for marked+hash-mismatch

## 7. Memory (explicit non-goal)

Fleet does **not** copy `memory/*.md` across projects. Memory stays project-scoped MCP feed.
Phase 3 KG may query across projects later without writing native session memory.

## 8. Acceptance (T5 gate)

- [x] `--all --dry-run` lists writes for plugin + ≥1 registry fixture/target from plugin rules;
      exit `0` when clean, `1` when would-write, `2` when any would-conflict (writes nothing)
- [x] `--all` apply: exit `0` all ok; exit `2` if any target conflicted (others still written)
- [x] Consumer project without local `rules/foo.md` still receives `.claude/rules/foo.md` from plugin
- [x] Hand-edited unmarked generated file on one target → conflict that target only; others apply
- [x] **Pre-existing-unmarked-target migration:** unmarked fleet-named rules on a target →
      default conflicts; with `--adopt-unmarked` → aside + write + `origin: "plugin"`;
      protected set untouched
- [x] **Default-dirty-no-commit:** successful `--all` apply leaves target git dirty with
      expected `changedPaths`; no new commit unless `--commit`; `--commit` uses
      `chore(luna): sync agent views` and no `Plan:` trailer
- [x] **Commit is path-scoped:** with an unrelated dirty/staged file present in the target,
      `--commit` commits **only** the generated `changedPaths` and leaves the unrelated change
      uncommitted (or skips + reports dirty); never `git add -A`
- [x] **Fleet token binds the source:** a fleet preview whose plugin `rules/` change before
      apply → `PLAN_STALE` (not a wrong-plan apply); apply re-derives from `pluginRoot/rules`,
      never the target's own `rules/`
- [x] **CLI outer-wall parity:** `--all` admits only `realpath`-confined plugin + registry
      roots (a registry entry outside the allow-list is refused, same as the gateway)
- [x] Manifest fleet writes record `origin: "plugin"`
- [x] `*.local` / lessons / luna.mdc untouched on all targets
- [x] Memory feed still built from **each target's** `memory/`
- [x] Studio Rules tab: editable on plugin; read-only notice elsewhere with route to plugin
      Rules tab; Memory/Docs CRUD still works on consumer vaults
- [x] Hermetic tests; SyncPreviewPanel fleet mode uses `mode: 'fleet'`
- [ ] Carry-alongs land with T5 commit: PLAN_STALE re-preview button; `docs/PLANS.md` rebuild
      (no `Plan:` trailer on that bookkeeping commit)
- [x] No Playwright required for this gate

## 9. Out of scope

- Project-local rule overlays / merge after fleet (future — enabled by `origin` field)
- Overriding a fleet rule body from a consumer (v1 is additive customization only)
- Mirroring plugin `rules/` into consumer `rules/` git trees
- Silent auto-commit into consumer repos (opt-in `--commit` only)
- Phase 3 graph memory ingestion
- Playwright VaultWorkspace smoke (carry-along, still deferred)
- T7 arch-doc front-matter

## File index

| Ref | Path |
|-----|------|
| This contract | `docs/specs/2026-07-19-fleet-sync-contract.md` |
| ADR Option A | `docs/decisions/2026-07-18-fleet-rules-canonical.md` |
| Per-root sync | `docs/specs/2026-07-18-sync-agent-views-contract.md` |
| agent-views lib | `scripts/lib/agent-views.mjs` |
| fleet sync lib | `scripts/lib/fleet-sync.mjs` |
| CLI | `scripts/sync-agent-views.mjs` |
| Gateway | `scripts/lib/vault-gateway.mjs` |
| Studio sync UI | `studio/src/components/SyncPreviewPanel.tsx` |
| Studio vault tabs | `studio/src/components/VaultWorkspace.tsx` |
