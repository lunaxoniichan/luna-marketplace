#!/usr/bin/env node
/**
 * graph-memory.mjs — rebuild / query rebuildable graph-memory indexes.
 * Contract: docs/specs/2026-07-19-graph-memory-backend-contract.md
 *
 * Usage:
 *   node scripts/graph-memory.mjs rebuild --vault <id>
 *   node scripts/graph-memory.mjs status --vault <id>
 *   node scripts/graph-memory.mjs search --vault <id> --query "..."
 *   node scripts/graph-memory.mjs tool --name search_context --vault <id> --query "..."
 *
 * Same vault wall as gateway (resolveVaultRoot / buildAllowedVaultMap).
 */
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  rebuildGraphMemory,
  invokeGraphMemoryTool,
  listAllowedVaultIds,
  READ_ONLY_TOOLS,
} from './lib/graph-memory.mjs';

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
  node scripts/graph-memory.mjs rebuild --vault <id> [--root <plugin>]
  node scripts/graph-memory.mjs status --vault <id>
  node scripts/graph-memory.mjs search --vault <id> --query <text>
  node scripts/graph-memory.mjs tool --name <${[...READ_ONLY_TOOLS].join('|')}> --vault <id> [...]
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
  const ctx = { pluginRoot };

  try {
    if (cmd === 'rebuild') {
      const result = await rebuildGraphMemory({
        vaultId,
        pluginRoot,
        embed: !args.includes('--no-embed'),
      });
      console.log(
        JSON.stringify(
          {
            ok: true,
            vaultId: result.vaultId,
            path: result.path,
            status: result.index.status,
            sources: result.index.sources.length,
            chunks: result.index.chunks.length,
            facts: result.index.facts.length,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (cmd === 'status') {
      const out = invokeGraphMemoryTool('graph_memory_status', { vaultId }, ctx);
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'search') {
      const query = argValue(args, '--query') || '';
      const out = invokeGraphMemoryTool('search_context', { vaultId, query }, ctx);
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'tool') {
      const name = argValue(args, '--name');
      if (!name) {
        console.error('--name required');
        process.exit(2);
      }
      const input = {
        vaultId,
        query: argValue(args, '--query') || undefined,
        id: argValue(args, '--id') || undefined,
        source_path: argValue(args, '--source') || undefined,
      };
      const out = invokeGraphMemoryTool(name, input, ctx);
      console.log(JSON.stringify(out, null, 2));
      return;
    }

    if (cmd === 'list-vaults') {
      console.log(JSON.stringify(listAllowedVaultIds({ pluginRoot }), null, 2));
      return;
    }

    usage();
    process.exit(2);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, error: { code: e.code || 'ERROR', message: e.message } }));
    process.exit(1);
  }
}

main();
