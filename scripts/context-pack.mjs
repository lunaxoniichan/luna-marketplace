#!/usr/bin/env node
/**
 * context-pack.mjs — preview / build rebuildable Context Pack manifests.
 * Contract: docs/specs/2026-07-20-context-pack-contract.md
 *
 * Usage:
 *   node scripts/context-pack.mjs preview --vault <id> --task "..." --type planning [--budget 4000]
 *   node scripts/context-pack.mjs build   --vault <id> --task "..." --type implementation [--budget 4000]
 *
 * Same vault wall as gateway (resolveVaultRoot). Build writes only under
 * docs/generated/context-packs/ (gitignored).
 */
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildContextPack,
  previewContextPack,
  PACK_TYPES,
} from './lib/context-pack.mjs';

function pluginRootFromArgs(args) {
  const i = args.indexOf('--root');
  if (i >= 0 && args[i + 1]) return resolve(args[i + 1]);
  if (process.env.LUNA_PLUGIN_ROOT) return resolve(process.env.LUNA_PLUGIN_ROOT);
  return resolve(fileURLToPath(new URL('..', import.meta.url)));
}

function argValue(args, name) {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  return null;
}

function usage() {
  console.log(`Usage:
  node scripts/context-pack.mjs preview --vault <id> --task <text> --type <${PACK_TYPES.join('|')}> [--budget N]
  node scripts/context-pack.mjs build   --vault <id> --task <text> --type <${PACK_TYPES.join('|')}> [--budget N]
`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (!cmd || cmd === '-h' || cmd === '--help') {
    usage();
    process.exit(0);
  }

  const pluginRoot = pluginRootFromArgs(args);
  const vaultId = argValue(args, '--vault') || basename(pluginRoot);
  const task = argValue(args, '--task') || '';
  const packType = argValue(args, '--type') || 'planning';
  const tokenBudget = Number(argValue(args, '--budget') || 4000);
  const scope = argValue(args, '--scope') || 'vault';

  try {
    if (cmd === 'preview') {
      const result = await previewContextPack({
        vaultId,
        task,
        packType,
        tokenBudget,
        scope,
        pluginRoot,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    if (cmd === 'build') {
      const result = await buildContextPack({
        vaultId,
        task,
        packType,
        tokenBudget,
        scope,
        pluginRoot,
      });
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    usage();
    process.exit(1);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: { code: e.code || 'ERROR', message: e.message } }));
    process.exit(1);
  }
}

main();
