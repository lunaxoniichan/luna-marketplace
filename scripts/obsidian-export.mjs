#!/usr/bin/env node
/**
 * obsidian-export.mjs — read-only Obsidian projection of a vault.
 * Design: docs/specs/2026-07-22-obsidian-vault-export.md.
 *
 * Usage:
 *   node scripts/obsidian-export.mjs --vault <id> [--dest <path>]
 *
 * Writes only under the export dir (default {vault}/.obsidian-export/, gitignored).
 * Never modifies canonical files.
 */
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportObsidianVault } from './lib/obsidian-export.mjs';

function argValue(args, name) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return null;
}

function pluginRootFromArgs(args) {
  const i = args.indexOf('--root');
  if (i >= 0 && args[i + 1]) return resolve(args[i + 1]);
  if (process.env.LUNA_PLUGIN_ROOT) return resolve(process.env.LUNA_PLUGIN_ROOT);
  return resolve(fileURLToPath(new URL('..', import.meta.url)));
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    console.log('Usage: node scripts/obsidian-export.mjs --vault <id> [--dest <path>]');
    process.exit(0);
  }
  const pluginRoot = pluginRootFromArgs(args);
  const vaultId = argValue(args, '--vault') || basename(pluginRoot);
  try {
    const out = exportObsidianVault({
      vaultId,
      pluginRoot,
      dest: argValue(args, '--dest') || undefined,
    });
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: { code: e.code || 'ERROR', message: e.message } }));
    process.exit(1);
  }
}

main();
