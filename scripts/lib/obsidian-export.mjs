/**
 * Obsidian vault export — read-only projection (Phase 5 / T16).
 * Design: docs/specs/2026-07-22-obsidian-vault-export.md.
 *
 * Copies the CANONICAL markdown corpus (docs/, rules/, memory/ + protected lessons)
 * into a gitignored, rebuildable Obsidian-openable folder. Reuses the shared corpus
 * filter (`isExcludedKnowledgePath`) so generated `.claude`/`.cursor` mirrors, archives,
 * and `docs/generated/` are excluded — same corpus as dedupe / graph-memory.
 *
 * Read-only w.r.t. source: writes ONLY under the export dir; never modifies canonical
 * files and never imports edits back (Obsidian is a downstream view, not a writer).
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { resolveVaultRoot } from './vault-crud.mjs';
import { walkMarkdown } from './md-walk.mjs';
import { isExcludedKnowledgePath } from './util.mjs';

export const EXPORT_REL = '.obsidian-export';
const SOURCE_ROOTS = ['docs', 'rules', 'memory'];
const LESSONS_REL = '.claude/rules/lessons.md';

/**
 * Map a canonical source path to a visible path in the Obsidian vault. Obsidian hides
 * dot-folders, so the protected `.claude/rules/lessons.md` surfaces as `lessons.md`.
 * @param {string} rel
 */
export function visibleExportPath(rel) {
  if (rel === LESSONS_REL) return 'lessons.md';
  return rel;
}

/**
 * Build a read-only Obsidian projection of one vault.
 * @param {{ vaultId: string, pluginRoot?: string, registry?: object, dest?: string }} opts
 */
export function exportObsidianVault(opts) {
  const vaultId = String(opts.vaultId || '');
  if (!vaultId) {
    const err = new Error('vaultId required');
    err.code = 'VAULT_ID';
    throw err;
  }
  const vault = resolveVaultRoot(vaultId, { pluginRoot: opts.pluginRoot, registry: opts.registry });
  const outDir = opts.dest ? resolve(opts.dest) : join(vault.root, EXPORT_REL);

  // Rebuildable projection: drop then recreate.
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const files = [];
  const copy = (rel, abs) => {
    const outRel = visibleExportPath(rel);
    const d = join(outDir, outRel);
    mkdirSync(dirname(d), { recursive: true });
    cpSync(abs, d);
    files.push(outRel);
  };

  for (const under of SOURCE_ROOTS) {
    for (const f of walkMarkdown(vault.root, { under })) {
      if (isExcludedKnowledgePath(f.rel, f.text)) continue;
      copy(f.rel, f.abs);
    }
  }
  // Protected lessons.md is agent-owned (not excluded) — include it, remapped visible.
  const lessonsAbs = join(vault.root, LESSONS_REL);
  if (existsSync(lessonsAbs)) copy(LESSONS_REL, lessonsAbs);

  // Minimal Obsidian config so the folder opens as a vault.
  const obsDir = join(outDir, '.obsidian');
  mkdirSync(obsDir, { recursive: true });
  writeFileSync(
    join(obsDir, 'app.json'),
    JSON.stringify({ readableLineLength: true, alwaysUpdateLinks: false }, null, 2) + '\n',
    'utf8',
  );

  const manifest = {
    ok: true,
    vault_id: vault.id,
    exported_at: new Date().toISOString(),
    dest: outDir,
    file_count: files.length,
    files: files.sort(),
    // Explicit: this projection is read-only; edits are never imported back.
    writes: 'projection-only',
  };
  writeFileSync(join(outDir, 'export-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}
